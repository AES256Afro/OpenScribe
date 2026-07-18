const PLAUD_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

interface PlaudEnvelope { status: number; msg?: string }
interface OtpSendResponse extends PlaudEnvelope { token?: string; data?: { domains?: { api?: string } } }
interface OtpLoginResponse extends PlaudEnvelope { access_token?: string; data?: { access_token?: string } }
interface Workspace { workspace_id: string; workspace_type: string }
interface WorkspaceListResponse extends PlaudEnvelope { data?: { workspaces?: Workspace[] } }
interface WorkspaceTokenResponse extends PlaudEnvelope { data?: { workspace_token?: string } }
export interface PlaudRecording {
  id: string
  filename: string
  filesize: number
  duration: number
  start_time: number
  end_time: number
  serial_number: string
}
interface RecordingsResponse extends PlaudEnvelope { data_file_list?: PlaudRecording[]; data_file_total?: number }
interface TempUrlResponse extends PlaudEnvelope { temp_url?: string; temp_url_opus?: string }

function safeApiBase(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || (url.hostname !== 'plaud.ai' && !url.hostname.endsWith('.plaud.ai'))) throw new Error('Plaud returned an invalid regional API address.')
  return url.origin
}

async function json<T extends PlaudEnvelope>(response: Response): Promise<T> {
  const text = await response.text()
  let body: T
  try { body = JSON.parse(text) as T } catch { throw new Error(`Plaud returned an unreadable response (${response.status}).`) }
  if (!response.ok || body.status !== 0) throw new Error(body.msg || `Plaud request failed (${response.status}).`)
  return body
}

export async function sendPlaudCode(email: string, apiBase = 'https://api.plaud.ai', redirects = 0): Promise<{ otpToken: string; apiBase: string }> {
  if (redirects > 3) throw new Error('Plaud sent too many regional redirects.')
  const response = await fetch(`${safeApiBase(apiBase)}/auth/otp-send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': PLAUD_USER_AGENT }, body: JSON.stringify({ username: email }) })
  const text = await response.text()
  let body: OtpSendResponse
  try { body = JSON.parse(text) as OtpSendResponse } catch { throw new Error('Plaud returned an unreadable sign-in response.') }
  if (body.status === -302 && body.data?.domains?.api) return sendPlaudCode(email, safeApiBase(body.data.domains.api), redirects + 1)
  if (!response.ok || body.status !== 0 || !body.token) throw new Error(body.msg || 'Plaud could not send the verification code.')
  return { otpToken: body.token, apiBase: safeApiBase(apiBase) }
}

export async function verifyPlaudCode(code: string, otpToken: string, apiBase: string) {
  const body = await json<OtpLoginResponse>(await fetch(`${safeApiBase(apiBase)}/auth/otp-login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': PLAUD_USER_AGENT }, body: JSON.stringify({ code, token: otpToken }) }))
  const accessToken = body.access_token ?? body.data?.access_token
  if (!accessToken) throw new Error('Plaud accepted the code but returned no access token.')
  return accessToken
}

export class PlaudClient {
  private workspaceToken = ''
  constructor(private userToken: string, private apiBase: string, private workspaceId?: string) { this.apiBase = safeApiBase(apiBase) }

  private headers(token: string) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': PLAUD_USER_AGENT } }
  async connectWorkspace() {
    if (!this.workspaceId) {
      const body = await json<WorkspaceListResponse>(await fetch(`${this.apiBase}/team-app/workspaces/list?need_personal_workspace=true`, { headers: this.headers(this.userToken) }))
      const workspaces = body.data?.workspaces ?? []
      const selected = workspaces.find((item) => item.workspace_type === '0') ?? workspaces[0]
      if (!selected) throw new Error('No Plaud workspace was found for this account.')
      this.workspaceId = selected.workspace_id
    }
    const body = await json<WorkspaceTokenResponse>(await fetch(`${this.apiBase}/user-app/auth/workspace/token/${encodeURIComponent(this.workspaceId)}`, { method: 'POST', headers: this.headers(this.userToken), body: '{}' }))
    if (!body.data?.workspace_token) throw new Error('Plaud returned no workspace token.')
    this.workspaceToken = body.data.workspace_token
    return this.workspaceId
  }

  private async request<T extends PlaudEnvelope>(path: string) {
    if (!this.workspaceToken) await this.connectWorkspace()
    return json<T>(await fetch(`${this.apiBase}${path}`, { headers: this.headers(this.workspaceToken) }))
  }
  async listRecordings() {
    const result: PlaudRecording[] = []
    for (let skip = 0; skip < 1000; skip += 100) {
      const params = new URLSearchParams({ skip: String(skip), limit: '100', is_trash: '0', sort_by: 'edit_time', is_desc: 'true' })
      const body = await this.request<RecordingsResponse>(`/file/simple/web?${params}`)
      const page = body.data_file_list ?? []
      result.push(...page)
      if (page.length < 100) break
    }
    return result
  }
  async download(recordingId: string) {
    const body = await this.request<TempUrlResponse>(`/file/temp-url/${encodeURIComponent(recordingId)}?is_opus=0`)
    if (!body.temp_url) throw new Error('Plaud returned no download URL for this recording.')
    const response = await fetch(body.temp_url)
    if (!response.ok) throw new Error(`Recording download failed (${response.status}).`)
    return Buffer.from(await response.arrayBuffer())
  }
}
