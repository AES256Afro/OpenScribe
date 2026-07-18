import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Note, PublicSettings, SettingsUpdate } from '../shared/types'

interface StoredSettings {
  transcriptionMode: 'local' | 'openai'
  transcriptionModel: string
  localWhisperExecutable: string
  localWhisperModel: string
  analysisMode: 'openai-responses' | 'openai-compatible' | 'anthropic' | 'gemini' | 'local-model'
  analysisBaseUrl: string
  analysisModel: string
  analysisPrompt: string
  encryptedOpenAiKey?: string
  encryptedAnalysisKey?: string
  encryptedPlaudToken?: string
  plaudEmail?: string
  plaudApiBase?: string
  plaudWorkspaceId?: string
  companionToken: string
  companionPort: number
}

interface Database { notes: Note[]; settings: StoredSettings }

const defaults = (): Database => ({
  notes: [],
  settings: {
    transcriptionMode: 'local',
    transcriptionModel: 'gpt-4o-mini-transcribe',
    localWhisperExecutable: 'whisper-cli',
    localWhisperModel: '',
    analysisMode: 'local-model',
    analysisBaseUrl: 'http://127.0.0.1:11434/v1',
    analysisModel: 'llama3.2',
    analysisPrompt: 'Turn this transcript into concise meeting notes with a summary, key points, decisions, and action items. Preserve names and important details. Do not invent facts.',
    companionToken: randomUUID(),
    companionPort: 43110
  }
})

export class Store {
  private db: Database = defaults()
  private get filePath() { return path.join(app.getPath('userData'), 'localscribe.json') }
  get recordingsDir() { return path.join(app.getPath('userData'), 'recordings') }

  async load() {
    await mkdir(this.recordingsDir, { recursive: true })
    try {
      this.db = { ...defaults(), ...JSON.parse(await readFile(this.filePath, 'utf8')) }
      this.db.settings = { ...defaults().settings, ...this.db.settings }
    } catch { await this.save() }
  }

  private async save() { await writeFile(this.filePath, JSON.stringify(this.db, null, 2), 'utf8') }
  listNotes() { return [...this.db.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  getNote(id: string) { return this.db.notes.find((note) => note.id === id) }
  getNoteByRemoteId(remoteId: string) { return this.db.notes.find((note) => note.remoteId === remoteId) }
  async putNote(note: Note) {
    const index = this.db.notes.findIndex((item) => item.id === note.id)
    if (index >= 0) this.db.notes[index] = note
    else this.db.notes.push(note)
    await this.save()
    return note
  }
  async deleteNote(id: string) { this.db.notes = this.db.notes.filter((note) => note.id !== id); await this.save() }

  private encrypt(value: string) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is unavailable on this computer.')
    return safeStorage.encryptString(value).toString('base64')
  }
  private decrypt(value?: string) { return value ? safeStorage.decryptString(Buffer.from(value, 'base64')) : '' }
  getSecrets() { return { openAiApiKey: this.decrypt(this.db.settings.encryptedOpenAiKey), analysisApiKey: this.decrypt(this.db.settings.encryptedAnalysisKey) } }
  getSettings(): PublicSettings {
    const { encryptedOpenAiKey, encryptedAnalysisKey, encryptedPlaudToken, plaudWorkspaceId: _workspace, ...settings } = this.db.settings
    return {
      ...settings,
      plaudEmail: settings.plaudEmail ?? '',
      plaudApiBase: settings.plaudApiBase ?? 'https://api.plaud.ai',
      plaudConnected: Boolean(encryptedPlaudToken),
      hasOpenAiKey: Boolean(encryptedOpenAiKey),
      hasAnalysisKey: Boolean(encryptedAnalysisKey)
    }
  }
  async updateSettings(update: SettingsUpdate) {
    const { openAiApiKey, analysisApiKey, ...publicUpdate } = update
    this.db.settings = { ...this.db.settings, ...publicUpdate }
    if (openAiApiKey?.trim()) this.db.settings.encryptedOpenAiKey = this.encrypt(openAiApiKey.trim())
    if (analysisApiKey?.trim()) this.db.settings.encryptedAnalysisKey = this.encrypt(analysisApiKey.trim())
    await this.save()
    return this.getSettings()
  }

  getPlaudConnection() {
    return {
      token: this.decrypt(this.db.settings.encryptedPlaudToken),
      email: this.db.settings.plaudEmail ?? '',
      apiBase: this.db.settings.plaudApiBase ?? 'https://api.plaud.ai',
      workspaceId: this.db.settings.plaudWorkspaceId
    }
  }
  async setPlaudConnection(token: string, email: string, apiBase: string, workspaceId?: string) {
    this.db.settings.encryptedPlaudToken = this.encrypt(token)
    this.db.settings.plaudEmail = email
    this.db.settings.plaudApiBase = apiBase
    if (workspaceId) this.db.settings.plaudWorkspaceId = workspaceId
    await this.save()
    return this.getSettings()
  }
  async setPlaudWorkspaceId(workspaceId: string) { this.db.settings.plaudWorkspaceId = workspaceId; await this.save() }
  async disconnectPlaud() {
    delete this.db.settings.encryptedPlaudToken
    delete this.db.settings.plaudWorkspaceId
    await this.save()
    return this.getSettings()
  }
}
