import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioLines, Bot, ChevronRight, CloudDownload, FileAudio, FolderOpen, Import, LoaderCircle, Settings, Sparkles, Trash2 } from 'lucide-react'
import type { Note, PublicSettings, SettingsUpdate } from '../shared/types'
import './style.css'

declare global { interface Window { localscribe: import('../shared/types').DesktopApi } }

const date = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
const fileUrl = (value: string) => {
  const normalized = value.replace(/\\/g, '/')
  const encoded = normalized.split('/').map((part) => encodeURIComponent(part).replace(/%3A/gi, ':')).join('/')
  return `${normalized.startsWith('/') ? 'file://' : 'file:///'}${encoded}`
}

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<PublicSettings>()
  const [syncMessage, setSyncMessage] = useState('')
  const selected = useMemo(() => notes.find((note) => note.id === selectedId), [notes, selectedId])
  const refresh = async (pick?: string) => {
    const next = await window.localscribe.listNotes()
    setNotes(next)
    setSelectedId(pick ?? selectedId ?? next[0]?.id)
  }
  useEffect(() => {
    refresh()
    window.localscribe.getSettings().then(setSettings)
    const handler = () => refresh()
    window.addEventListener('notes:changed', handler)
    return () => window.removeEventListener('notes:changed', handler)
  }, [])
  const importAudio = async () => { const note = await window.localscribe.importAudio(); if (note) await refresh(note.id) }
  const action = async (fn: () => Promise<Note>) => { setBusy(true); const note = await fn(); await refresh(note.id); setBusy(false) }
  const syncPlaud = async () => {
    if (!settings?.plaudConnected) { setSettingsOpen(true); return }
    setBusy(true); setSyncMessage('Syncing Plaud…')
    try {
      const result = await window.localscribe.syncPlaud()
      await refresh()
      setSyncMessage(result.imported ? `Imported ${result.imported} recording${result.imported === 1 ? '' : 's'}.` : 'Plaud is up to date.')
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Plaud sync failed.') }
    finally { setBusy(false); setTimeout(() => setSyncMessage(''), 5000) }
  }
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark"><AudioLines size={20}/></span><span>OpenScribe</span></div>
      <button className="primary" onClick={importAudio}><Import size={17}/> Import local audio</button>
      <button className="syncButton" disabled={busy} onClick={syncPlaud}>{busy ? <LoaderCircle className="spin" size={16}/> : <CloudDownload size={16}/>} {settings?.plaudConnected ? 'Optional Plaud sync' : 'Device connection'}</button>
      {syncMessage && <div className="syncMessage">{syncMessage}</div>}
      <div className="sectionLabel">Recordings <span>{notes.length}</span></div>
      <div className="noteList">{notes.map((note) => <button key={note.id} className={`noteRow ${note.id === selectedId ? 'active' : ''}`} onClick={() => { setSelectedId(note.id); setSettingsOpen(false) }}>
        <span className="noteIcon"><FileAudio size={17}/></span><span className="noteMeta"><strong>{note.title}</strong><small>{date(note.createdAt)} · {note.status}</small></span><ChevronRight size={15}/>
      </button>)}</div>
      <button className="settingsButton" onClick={() => setSettingsOpen(true)}><Settings size={17}/> Settings</button>
    </aside>
    <main>{settingsOpen ? <SettingsView onDone={async () => { setSettings(await window.localscribe.getSettings()); setSettingsOpen(false) }}/> : selected ? <NoteView note={selected} busy={busy} onTranscribe={() => action(() => window.localscribe.transcribe(selected.id))} onAnalyze={() => action(() => window.localscribe.analyze(selected.id))} onDelete={async () => { await window.localscribe.deleteNote(selected.id); setSelectedId(undefined); await refresh() }}/> : <Empty onImport={importAudio}/>}</main>
  </div>
}

function Empty({ onImport }: { onImport: () => void }) {
  return <div className="empty"><div className="emptyArt"><AudioLines size={38}/></div><p className="eyebrow">LOCAL FIRST · YOUR AUDIO, YOUR DATA</p><h1>Turn recordings into<br/>useful notes.</h1><p>Import an audio file, transcribe it locally or with your own key, then choose which AI receives the raw transcript.</p><button className="primary large" onClick={onImport}><Import size={18}/> Choose an audio file</button></div>
}

