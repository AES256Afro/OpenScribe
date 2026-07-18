import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/types'

const api: DesktopApi = {
  listNotes: () => ipcRenderer.invoke('notes:list'),
  importAudio: () => ipcRenderer.invoke('notes:import'),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  transcribe: (id) => ipcRenderer.invoke('notes:transcribe', id),
  analyze: (id) => ipcRenderer.invoke('notes:analyze', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (update) => ipcRenderer.invoke('settings:save', update),
  revealAudio: (id) => ipcRenderer.invoke('notes:reveal', id),
  sendPlaudCode: (email) => ipcRenderer.invoke('plaud:send-code', email),
  verifyPlaudCode: (code) => ipcRenderer.invoke('plaud:verify-code', code),
  syncPlaud: () => ipcRenderer.invoke('plaud:sync'),
  disconnectPlaud: () => ipcRenderer.invoke('plaud:disconnect'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url)
}
contextBridge.exposeInMainWorld('localscribe', api)
ipcRenderer.on('notes:changed', () => window.dispatchEvent(new Event('notes:changed')))
