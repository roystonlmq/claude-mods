import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Register } from 'claude-code'

import type { PendingReply } from '../types'
import { previewOf, selectionQuote, shortQuote } from './quote'

const pending = atom(
  { plugin: 'quote-reply', key: 'pending' } as const,
  null as PendingReply | null,
)

const REPLYING_ORIGINS: ReadonlySet<PromptOrigin['kind']> = new Set([
  'composer',
  'bridge',
])

const isPersonTyping = (origin: PromptOrigin) =>
  REPLYING_ORIGINS.has(origin.kind) ||
  (origin.kind === 'plugin' && 'asUser' in origin && origin.asUser === true)

const holdForNextPrompt = async ($: EngineInterface, quote: string) => {
  const preview = previewOf(quote)
  await update($, pending, () => ({ quote, preview }))
  $.ui.toast(`Replying to "${preview}". Your next message carries the quote.`)
}

const reply = async ($: EngineInterface, quote: string, surface: string) => {
  if (surface === 'mobile') return holdForNextPrompt($, quote)
  const box = await $.prompt.read()
  const draft = box.text.startsWith('> ') ? box.text.replace(/^(?:>.*\n)+\n?/, '') : box.text
  const text = `${quote}${draft}`
  const filled = await $.prompt.fill({ text, mode: 'replace', cursor: text.length })
  if (filled.isFilled) return update($, pending, () => null)
  return holdForNextPrompt($, quote)
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const row = await next(e)
    if (e.props.isSummary === true || e.props.text.trim() === '') return row
    const { Box, Button } = $.ui.resolve(e)
    const quote = shortQuote(e.props.text)
    return (
      <Box flexDirection="column">
        {row}
        <Button
          key="reply"
          label="↩ Reply"
          dimColor
          onPress={press => reply($, quote, press.surface)}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'ContextMenu' }, ($, e, next) => {
    const selected = e.props.selection?.text.trim()
    if (selected === undefined || selected === '') return next(e)
    const { Button, Text } = $.ui.resolve(e)
    return (
      <Button
        key="reply-selection"
        onPress={press => reply($, selectionQuote(selected), press.surface)}
      >
        Reply to selection <Text dimColor>Quotes it in the prompt</Text>
      </Button>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const waiting = await read($, pending)
    if (waiting === null || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>↩ Replying to: {waiting.preview} </Text>
        <Button key="cancel-reply" label="Cancel" dimColor onPress={() => update($, pending, () => null)} />
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    const waiting = await read($, pending)
    if (waiting === null || e.command !== undefined || !isPersonTyping(e.origin)) {
      return next(e)
    }
    await update($, pending, () => null)
    if (e.text.startsWith(waiting.quote.trimEnd())) return next(e)
    return next({ ...e, text: `${waiting.quote}${e.text}` })
  }).catch(($, e, next) => next(e))
}
