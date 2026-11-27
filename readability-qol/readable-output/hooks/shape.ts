export const ASK_TYPES = ['promote', 'delete', 'merge', 'message', 'spend', 'choice', 'decide'] as const
export type AskType = (typeof ASK_TYPES)[number]

export const SECTION_NAMES = ['Done', 'Caught', 'Not possible', 'Needs you', 'Running'] as const
export type SectionName = (typeof SECTION_NAMES)[number]

export const STATE_WORDS = ['Done', 'Partly done', 'Needs you', 'Running', 'Blocked', 'Failed'] as const

export type Failure = { what: string; why?: string; safe?: string }
export type Option = { label: string; outcome: string; example?: string }

export type Ask = {
  number: number
  title: string
  type?: AskType
  typeText?: string
  recommend?: string
  fields: Record<string, string>
  failures: Failure[]
  options: Option[]
  ref?: string
  labels: Record<string, string>
  loose: string[]
  start: number
  end: number
}

export type Section = { name: SectionName; from: number; lines: string[] }

export type Report = {
  headline: string
  headlineAt: number
  state?: string
  lines: string[]
  sections: Section[]
  asks: Ask[]
}

const TYPE_ALIASES: Record<string, AskType> = {
  promote: 'promote',
  'go live': 'promote',
  'promote / go live': 'promote',
  'promote/go live': 'promote',
  live: 'promote',
  delete: 'delete',
  merge: 'merge',
  'code change': 'merge',
  'merge / code change': 'merge',
  message: 'message',
  'message someone': 'message',
  spend: 'spend',
  worker: 'spend',
  'start a worker': 'spend',
  'spend / start a worker': 'spend',
  choice: 'choice',
  'choice between options': 'choice',
  decide: 'decide',
  decision: 'decide',
}

const FIELD_ALIASES: Record<string, string> = {
  type: 'type',
  recommend: 'recommend',
  recommendation: 'recommend',
  'yes means': 'yes',
  'no means': 'no',
  ref: 'ref',
  refs: 'ref',
  tests: 'tests',
  'test results': 'tests',
  failed: 'failed',
  failure: 'failed',
  why: 'why',
  'safe because': 'safe',
  'still safe because': 'safe',
  'customer change': 'customers',
  'for customers': 'customers',
  'what customers see': 'customers',
  example: 'example',
  'example chat': 'example',
  rollback: 'rollback',
  'roll back': 'rollback',
  'what goes': 'goes',
  restorable: 'restorable',
  'if wrong': 'ifWrong',
  'behaviour change': 'behaviour',
  'behavior change': 'behaviour',
  'still open': 'open',
  to: 'to',
  draft: 'draft',
  'why now': 'whyNow',
  cost: 'cost',
  delivers: 'delivers',
  when: 'when',
}

const HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(Done|Caught|Not possible|Needs you|Running)\s*(?:\*\*)?\s*(?:\(.*\))?\s*:?\s*(?:\*\*)?\s*$/i
const ASK_START = /^\s{0,3}(?:\*\*)?(\d{1,2})[.)](?:\*\*)?\s+(.+)$/
const FIELD = /^\s*(?:[-*•]\s+)?(?:\*\*)?([A-Za-z][A-Za-z0-9 /]{0,26}?)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$/
const OPTION_LABEL = /^option\s+([a-z0-9]{1,3})$/i

const FAILED_LABEL = /^fail(?:ed|ure|ing)?(?:\s+tests?)?(?:\s+\d+)?$/i

const fieldKeyOf = (label: string) => {
  const clean = label.toLowerCase().trim()
  return FAILED_LABEL.test(clean) ? 'failed' : FIELD_ALIASES[clean]
}

