import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Store } from './store'
import { analyzeTranscript, transcribeLocal, transcribeOpenAI } from './providers'
import { startCompanion } from './companion'
import { PlaudClient, sendPlaudCode, verifyPlaudCode } from './plaud'

const store = new Store()
let window: BrowserWindow | null = null
let pendingPlaudOtp: { email: string; otpToken: string; apiBase: string } | null = null

function createWindow() {
  window = new BrowserWindow({ width: 1320, height: 840, minWidth: 960, minHeight: 650, backgroundColor: '#f5f2eb', titleBarStyle: 'hiddenInset', webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: true } })
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  await store.load(); createWindow(); startCompanion(store, () => window?.webContents.send('notes:changed'))
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

ipcMain.handle('notes:list', () => store.listNotes())
ipcMain.handle('notes:import', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'webm', 'ogg', 'aac', 'flac', 'mp4'] }] })
  if (result.canceled) return null
  const source = result.filePaths[0], id = randomUUID(), now = new Date().toISOString(), target = path.join(store.recordingsDir, `${id}${path.extname(source)}`)
  await copyFile(source, target)
  return store.putNote({ id, title: path.basename(source, path.extname(source)), createdAt: now, updatedAt: now, audioPath: target, source: 'local', transcript: '', summary: '', status: 'imported' })
})
ipcMain.handle('notes:delete', (_event, id: string) => store.deleteNote(id))
ipcMain.handle('notes:reveal', (_event, id: string) => { const note = store.getNote(id); if (note?.audioPath) shell.showItemInFolder(note.audioPath) })
ipcMain.handle('notes:transcribe', async (_event, id: string) => {
  const note = store.getNote(id); if (!note?.audioPath) throw new Error('This note has no audio file.')
  note.status = 'transcribing'; note.error = undefined; await store.putNote(note)
  try {
    const settings = store.getSettings(), secrets = store.getSecrets()
    note.transcript = settings.transcriptionMode === 'local' ? await transcribeLocal(note.audioPath, settings) : await transcribeOpenAI(note.audioPath, settings, secrets.openAiApiKey)
    note.status = 'transcribed'
  } catch (error) { note.status = 'error'; note.error = error instanceof Error ? error.message : 'Transcription failed' }
  note.updatedAt = new Date().toISOString(); return store.putNote(note)
})
ipcMain.handle('notes:analyze', async (_event, id: string) => {
  const note = store.getNote(id); if (!note?.transcript) throw new Error('Transcribe this recording first.')
  note.status = 'analyzing'; note.error = undefined; await store.putNote(note)
  try {
    const settings = store.getSettings(), secrets = store.getSecrets()
    const isOpenAI = settings.analysisMode === 'openai-responses' && settings.analysisBaseUrl.startsWith('https://api.openai.com')
    note.summary = await analyzeTranscript(note, settings, secrets.analysisApiKey || (isOpenAI ? secrets.openAiApiKey : '')); note.status = 'ready'
  }
  catch (error) { note.status = 'error'; note.error = error instanceof Error ? error.message : 'Analysis failed' }
  note.updatedAt = new Date().toISOString(); return store.putNote(note)
})
ipcMain.handle('settings:get', () => store.getSettings())
ipcMain.handle('settings:save', (_event, update) => store.updateSettings(update))
ipcMain.handle('app:open-external', (_event, value: string) => {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('Only secure web links can be opened.')
  return shell.openExternal(url.toString())
})
ipcMain.handle('plaud:send-code', async (_event, email: string) => {
  const result = await sendPlaudCode(email.trim())
  pendingPlaudOtp = { email: email.trim(), ...result }
  return { apiBase: result.apiBase }
})
ipcMain.handle('plaud:verify-code', async (_event, code: string) => {
  if (!pendingPlaudOtp) throw new Error('Request a new Plaud verification code first.')
  const accessToken = await verifyPlaudCode(code.trim(), pendingPlaudOtp.otpToken, pendingPlaudOtp.apiBase)
  const settings = await store.setPlaudConnection(accessToken, pendingPlaudOtp.email, pendingPlaudOtp.apiBase)
  pendingPlaudOtp = null
  return settings
})
ipcMain.handle('plaud:disconnect', () => store.disconnectPlaud())
ipcMain.handle('plaud:sync', async () => {
  const connection = store.getPlaudConnection()
  if (!connection.token) throw new Error('Connect your Plaud account in Settings first.')
  const client = new PlaudClient(connection.token, connection.apiBase, connection.workspaceId)
  const workspaceId = await client.connectWorkspace()
  if (workspaceId !== connection.workspaceId) await store.setPlaudWorkspaceId(workspaceId)
  const recordings = await client.listRecordings()
  let imported = 0, skipped = 0
  for (const recording of recordings) {
    if (store.getNoteByRemoteId(recording.id)) { skipped++; continue }
    const bytes = await client.download(recording.id)
    const id = randomUUID(), target = path.join(store.recordingsDir, `${id}.mp3`)
    await writeFile(target, bytes)
    const timestamp = recording.start_time ? new Date(recording.start_time).toISOString() : new Date().toISOString()
    await store.putNote({
      id,
      remoteId: recording.id,
      source: 'plaud',
      title: recording.filename || `Plaud recording ${imported + 1}`,
      createdAt: timestamp,
      updatedAt: new Date().toISOString(),
      audioPath: target,
      durationMs: recording.duration,
      transcript: '',
      summary: '',
      status: 'imported'
    })
    imported++
    window?.webContents.send('notes:changed')
  }
  return { imported, skipped }
})