function NoteView({ note, busy, onTranscribe, onAnalyze, onDelete }: { note: Note; busy: boolean; onTranscribe: () => void; onAnalyze: () => void; onDelete: () => void }) {
  return <div className="page"><header><div><p className="eyebrow">{note.source === 'plaud' ? 'OPTIONAL PLAUD IMPORT' : 'LOCAL RECORDING'} · {date(note.createdAt)}</p><h1>{note.title}</h1></div><div className="headerActions">{note.audioPath && <button className="ghost" onClick={() => window.localscribe.revealAudio(note.id)}><FolderOpen size={16}/> Show file</button>}<button className="iconDanger" onClick={onDelete} title="Delete"><Trash2 size={17}/></button></div></header>
    {note.error && <div className="error">{note.error}</div>}
    {note.audioPath && <div className="player"><div><strong>{note.source === 'plaud' ? 'NotePin S recording' : 'Local recording'}</strong><small>{note.durationMs ? `${Math.max(1, Math.round(note.durationMs / 60000))} min` : 'Ready to play'}</small></div><audio controls preload="metadata" src={fileUrl(note.audioPath)}/></div>}
    <div className="actionBar"><button className="primary" disabled={busy || !note.audioPath} onClick={onTranscribe}>{busy && note.status === 'transcribing' ? <LoaderCircle className="spin" size={17}/> : <AudioLines size={17}/>} {note.transcript ? 'Transcribe again' : 'Transcribe'}</button><button className="secondary" disabled={busy || !note.transcript} onClick={onAnalyze}>{busy && note.status === 'analyzing' ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>} Send transcript to AI</button></div>
    <section className="contentGrid"><article className="paper summary"><div className="paperTitle"><Bot size={17}/> AI notes</div>{note.summary ? <div className="prose">{note.summary}</div> : <p className="placeholder">Your selected provider’s notes will appear here.</p>}</article><article className="paper"><div className="paperTitle"><FileAudio size={17}/> Raw transcript</div>{note.transcript ? <div className="prose transcript">{note.transcript}</div> : <p className="placeholder">Transcribe the recording first. Nothing is sent to an AI notes provider until you click the button.</p>}</article></section>
  </div>
}

