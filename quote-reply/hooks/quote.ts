export const SHORT_QUOTE_LIMIT = 160
export const SELECTION_LIMIT = 2000

const MARKDOWN_LEAD = /^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/

const cleanLine = (line: string) =>
  line
    .replace(MARKDOWN_LEAD, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

const cut = (text: string, limit: number) => {
  if (text.length <= limit) return text
  const head = text.slice(0, limit)
  const space = head.lastIndexOf(' ')
  return `${(space > limit / 2 ? head.slice(0, space) : head).trimEnd()}…`
}

const asQuote = (lines: readonly string[]) =>
  `${lines.map(line => `> ${line}`.trimEnd()).join('\n')}\n\n`

export const shortQuote = (markdown: string): string => {
  const prose = markdown.replace(/```[\s\S]*?(?:```|$)/g, '\n[code]\n')
  const lines = prose.split('\n').map(cleanLine).filter(line => line !== '')
  const picked: string[] = []
  let used = 0
  for (const line of lines) {
    if (picked.length === 2 || used >= SHORT_QUOTE_LIMIT) break
    const room = SHORT_QUOTE_LIMIT - used
    const piece = cut(line, room)
    picked.push(piece)
    used += piece.length
    if (piece.endsWith('…')) break
  }
  const isTrimmed =
    picked.length < lines.length && !(picked.at(-1) ?? '').endsWith('…')
  if (isTrimmed && picked.length > 0) picked[picked.length - 1] += ' …'
  return asQuote(picked.length > 0 ? picked : ['…'])
}

export const selectionQuote = (selected: string): string => {
  const lines = cut(selected.trim(), SELECTION_LIMIT).split('\n')
  return asQuote(lines.map(line => line.trimEnd()))
}

export const previewOf = (quote: string): string =>
  cut(quote.replace(/^> ?/gm, '').replace(/\s+/g, ' ').trim(), 60)
