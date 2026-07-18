import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Store } from './store'
import type { Note } from '../shared/types'

function send(res: ServerResponse, status: number, body: object) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as { token?: string; title?: string; sourceUrl?: string; audioUrl?: string; text?: string }
}

export function startCompanion(store: Store, onImport: () => void) {
  const settings = store.getSettings()
  return createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }); res.end(); return
    }
    if (req.method !== 'POST' || req.url !== '/ingest') return send(res, 404, { error: 'Not found' })
    try {
      const input = await readJson(req)
      if (input.token !== settings.companionToken) return send(res, 401, { error: 'Invalid companion token' })
      if (!input.audioUrl && !input.text) return send(res, 400, { error: 'Provide audioUrl or text' })
      const now = new Date().toISOString()
      const note: Note = { id: randomUUID(), title: input.title || 'Browser import', createdAt: now, updatedAt: now, sourceUrl: input.sourceUrl, transcript: input.text ?? '', summary: '', status: input.text ? 'transcribed' : 'imported' }
      if (input.audioUrl) {
        const download = await fetch(input.audioUrl)
        if (!download.ok || !download.body) throw new Error(`Could not download audio (${download.status})`)
        const extension = path.extname(new URL(input.audioUrl).pathname) || '.audio'
        note.audioPath = path.join(store.recordingsDir, `${note.id}${extension}`)
        await pipeline(download.body as never, createWriteStream(note.audioPath))
      }
      await store.putNote(note); onImport(); send(res, 201, { id: note.id })
    } catch (error) { send(res, 500, { error: error instanceof Error ? error.message : 'Import failed' }) }
  }).listen(settings.companionPort, '127.0.0.1')
}