function SettingsView({ onDone }: { onDone: () => void }) {
  const [settings, setSettings] = useState<PublicSettings>()
  const [openAiApiKey, setOpenAiApiKey] = useState('')
  const [analysisApiKey, setAnalysisApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [transferMethod, setTransferMethod] = useState('local')
  const [plaudEmail, setPlaudEmail] = useState('')
  const [plaudCode, setPlaudCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [plaudMessage, setPlaudMessage] = useState('')
  const [plaudBusy, setPlaudBusy] = useState(false)
  useEffect(() => { window.localscribe.getSettings().then((value) => { setSettings(value); setPlaudEmail(value.plaudEmail) }) }, [])
  if (!settings) return null
  const field = <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => setSettings({ ...settings, [key]: value })
  const open = (url: string) => window.localscribe.openExternal(url)
  const save = async () => {
    const update = { ...settings, openAiApiKey, analysisApiKey } as unknown as SettingsUpdate
    setSettings(await window.localscribe.saveSettings(update)); setOpenAiApiKey(''); setAnalysisApiKey(''); setSaved(true); setTimeout(() => setSaved(false), 1500)
  }
  const chooseProvider = (mode: PublicSettings['analysisMode']) => {
    const presets = {
      'openai-responses': ['https://api.openai.com/v1', 'gpt-5.6-terra'],
      anthropic: ['https://api.anthropic.com/v1', 'claude-sonnet-4-6'],
      gemini: ['https://generativelanguage.googleapis.com/v1beta', 'gemini-3.5-flash'],
      'openai-compatible': ['https://openrouter.ai/api/v1', 'openai/gpt-5.6-terra'],
      'local-model': ['http://127.0.0.1:11434/v1', 'llama3.2']
    } as const
    setSettings({ ...settings, analysisMode: mode, analysisBaseUrl: presets[mode][0], analysisModel: presets[mode][1] })
  }
  const providerHelp = settings.analysisMode === 'anthropic' ? ['Get Claude API key', 'https://console.anthropic.com/settings/keys'] : settings.analysisMode === 'gemini' ? ['Get Gemini API key', 'https://aistudio.google.com/apikey'] : settings.analysisMode === 'openai-compatible' ? ['Get OpenRouter API key', 'https://openrouter.ai/settings/keys'] : settings.analysisMode === 'local-model' ? ['Install Ollama', 'https://ollama.com/download'] : ['Get OpenAI API key', 'https://platform.openai.com/api-keys']
  const sendCode = async () => { setPlaudBusy(true); setPlaudMessage(''); try { await window.localscribe.sendPlaudCode(plaudEmail); setOtpSent(true); setPlaudMessage('Plaud sent a verification code to your email.') } catch (error) { setPlaudMessage(error instanceof Error ? error.message : 'Could not request a code.') } finally { setPlaudBusy(false) } }
  const verifyCode = async () => { setPlaudBusy(true); setPlaudMessage(''); try { const next = await window.localscribe.verifyPlaudCode(plaudCode); setSettings(next); setPlaudMessage('Plaud account connected. Cloud sync remains optional.') } catch (error) { setPlaudMessage(error instanceof Error ? error.message : 'Could not verify the code.') } finally { setPlaudBusy(false) } }
  const syncNow = async () => { setPlaudBusy(true); try { const result = await window.localscribe.syncPlaud(); setPlaudMessage(result.imported ? `Imported ${result.imported} recording${result.imported === 1 ? '' : 's'}.` : 'Recordings are up to date.') } catch (error) { setPlaudMessage(error instanceof Error ? error.message : 'Sync failed.') } finally { setPlaudBusy(false) } }

  return <div className="page settingsPage"><header><div><p className="eyebrow">CONNECTIONS & PROVIDERS</p><h1>Settings</h1></div></header>
    <section className="settingsCard"><div className="cardHeading"><div><h2>Audio source</h2><p>Local-only is the default. Plaud access is never required.</p></div><span className="localBadge">Local first</span></div>
      <div className="setupPath"><span>1 Get the audio</span><b>›</b><span>2 Play it locally</span><b>›</b><span>3 Transcribe</span></div>
      <label>Import or device method<select value={transferMethod} onChange={(e) => setTransferMethod(e.target.value)}><option value="local">Local file import — no Plaud services</option><option value="bluetooth">NotePin S Bluetooth / Wi-Fi — experimental research path</option><option value="usb">NotePin S USB cable — unsupported by device</option><option value="cloud">Optional Plaud account fallback</option></select></label>
      {transferMethod === 'local' && <div className="infoBox"><strong>Clean path</strong><span>Use Import local audio in the sidebar. Playback, storage, and local Whisper stay on this computer.</span></div>}
      {transferMethod === 'bluetooth' && <div className="warningBox"><strong>No open desktop transfer protocol is currently available.</strong><span>NotePin S uses BLE plus a proprietary Wi-Fi Fast Transfer handshake. OpenScribe will keep this as an experimental adapter target; it will not route through Plaud Cloud and call it Bluetooth.</span><button className="textLink" onClick={() => open('https://github.com/Plaud-AI/plaud-sdk-public')}>Inspect Plaud’s mobile-only SDK ↗</button></div>}
      {transferMethod === 'usb' && <div className="warningBox"><strong>NotePin S does not expose recordings over USB.</strong><span>The cable charges the device. Current NotePin S firmware provides no mounted audio storage to Windows, macOS, or Linux.</span><button className="textLink" onClick={() => open('https://support.plaud.ai/hc/en-us/articles/53788775968409-Can-I-access-Plaud-NotePin-S-recordings-by-connecting-to-a-PC-via-USB')}>Read the device notice ↗</button></div>}
      {transferMethod === 'cloud' && <div className="optionalPanel"><p><strong>Optional fallback:</strong> this sends requests to Plaud only when you explicitly connect or sync.</p>{settings.plaudConnected ? <div className="connectionPanel"><div><strong>{settings.plaudEmail || 'Plaud account'}</strong><small>{settings.plaudApiBase}</small></div><button className="secondary" disabled={plaudBusy} onClick={syncNow}>{plaudBusy ? <LoaderCircle className="spin" size={16}/> : <CloudDownload size={16}/>} Sync now</button><button className="ghost" onClick={async () => setSettings(await window.localscribe.disconnectPlaud())}>Disconnect</button></div> : <div className="connectionForm"><label>Plaud account email<input type="email" value={plaudEmail} placeholder="you@example.com" onChange={(e) => setPlaudEmail(e.target.value)}/></label><button className="secondary inlineButton" disabled={plaudBusy || !plaudEmail} onClick={sendCode}>Send verification code</button>{otpSent && <><label>6-digit verification code<input inputMode="numeric" value={plaudCode} placeholder="123456" onChange={(e) => setPlaudCode(e.target.value)}/></label><button className="primary inlineButton" disabled={plaudBusy || !plaudCode} onClick={verifyCode}>Sign in to Plaud</button></>}<button className="textLink" onClick={() => open('https://web.plaud.ai')}>Open Plaud Web ↗</button></div>}{plaudMessage && <p className="statusMessage">{plaudMessage}</p>}</div>}
    </section>

    <section className="settingsCard"><h2>Transcription provider</h2><p>Convert audio to raw text. AI notes are a separate, deliberate step.</p><div className="setupPath"><span>1 Choose Whisper</span><b>›</b><span>2 Add key or model</span><b>›</b><span>3 Transcribe</span></div><label>Whisper option<select value={settings.transcriptionMode} onChange={(e) => field('transcriptionMode', e.target.value as 'local'|'openai')}><option value="local">Local whisper.cpp — private, no API fee</option><option value="openai">OpenAI Whisper / Transcribe API</option></select></label>
      {settings.transcriptionMode === 'openai' ? <><div className="fieldHelp">Requires one OpenAI Platform API key. <button className="textLink" onClick={() => open('https://platform.openai.com/api-keys')}>Create key ↗</button></div><label>Transcription model<input value={settings.transcriptionModel} onChange={(e) => field('transcriptionModel', e.target.value)}/></label><label>OpenAI API key<input type="password" value={openAiApiKey} placeholder={settings.hasOpenAiKey ? 'Saved securely — enter to replace' : 'Paste a new API key'} onChange={(e) => setOpenAiApiKey(e.target.value)}/></label></> : <><div className="fieldHelp">Install whisper.cpp and download a GGML model. <button className="textLink" onClick={() => open('https://github.com/ggml-org/whisper.cpp')}>Setup guide ↗</button></div><label>whisper.cpp executable<input value={settings.localWhisperExecutable} onChange={(e) => field('localWhisperExecutable', e.target.value)}/></label><label>Whisper model path<input value={settings.localWhisperModel} placeholder="C:\\models\\ggml-large-v3-turbo.bin" onChange={(e) => field('localWhisperModel', e.target.value)}/></label></>}
    </section>

    <section className="settingsCard"><h2>AI notes provider</h2><p>Choose where the raw transcript goes. It is sent only after you click Send transcript to AI.</p><div className="setupPath"><span>1 Choose provider</span><b>›</b><span>{settings.analysisMode === 'local-model' ? '2 Start local runtime' : '2 Add API key'}</span><b>›</b><span>3 Pick model</span></div><label>AI platform<select value={settings.analysisMode} onChange={(e) => chooseProvider(e.target.value as PublicSettings['analysisMode'])}><option value="local-model">Local model — Ollama or LM Studio</option><option value="openai-responses">OpenAI</option><option value="anthropic">Anthropic Claude</option><option value="gemini">Google Gemini</option><option value="openai-compatible">OpenRouter / compatible cloud API</option></select></label>
      {settings.analysisMode === 'local-model' ? <div className="localModelPanel"><strong>Nothing leaves this computer.</strong><span>Choose a local server preset, make sure it is running, then enter the exact installed model name.</span><label>Local runtime<select value={settings.analysisBaseUrl.includes('1234') ? 'lmstudio' : 'ollama'} onChange={(e) => field('analysisBaseUrl', e.target.value === 'lmstudio' ? 'http://127.0.0.1:1234/v1' : 'http://127.0.0.1:11434/v1')}><option value="ollama">Ollama — port 11434</option><option value="lmstudio">LM Studio — port 1234</option></select></label><div className="providerLinks"><button className="textLink" onClick={() => open('https://ollama.com/download')}>Install Ollama ↗</button><button className="textLink" onClick={() => open('https://lmstudio.ai')}>Install LM Studio ↗</button></div></div> : <div className="fieldHelp">{settings.analysisMode === 'openai-responses' ? 'OpenAI can reuse the transcription key.' : 'This provider needs its own API key.'} <button className="textLink" onClick={() => open(providerHelp[1])}>{providerHelp[0]} ↗</button></div>}
      <div className="twoCols"><label>Base URL<input value={settings.analysisBaseUrl} onChange={(e) => field('analysisBaseUrl', e.target.value)}/></label><label>Model<input value={settings.analysisModel} onChange={(e) => field('analysisModel', e.target.value)}/></label></div>{settings.analysisMode !== 'local-model' && <label>Provider API key<input type="password" value={analysisApiKey} placeholder={settings.hasAnalysisKey ? 'Saved securely — enter to replace' : settings.analysisMode === 'openai-responses' ? 'Optional when OpenAI key is saved above' : 'Paste this provider’s API key'} onChange={(e) => setAnalysisApiKey(e.target.value)}/></label>}<label>Notes instructions<textarea rows={5} value={settings.analysisPrompt} onChange={(e) => field('analysisPrompt', e.target.value)}/></label></section>

    <section className="settingsCard"><h2>Browser companion</h2><p>Optional local bridge for selected text and direct media URLs.</p><div className="setupPath"><span>1 Load extension</span><b>›</b><span>2 Copy endpoint</span><b>›</b><span>3 Copy token</span></div><div className="twoCols"><label>Local endpoint<input readOnly value={`http://127.0.0.1:${settings.companionPort}/ingest`}/></label><label>Companion token<input readOnly value={settings.companionToken}/></label></div></section>
    <div className="saveBar"><button className="ghost" onClick={onDone}>Done</button><button className="primary" onClick={save}>{saved ? 'Saved' : 'Save settings'}</button></div>
  </div>
}

createRoot(document.getElementById('root')!).render(<App/>)