const strip = (text: string) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^[\s●⏺•]+/, '')
    .replace(/^#{1,6}\s+/, '')
    .trim()

const canonicalSection = (name: string): SectionName =>
  SECTION_NAMES.find(one => one.toLowerCase() === name.toLowerCase()) ?? 'Done'

export const askTypeOf = (text: string): AskType | undefined => {
  const word = text.toLowerCase().replace(/[.*]/g, '').trim()
  return TYPE_ALIASES[word] ?? TYPE_ALIASES[word.split(/[\s,(]/)[0] ?? '']
}

const stateOf = (headline: string) => {
  const lower = headline.toLowerCase()
  return STATE_WORDS.find(word => lower.startsWith(word.toLowerCase()))
}

const splitInline = (text: string) => {
  const marks = [...text.matchAll(/(?:^|[\s.;|])(why|safe because|still safe because|example)\s*:\s*/gi)]
  const parts: Record<string, string> = {}
  let head = text
  marks.forEach((mark, index) => {
    const start = (mark.index ?? 0) + mark[0].length
    const end = marks[index + 1]?.index ?? text.length
    const label = FIELD_ALIASES[mark[1]!.toLowerCase()] ?? mark[1]!.toLowerCase()
    parts[label] = text.slice(start, end).replace(/[\s|;]+$/, '').trim()
    if (index === 0) head = text.slice(0, mark.index ?? 0)
  })
  return { head: head.replace(/[\s|;.]+$/, '').trim(), parts }
}

const newAsk = (number: number, title: string, start: number): Ask => ({
  number,
  title: strip(title),
  fields: {},
  failures: [],
  options: [],
  labels: {},
  loose: [],
  start,
  end: start + 1,
})

const addField = (ask: Ask, label: string, value: string, last: { key: string | null }) => {
  const option = label.match(OPTION_LABEL)
  if (option !== null) {
    const { head, parts } = splitInline(value)
    ask.options.push({ label: option[1]!.toUpperCase(), outcome: head, example: parts.example })
    last.key = 'option'
    return true
  }
  const key = fieldKeyOf(label)
  if (key === undefined) return false
  if (key === 'failed') {
    const { head, parts } = splitInline(value.replace(/^fail(?:ed|ure)\s*:\s*/i, ''))
    ask.failures.push({ what: head, why: parts.why, safe: parts.safe })
    last.key = 'failed'
    return true
  }
  const lastFailure = ask.failures.at(-1)
  if ((key === 'why' || key === 'safe') && last.key === 'failed' && lastFailure !== undefined) {
    lastFailure[key] = value
    return true
  }
  const lastOption = ask.options.at(-1)
  if (key === 'example' && last.key === 'option' && lastOption !== undefined) {
    lastOption.example = value
    return true
  }
  if (key === 'type') {
    ask.typeText = value
    ask.type = askTypeOf(value)
  }
  if (key === 'recommend') ask.recommend = value
  if (key === 'ref') ask.ref = value
  ask.fields[key] = value
  ask.labels[key] = label.trim()
  last.key = key
  return true
}

const appendTo = (ask: Ask, line: string, last: { key: string | null }) => {
  const text = line.trim().replace(/^>\s?/, '')
  if (text === '') return
  if (last.key === null || last.key === 'failed') {
    ask.loose.push(line.trim())
    return
  }
  if (last.key === 'option') {
    const option = ask.options.at(-1)
    if (option !== undefined) option.outcome = `${option.outcome} ${text}`.trim()
    return
  }
  const joiner = last.key === 'draft' ? '\n' : ' '
  ask.fields[last.key] = `${ask.fields[last.key] ?? ''}${joiner}${text}`.trim()
  if (last.key === 'ref') ask.ref = ask.fields.ref
}

const parseAsks = (section: Section) => {
  const asks: Ask[] = []
  const last = { key: null as string | null }
  section.lines.forEach((line, offset) => {
    const at = section.from + offset
    const start = line.match(ASK_START)
    const field = line.match(FIELD)
    const current = asks.at(-1)
    if (start !== null && (field === null || fieldKeyOf(field[1]!) === undefined)) {
      asks.push(newAsk(Number(start[1]), start[2]!, at))
      last.key = null
      return
    }
    if (current === undefined) return
    current.end = at + 1
    if (field !== null && addField(current, field[1]!, field[2]!.trim(), last)) return
    appendTo(current, line, last)
  })
  return asks
}

export const parseReport = (markdown: string): Report | null => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const sections: Section[] = []
  let headlineAt = -1
  lines.forEach((line, at) => {
    const heading = line.match(HEADING)
    if (heading !== null) {
      sections.push({ name: canonicalSection(heading[1]!), from: at + 1, lines: [] })
      return
    }
    const current = sections.at(-1)
    if (current !== undefined) current.lines.push(line)
    else if (headlineAt === -1 && line.trim() !== '') headlineAt = at
  })
  const needsYou = sections.find(section => section.name === 'Needs you')
  const asks = needsYou === undefined ? [] : parseAsks(needsYou)
  const isReport = asks.length > 0 || new Set(sections.map(section => section.name)).size >= 2
  if (!isReport) return null
  const headline = headlineAt === -1 ? '' : strip(lines[headlineAt]!)
  return { headline, headlineAt, state: stateOf(headline), lines, sections, asks }
}

const WHEN =
  /\b(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}:\d{2}|today|tonight|tomorrow|now|immediately|right away|this (?:morning|afternoon|evening|week|month)|next (?:week|month|run|report|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon|tues|wednes|thurs|fri|satur|sun)day|within \d+|in \d+ (?:minutes?|hours?|days?|weeks?|months?)|after \d+ (?:minutes?|hours?|days?|weeks?)|every (?:hour|day|week|run)|hourly|daily|weekly|on the next run|end of (?:day|week|month)|eod|eow)\b/i

