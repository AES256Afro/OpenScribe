let tab
const $ = (id) => document.getElementById(id)

async function load() {
  ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  $('page').textContent = tab?.title || 'Current page'
  const saved = await chrome.storage.local.get(['endpoint', 'token'])
  if (saved.endpoint) $('endpoint').value = saved.endpoint
  if (saved.token) $('token').value = saved.token
}

async function send(payload) {
  $('status').className = ''; $('status').textContent = 'Sending…'
  try {
    const response = await fetch($('endpoint').value, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: $('token').value, title: tab.title, sourceUrl: tab.url, ...payload }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Import failed')
    $('status').textContent = 'Added to OpenScribe.'
  } catch (error) { $('status').className = 'error'; $('status').textContent = error.message }
}

$('save').onclick = async () => { await chrome.storage.local.set({ endpoint: $('endpoint').value, token: $('token').value }); $('status').textContent = 'Connection saved.' }
$('selection').onclick = async () => { const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => getSelection()?.toString() || '' }); if (!result) return $('status').textContent = 'Select some text first.'; await send({ text: result }) }
$('audio').onclick = async () => { const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { const media = document.querySelector('audio[src],video[src],audio source[src],video source[src]'); return media?.src || media?.getAttribute('src') || '' } }); if (!result) return $('status').textContent = 'No direct audio or video URL found on this page.'; await send({ audioUrl: result }) }
load()
