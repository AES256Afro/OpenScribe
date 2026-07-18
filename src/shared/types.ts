export type NoteStatus = 'imported' | 'transcribing' | 'transcribed' | 'analyzing' | 'ready' | 'error'

export interface Note {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  sourceUrl?: string
  audioPath?: string
  remoteId?: string
  source?: 'local' | 'plaud' | 'browser'
  durationMs?: number
  transcript: string
  summary: string
  status: NoteStatus
  error?: string
}

export interface PublicSettings {
  transcriptionMode: 'local' | 'openai'
  transcriptionModel: string
  localWhisperExecutable: string
  localWhisperModel: string
  analysisMode: 'openai-responses' | 'openai-compatible' | 'anthropic' | 'gemini' | 'local-model'
  analysisBaseUrl: string
  analysisModel: string
  analysisPrompt: string
  hasOpenAiKey: boolean
  hasAnalysisKey: boolean
  companionToken: string
  companionPort: number
  plaudConnected: boolean
  plaudEmail: string
  plaudApiBase: string
}

export interface SettingsUpdate extends Omit<PublicSettings, 'hasOpenAiKey' | 'hasAnalysisKey' | 'companionToken' | 'companionPort' | 'plaudConnected' | 'plaudEmail' | 'plaudApiBase'> {
  openAiApiKey?: string
  analysisApiKey?: string
}

export interface DesktopApi {
  listNotes(): Promise<Note[]>
  importAudio(): Promise<Note | null>
  deleteNote(id: string): Promise<void>
  transcribe(id: string): Promise<Note>
  analyze(id: string): Promise<Note>
  getSettings(): Promise<PublicSettings>
  saveSettings(update: SettingsUpdate): Promise<PublicSettings>
  revealAudio(id: string): Promise<void>
  sendPlaudCode(email: string): Promise<{ apiBase: string }>
  verifyPlaudCode(code: string): Promise<PublicSettings>
  syncPlaud(): Promise<{ imported: number; skipped: number }>
  disconnectPlaud(): Promise<PublicSettings>
  openExternal(url: string): Promise<void>
}
