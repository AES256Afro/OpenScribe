import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Note, PublicSettings } from '../shared/types'

const run = promisify(execFile)

export function extractResponseText(payload: unknown): string {
  const data = payload as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; choices?: Array<{ message?: { content?: string } }>; content?: Array<{ text?: string }>; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  if (data.output_text) return data.output_text
  const responseText = data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? '').join('\n').trim()
  if (responseText) return responseText
  const chatText = data.choices?.[0]?.message?.content
  if (chatText) return chatText
  const anthropicText = data.content?.map((item) => item.text ?? '').join('\n').trim()
  if (anthropicText) return anthropicText
  const geminiText = data.candidates?.flatMap((item) => item.content?.parts ?? []).map((item) => item.text ?? '').join('\n').trim()
  if (geminiText) return geminiText
  throw new Error('The AI provider returned no text.')
}

export async function transcribeOpenAI(audioPath: string, settings: PublicSettings, apiKey: string) {
  if (!apiKey) throw new Error('Add an OpenAI API key in Settings.')
  const bytes = await readFile(audioPath)
  const form = new FormData()
  form.append('file', new Blob([bytes]), path.basename(audioPath))
  form.append('model', settings.transcriptionModel)
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form })
  if (!response.ok) throw new Error(`OpenAI transcription failed (${response.status}): ${await response.text()}`)
  const data = await response.json() as { text?: string }
  if (!data.text) throw new Error('The transcription provider returned no text.')
  return data.text
}

export async function transcribeLocal(audioPath: string, settings: PublicSettings) {
  if (!settings.localWhisperModel) throw new Error('Choose a local Whisper model file in Settings.')
  const outputBase = path.join(path.dirname(audioPath), `${path.basename(audioPath, path.extname(audioPath))}-${Date.now()}`)
  const wavPath = `${outputBase}.wav`
  try {
    await run('ffmpeg', ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath])
    await run(settings.localWhisperExecutable, ['-m', settings.localWhisperModel, '-f', wavPath, '-otxt', '-of', outputBase])
    return (await readFile(`${outputBase}.txt`, 'utf8')).trim()
  } finally {
    await Promise.all([rm(wavPath, { force: true }), rm(`${outputBase}.txt`, { force: true })])
  }
}

export async function analyzeTranscript(note: Note, settings: PublicSettings, apiKey: string) {
  if (!apiKey && settings.analysisMode !== 'local-model') throw new Error('Add an analysis provider API key in Settings.')
  const base = settings.analysisBaseUrl.replace(/\/$/, '')
  let response: Response
  if (settings.analysisMode === 'openai-responses') {
    response = await fetch(`${base}/responses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: settings.analysisModel, instructions: settings.analysisPrompt, input: note.transcript, store: false }) })
  } else if (settings.analysisMode === 'anthropic') {
    response = await fetch(`${base}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: settings.analysisModel, max_tokens: 2500, system: settings.analysisPrompt, messages: [{ role: 'user', content: note.transcript }] }) })
  } else if (settings.analysisMode === 'gemini') {
    response = await fetch(`${base}/models/${encodeURIComponent(settings.analysisModel)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify({ system_instruction: { parts: [{ text: settings.analysisPrompt }] }, contents: [{ role: 'user', parts: [{ text: note.transcript }] }] }) })
  } else {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    response = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: settings.analysisModel, messages: [{ role: 'system', content: settings.analysisPrompt }, { role: 'user', content: note.transcript }] }) })
  }
  if (!response.ok) throw new Error(`Analysis failed (${response.status}): ${await response.text()}`)
  return extractResponseText(await response.json())
}