export const hasWhen = (text: string) => WHEN.test(text)

const CODE_NAMES: readonly RegExp[] = [
  /`[^`]+`/,
  /\bPR\s*#?\d+\b/i,
  /\b[\w.-]+#\d+\b/,
  /(?:^|\s)#\d{2,}\b/,
  /\bWP\d+\b/i,
  /\b[A-Z]{2,6}-\d{1,6}\b/,
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/,
]

export const codeNamesIn = (text: string) => {
  const found = CODE_NAMES.flatMap(pattern => {
    const match = text.match(pattern)
    return match === null ? [] : [match[0].trim()]
  })
  return [...new Set(found)].filter(name => !found.some(other => other !== name && other.includes(name)))
}

const testsOf = (text: string | undefined) => {
  const found = text?.match(/(\d+)\s*(?:of|\/|out of)\s*(\d+)/i)
  if (found === null || found === undefined) return null
  return { passed: Number(found[1]), total: Number(found[2]) }
}

const isBlank = (text: string | undefined) => text === undefined || text.trim() === ''

const STATED_UNKNOWN =
  /^(?:(?:still|currently|as yet)\s+)?(?:unknown|not (?:yet )?known|(?:i |we )?(?:don't|do not) know|tbc|tbd|n\/a|not (?:yet )?(?:measured|checked|run|tested|confirmed))\b/i

export const statesUnknown = (text: string | undefined) => !isBlank(text) && STATED_UNKNOWN.test(text!.trim())

const isUnknown = (text: string | undefined) => isBlank(text) || statesUnknown(text)

export const TIMED_TYPES: readonly AskType[] = ['promote', 'spend', 'message']

const isTimed = (ask: Ask) => ask.type !== undefined && TIMED_TYPES.includes(ask.type)

const RECOMMEND = /^(?:yes|no|your call|option\s+\w+|skip|change)\b/i

const baseMissing = (ask: Ask) => {
  const missing: string[] = []
  if (ask.type === undefined) missing.push(`a type (one of ${ASK_TYPES.join(', ')})`)
  if (isBlank(ask.recommend) || !RECOMMEND.test(ask.recommend!.trim())) {
    missing.push('a recommendation ("Recommend: yes", "no" or "your call")')
  }
  if (ask.type !== 'choice') {
    if (isBlank(ask.fields.yes)) missing.push('"Yes means"')
    if (isBlank(ask.fields.no)) missing.push('"No means"')
  }
  return missing
}

const promoteMissing = (ask: Ask) => {
  const missing: string[] = []
  const tests = testsOf(ask.fields.tests)
  if (tests === null) {
    if (!statesUnknown(ask.fields.tests)) missing.push('test results ("Tests: X of Y passed")')
  } else {
    const failed = Math.max(0, tests.total - tests.passed)
    const isExplained = ask.failures.some(one => !isUnknown(one.what) && !isUnknown(one.why) && !isUnknown(one.safe))
    if (failed > 0 && !isExplained) {
      missing.push(
        `why the ${failed} failed test${failed === 1 ? ' is' : 's are'} safe ("Failed: what failed. Why: ... Safe because: ..."; one line can cover a group)`,
      )
    }
  }
  if (isBlank(ask.fields.customers)) missing.push('what changes for customers')
  if (isBlank(ask.fields.example)) missing.push('one sample chat or example')
  if (isBlank(ask.fields.rollback)) missing.push('how to roll back')
  return missing
}

const RESTORE_SPAN = /\d+\s*(?:minutes?|hours?|days?|weeks?|months?)|\d{1,2}\/\d{1,2}|until|forever|indefinitely/i

const restorableMissing = (restorable: string) => {
  if (statesUnknown(restorable)) return []
  if (!/^(?:yes|no)\b/i.test(restorable)) return ['whether it can be restored ("Restorable: yes, for 30 days" or "no")']
  if (/^yes/i.test(restorable) && !RESTORE_SPAN.test(restorable)) return ['for how long it can be restored']
  return []
}

const deleteMissing = (ask: Ask) => {
  const missing: string[] = []
  if (isBlank(ask.fields.goes)) missing.push('what goes, in plain words')
  missing.push(...restorableMissing(ask.fields.restorable?.trim() ?? ''))
  if (isBlank(ask.fields.ifWrong)) missing.push('what breaks if it should not have gone')
  return missing
}

const mergeMissing = (ask: Ask) => {
  const missing: string[] = []
  if (isBlank(ask.fields.behaviour)) missing.push('the behaviour that changes')
  if (testsOf(ask.fields.tests) === null && !statesUnknown(ask.fields.tests)) missing.push('test results ("Tests: X of Y passed")')
  if (isBlank(ask.fields.open)) missing.push('what is still open ("Still open: nothing" if none)')
  return missing
}

const messageMissing = (ask: Ask) => {
  const missing: string[] = []
  if (isBlank(ask.fields.to)) missing.push('who it goes to')
  if (isBlank(ask.fields.draft)) missing.push('the draft text')
  if (isBlank(ask.fields.whyNow)) missing.push('why now')
  return missing
}

const spendMissing = (ask: Ask) => {
  const missing: string[] = []
  if (isBlank(ask.fields.cost)) missing.push('the expected cost')
  if (isBlank(ask.fields.delivers)) missing.push('what it delivers')
  if (isBlank(ask.fields.when)) missing.push('when it delivers')
  return missing
}

const choiceMissing = (ask: Ask) => {
  const missing: string[] = []
  if (ask.options.length < 2) missing.push('at least two options ("Option A: outcome. Example: ...")')
  for (const option of ask.options) {
    if (isBlank(option.outcome)) missing.push(`the outcome of option ${option.label}`)
    if (isBlank(option.example)) missing.push(`a concrete example for option ${option.label}`)
  }
  return missing
}

const TYPE_MISSING: Record<AskType, (ask: Ask) => string[]> = {
  promote: promoteMissing,
  delete: deleteMissing,
  merge: mergeMissing,
  message: messageMissing,
  spend: spendMissing,
  choice: choiceMissing,
  decide: () => [],
}

const PLAIN_FIELDS = ['yes', 'no', 'goes', 'ifWrong', 'behaviour', 'customers', 'delivers'] as const

export const missingParts = (ask: Ask): string[] => {
  const missing = [...baseMissing(ask), ...(ask.type === undefined ? [] : TYPE_MISSING[ask.type](ask))]
  const plainText = [ask.title, ...PLAIN_FIELDS.map(key => ask.fields[key] ?? '')].join(' \n ')
  const names = [...new Set(codeNamesIn(plainText))]
  if (names.length > 0) missing.push(`plain words instead of code names (move ${names.join(', ')} to the Ref line)`)
  return missing
}

export const timingHints = (ask: Ask): string[] =>
  isTimed(ask) && !isBlank(ask.fields.yes) && !hasWhen(ask.fields.yes!) && !statesUnknown(ask.fields.yes)
    ? ['when it happens in "Yes means" (today, 29/11, 16:00)']
    : []

const ASK_FENCE = /^ {0,3}```ask[^\S\n]*\n([\s\S]*?)^ {0,3}```[^\S\n]*$/gm
const TITLE_NUMBER = /^\s*(?:\*\*)?\d{1,2}[.)](?:\*\*)?\s+/

const normalized = (text: string) => text.replace(/\r\n?/g, '\n')

export const askBlocks = (text: string) => [...normalized(text).matchAll(ASK_FENCE)].map(match => match[1]!)

export const bodyText = (text: string) =>
  normalized(text)
    .replace(ASK_FENCE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const parseAskBlock = (block: string, number: number): Ask => {
  const lines = block.split('\n')
  const titleAt = lines.findIndex(line => {
    if (line.trim() === '') return false
    const field = line.match(FIELD)
    return field === null || fieldKeyOf(field[1]!) === undefined
  })
  const firstFieldAt = lines.findIndex(line => {
    const field = line.match(FIELD)
    return field !== null && fieldKeyOf(field[1]!) !== undefined
  })
  const hasTitle = titleAt !== -1 && (firstFieldAt === -1 || titleAt < firstFieldAt)
  const ask = newAsk(number, hasTitle ? lines[titleAt]!.replace(TITLE_NUMBER, '') : `Ask ${number}`, 0)
  const last = { key: null as string | null }
  lines.forEach((line, at) => {
    if (hasTitle && at === titleAt) return
    const field = line.match(FIELD)
    if (field !== null && addField(ask, field[1]!, field[2]!.trim(), last)) return
    appendTo(ask, line, last)
  })
  ask.end = lines.length
  return ask
}

export type FoundAsks = { asks: Ask[]; isFenced: boolean }

export const findAsks = (text: string): FoundAsks => {
  const blocks = askBlocks(text)
  if (blocks.length > 0) return { asks: blocks.map((block, at) => parseAskBlock(block, at + 1)), isFenced: true }
  return { asks: parseReport(text)?.asks ?? [], isFenced: false }
}

export const sameAsk = (one: Ask, other: Ask) => one.title.trim().toLowerCase() === other.title.trim().toLowerCase()
