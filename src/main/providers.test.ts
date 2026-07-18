import { describe, expect, it } from 'vitest'
import { extractResponseText } from './providers'

describe('extractResponseText', () => {
  it('reads Responses API output_text', () => expect(extractResponseText({ output_text: 'Summary' })).toBe('Summary'))
  it('reads compatible chat output', () => expect(extractResponseText({ choices: [{ message: { content: 'Notes' } }] })).toBe('Notes'))
  it('reads structured Responses output', () => expect(extractResponseText({ output: [{ content: [{ text: 'One' }, { text: 'Two' }] }] })).toBe('One\nTwo'))
  it('reads Anthropic output', () => expect(extractResponseText({ content: [{ text: 'Claude notes' }] })).toBe('Claude notes'))
  it('reads Gemini output', () => expect(extractResponseText({ candidates: [{ content: { parts: [{ text: 'Gemini notes' }] } }] })).toBe('Gemini notes'))
})
