export type Role =
  | 'heading'
  | 'bullet'
  | 'recommend'
  | 'risk'
  | 'caution'
  | 'done'
  | 'number'
  | 'quote'
  | 'code'
  | 'link'

export type Span = {
  text: string
  role?: Role
  bold?: boolean
  italic?: boolean
  href?: string
}

export type Line =
  | { kind: 'blank' }
  | { kind: 'heading'; spans: Span[] }
  | { kind: 'item'; indent: number; marker: string; spans: Span[]; isRecommended: boolean }
  | { kind: 'quote'; spans: Span[] }
  | { kind: 'text'; indent: number; spans: Span[] }
  | { kind: 'markdown'; text: string }

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/
const THEMATIC = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const ATX = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const LONE_BOLD = /^\s*(\*\*|__)([^*_].*?)\1\s*:?\s*$/

const isBlank = (line: string | undefined) => line === undefined || line.trim() === ''

const isTitleLine = (lines: readonly string[], index: number) => {
  const line = lines[index]!.trim()
  if (line.length === 0 || line.length > 60) return false
  if (ITEM.test(line) || QUOTE.test(line) || ATX.test(line) || FENCE.test(line) || TABLE_ROW.test(line)) return false
  if (!/^[A-Z0-9"“]/.test(line)) return false
  if (/[.,;!?…]$/.test(line)) return false
  if (/:./.test(line)) return false
  if (/https?:\/\/|`/.test(line)) return false
  if (line.split(/\s+/).length > 9) return false
  if (index > 0 && !isBlank(lines[index - 1])) return false
  return !isBlank(lines[index + 1])
}

export const parseLines = (text: string): Line[] => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: Line[] = []
  const pushBlank = () => {
    if (out.length > 0 && out[out.length - 1]!.kind !== 'blank') out.push({ kind: 'blank' })
  }
  let index = 0
  while (index < lines.length) {
    const line = lines[index]!
    const fence = FENCE.exec(line)
    if (fence !== null) {
      const marker = fence[1]!
      let end = index + 1
      while (end < lines.length && !lines[end]!.trimStart().startsWith(marker)) end += 1
      out.push({ kind: 'markdown', text: lines.slice(index, end + 1).join('\n') })
      index = end + 1
      continue
    }
    if (TABLE_ROW.test(line) && lines[index + 1] !== undefined && TABLE_RULE.test(lines[index + 1]!)) {
      let end = index + 2
      while (end < lines.length && TABLE_ROW.test(lines[end]!)) end += 1
      out.push({ kind: 'markdown', text: lines.slice(index, end).join('\n') })
      index = end
      continue
    }
    index += 1
    if (isBlank(line)) {
      pushBlank()
      continue
    }
    if (THEMATIC.test(line)) {
      out.push({ kind: 'markdown', text: line.trim() })
      continue
    }
    const atx = ATX.exec(line)
    if (atx !== null) {
      out.push({ kind: 'heading', spans: inline(atx[2]!) })
      continue
    }
    const item = ITEM.exec(line)
    if (item !== null) {
      const spans = paint(withLabel(inline(item[3]!)))
      out.push({
        kind: 'item',
        indent: item[1]!.replace(/\t/g, '  ').length,
        marker: item[2]!,
        spans,
        isRecommended: spans.some(span => span.role === 'recommend'),
      })
      continue
    }
    const quote = QUOTE.exec(line)
    if (quote !== null) {
      out.push({ kind: 'quote', spans: inline(quote[1]!) })
      continue
    }
    const loneBold = LONE_BOLD.exec(line)
    if (loneBold !== null && !isBlank(lines[index]) && loneBold[2]!.length <= 60) {
      out.push({ kind: 'heading', spans: inline(line.trim()) })
      continue
    }
    if (isTitleLine(lines, index - 1)) {
      out.push({ kind: 'heading', spans: inline(line.trim()) })
      continue
    }
    const indent = /^\s*/.exec(line)![0].replace(/\t/g, '  ').length
    out.push({ kind: 'text', indent, spans: paint(withLabel(inline(line.trimStart()))) })
  }
  while (out.length > 0 && out[out.length - 1]!.kind === 'blank') out.pop()
  return out
}

const INLINE =
  /(?<code>(?<ticks>`+)(?<codeBody>[^`]|[^`].*?[^`])\k<ticks>(?!`))|(?<link>\[(?<label>[^\]\n]+)\]\((?<href>[^)\s]+)(?:\s+"[^"]*")?\))|(?<angle><(?<angleHref>https?:\/\/[^>\s]+)>)|(?<bare>https?:\/\/[^\s<>()\]]+[^\s<>()\].,;:!?'"])|(?<bold>(?<boldMark>\*\*|__)(?<boldBody>(?!\s).+?)(?<!\s)\k<boldMark>)|(?<italic>\*(?<italicBody>(?![\s*]).+?)(?<![\s*])\*)|(?<escape>\\(?<escaped>[\\`*_{}[\]()#+\-.!>|~]))/g

const isWebHref = (href: string) => /^https?:\/\//i.test(href)

export const inline = (text: string): Span[] => {
  const spans: Span[] = []
  const plain = (value: string, extra: Omit<Span, 'text'> = {}) => {
    if (value === '') return
    const last = spans[spans.length - 1]
    if (last !== undefined && last.role === undefined && last.href === undefined && !last.bold && !last.italic && Object.keys(extra).length === 0) {
      last.text += value
      return
    }
    spans.push({ text: value, ...extra })
  }
  let at = 0
  for (const match of text.matchAll(INLINE)) {
    const groups = match.groups!
    plain(text.slice(at, match.index))
    at = match.index! + match[0].length
    if (groups.code !== undefined) spans.push({ text: groups.codeBody!, role: 'code' })
    else if (groups.link !== undefined) spans.push(isWebHref(groups.href!) ? { text: groups.label!, role: 'link', href: groups.href! } : { text: groups.label! })
    else if (groups.angle !== undefined) spans.push({ text: groups.angleHref!, role: 'link', href: groups.angleHref! })
    else if (groups.bare !== undefined) spans.push({ text: groups.bare, role: 'link', href: groups.bare })
    else if (groups.bold !== undefined) spans.push({ text: groups.boldBody!, bold: true })
    else if (groups.italic !== undefined) spans.push({ text: groups.italicBody!, italic: true })
    else plain(groups.escaped!)
  }
  plain(text.slice(at))
  return spans
}

const LABEL = /^([A-Z][A-Za-z0-9'’&/,() -]{0,44}?:)(?=\s|$)/
const LABEL_WORDS_MAX = 6

export const withLabel = (spans: readonly Span[]): Span[] => {
  const [first, ...rest] = spans
  if (first === undefined || first.role !== undefined || first.bold || first.italic) return [...spans]
  const label = LABEL.exec(first.text)?.[1]
  if (label === undefined || label.split(' ').length > LABEL_WORDS_MAX) return [...spans]
  const after = first.text.slice(label.length)
  return [{ text: label, bold: true }, ...(after === '' ? [] : [{ text: after }]), ...rest]
}

const isContinuation = (line: Line, previous: Line | undefined) =>
  line.kind === 'text' && line.indent > 0 && previous?.kind === 'item' && line.indent > previous.indent

const startsBlock = (line: Line, previous: Line | undefined) => {
  if (previous === undefined || previous.kind === 'blank') return false
  if (line.kind === 'heading') return true
  if (line.kind === 'item') return previous.kind === 'heading' ? false : previous.kind !== 'item' || previous.indent >= line.indent
  if (line.kind === 'text') return previous.kind === 'item' && !isContinuation(line, previous)
  return false
}

export const spaced = (lines: readonly Line[]): Line[] => {
  const out: Line[] = []
  for (const line of lines) {
    if (startsBlock(line, out[out.length - 1])) out.push({ kind: 'blank' })
    out.push(line)
  }
  return out
}

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?'
const DAY = '(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)(?:day)?'

const SEMANTIC = new RegExp(
  [
    String.raw`(?<recommend>\b(?:I|I'd|I would|we|we'd)\s+(?:strongly\s+)?recommend(?:\s+(?:this|that|it|option\s+\w+))?\b|\b[Mm]y recommendation\b|\b[Rr]ecommend(?:ed|ation)?\s*:|\([Rr]ecommend(?:ed)?\b[^)]{0,40}\))`,
    String.raw`(?<quoted>"[^"\n]{1,400}"|“[^”\n]{1,400}”)`,
    String.raw`(?<forcePush>\bforce[- ]push(?:ed|es|ing)?\b)`,
    String.raw`(?<rollBack>\broll(?:ed|ing)?[- ]back\b)`,
    String.raw`(?<money>(?:\b(?:US|AU|NZ|SG|HK|CA|A|S))?\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|K|m|M|bn|B)\b)?|[€£¥]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:USD|AUD|SGD|NZD|HKD|dollars)\b)`,
    String.raw`(?<percent>(?<![\w.])\d+(?:\.\d+)?\s?%)`,
    String.raw`(?<ratio>\b\d+\s+(?:of|out of)\s+\d+\b)`,
    String.raw`(?<date>\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{1,2}\s+${MONTH}(?:\s+\d{4})?\b|\b${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?\b(?:,?\s+\d{4})?|\b${DAY}\b|\b\d{1,2}:\d{2}(?:\s?[AaPp][Mm])?\b|\b\d{1,2}\s?[AaPp][Mm]\b)`,
    String.raw`(?<count>(?<![\w#.\/$-])\d[\d,]*(?:\.\d+)?(?:[x×]|ms|s|m|h|d|k|K|M)?(?![\w\/-]|\.\d))`,
    String.raw`(?<word>\b[A-Za-z][A-Za-z'’-]*\b)`,
  ].join('|'),
  'g',
)

const RISK = /^(?:delete|deleted|deletes|deleting|deletion|fail|failed|fails|failing|failure|failures|irreversible)$/i
const CAUTION = /^(?:promote|promoted|promotes|promoting|promotion|rollback|rollbacks|revert|reverted|reverting)$/i
const DONE = /^(?:merged|passed|passes|pass|done|completed|shipped|succeeded)$/i
const NEGATED = /(?:\b(?:not|no|never|without|nothing|none|neither|nor|yet to|short of|instead of)\b|n[’']t\b)(?:\s+\S+){0,3}\s*$/i
const CONDITIONAL = /\b(?:when|once|until|if|after|before|to|be|will|would|should|can|could|may|might|must|get|gets|getting|ready to|needs? to|wait for|waiting for)\s*$/i
const LIVE_DONE = /\b(?:is|are|was|were|now|went|gone|already|been|stays?|still|it[’']s|that[’']s)\s+(?:\w+\s+)?$/i

const classifyWord = (word: string, before: string): Role | undefined => {
  const lower = word.toLowerCase()
  const isPassUpper = lower === 'pass' && word !== 'PASS'
  if (lower === 'live') {
    if (NEGATED.test(before)) return undefined
    return LIVE_DONE.test(before) ? 'done' : 'caution'
  }
  if (RISK.test(word)) return NEGATED.test(before) ? undefined : 'risk'
  if (CAUTION.test(word)) return NEGATED.test(before) ? undefined : 'caution'
  if (DONE.test(word) && !isPassUpper) {
    if (NEGATED.test(before) || CONDITIONAL.test(before)) return undefined
    return 'done'
  }
  return undefined
}

const ROLE_OF_GROUP: Record<string, Role> = {
  recommend: 'recommend',
  quoted: 'quote',
  forcePush: 'risk',
  rollBack: 'caution',
  money: 'number',
  percent: 'number',
  ratio: 'number',
  date: 'number',
  count: 'number',
}

const paintSpan = (span: Span, lineBefore: string): Span[] => {
  if (span.role !== undefined) return [span]
  const out: Span[] = []
  const style = { ...(span.bold ? { bold: true } : {}), ...(span.italic ? { italic: true } : {}) }
  let at = 0
  for (const match of span.text.matchAll(SEMANTIC)) {
    const groups = match.groups!
    const name = Object.keys(ROLE_OF_GROUP).find(key => groups[key] !== undefined)
    const before = lineBefore + span.text.slice(0, match.index)
    const role = name !== undefined ? ROLE_OF_GROUP[name] : classifyWord(match[0], before)
    if (role === undefined) continue
    if (match.index! > at) out.push({ text: span.text.slice(at, match.index), ...style })
    out.push({ text: match[0], role, ...style, ...(role === 'recommend' ? { bold: true } : {}) })
    at = match.index! + match[0].length
  }
  if (at < span.text.length) out.push({ text: span.text.slice(at), ...style })
  return out
}

export const paint = (spans: readonly Span[]): Span[] => {
  const out: Span[] = []
  let before = ''
  for (const span of spans) {
    out.push(...paintSpan(span, before))
    before += span.text
  }
  return out
}

export const plainText = (lines: readonly Line[]) =>
  lines
    .map(line => {
      if (line.kind === 'blank') return ''
      if (line.kind === 'markdown') return line.text
      const words = line.spans.map(span => span.text).join('')
      if (line.kind === 'item') return `${' '.repeat(line.indent)}${line.marker} ${words}`
      if (line.kind === 'text') return `${' '.repeat(line.indent)}${words}`
      return words
    })
    .join('\n')

export const paintText = (text: string): Span[] => paint(withLabel(inline(text)))
