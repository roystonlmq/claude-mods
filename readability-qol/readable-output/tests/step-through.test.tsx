import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { RenderElement } from 'claude-code'

import { BAD_REPORT, GOOD_REPORT, SAMPLE_ASK, PLAIN_CHAT, PROMOTE_NO_FAILURE_REASON, PROSE_ANSWER_WITH_ASK } from './fixtures'

const PLUGIN = 'readable-output'
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
type Surface = (typeof SURFACES)[number]

const message = (text: string, surface: Surface, requestId = 'msg-1') =>
  ({
    plugin: PLUGIN,
    component: 'AssistantMessage',
    requestId,
    surface,
    props: { text, isFirstOfReply: true },
  }) as const

const band = (surface: Surface) =>
  ({
    plugin: PLUGIN,
    component: 'AbovePrompt',
    surface,
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  }) as const

const REPORT_AT = new Date(2026, 10, 25, 13, 36).getTime()

const engine = (on: On, isFilled = true, clock = () => REPORT_AT, draft = '') => {
  const filled: string[] = []
  const fillModes: string[] = []
  const submitted: string[] = []
  const toasts: string[] = []
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  on('clock.now', () => ({ value: clock() }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_, e) => {
    if (isFilled) {
      filled.push(e.text)
      fillModes.push(String(e.mode ?? 'replace'))
    }
    return isFilled ? { isFilled: true } : { isFilled: false, refusal: 'no_composer' as const }
  })
  on('ui.toast', (_, e) => {
    toasts.push(String(e.text ?? ''))
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  return { filled, fillModes, submitted, toasts }
}

const press = async ($: Engine, text: string, surface: Surface, keys: readonly string[]) => {
  for (const key of keys) {
    const ui = await $.ui.mount(message(text, surface))
    await ui.press({ key })
    await ui.unmount()
  }
}

describe('step-through', () => {
  test('a plain reply keeps the engine row', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount(message(PLAIN_CHAT, 'terminal'))
    expect(await ui.find({ type: 'Text', text: /engine row/ })).toBeDefined()
    await ui.unmount()
  })

  test('shows one ask at a time with its full context and progress, on every surface', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(message(GOOD_REPORT, surface, `first-${surface}`))
      expect(await ui.find({ type: 'Text', text: /ask 1 of 7/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Stop the cleanup job deleting two Acme bot changes/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /on 29\/11 these two changes stay/ })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'yes-1' })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'yes-2' })).toBe(undefined)
      expect(await ui.find({ type: 'Text', text: /Ref: PR app#133 · WP1/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('Yes moves to the next ask and folds the answer into a receipt', async ($, on) => {
    engine(on)
    await press($, GOOD_REPORT, 'terminal', ['yes-1'])
    const ui = await $.ui.mount(message(GOOD_REPORT, 'terminal'))
    expect(await ui.find({ type: 'Text', text: /ask 2 of 7/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✓ 1 Stop the cleanup job deleting two…: yes/ })).toBeDefined()
    expect((await ui.find({ type: 'Button', key: 'send' }))?.props.label).toBe('Send 1 answer')
    await ui.unmount()
  })

  test('Back reopens the previous ask and Skip moves on without an answer', async ($, on) => {
    engine(on)
    await press($, GOOD_REPORT, 'terminal', ['yes-1', 'back-2', 'skip-1'])
    const ui = await $.ui.mount(message(GOOD_REPORT, 'terminal'))
    expect(await ui.find({ type: 'Text', text: /ask 2 of 7/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /· 1 .*: skipped/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'send' })).toBe(undefined)
    await ui.unmount()
  })

  test('the Ref line is always shown, with no Details button to hide it', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount(message(GOOD_REPORT, 'terminal'))
    expect(await ui.find({ type: 'Text', text: /Ref: PR app#133 · WP1/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'details-1' })).toBe(undefined)
    await ui.unmount()
  })

  test('a choice ask offers its options instead of Yes and No', async ($, on) => {
    engine(on)
    await press($, GOOD_REPORT, 'terminal', ['yes-1', 'yes-2', 'no-3', 'no-4', 'yes-5', 'skip-6'])
    const ui = await $.ui.mount(message(GOOD_REPORT, 'terminal'))
    expect(await ui.find({ type: 'Button', key: 'option-7-A' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'no-7' })).toBe(undefined)
    await ui.press({ key: 'option-7-A' })
    await ui.unmount()
    const end = await $.ui.mount(message(GOOD_REPORT, 'terminal'))
    expect(await end.find({ type: 'Text', text: /All 7 asks seen/ })).toBeDefined()
    await end.unmount()
  })

  test('Send on the terminal fills the prompt box with one message', async ($, on) => {
    const { filled, submitted } = engine(on)
    await press($, GOOD_REPORT, 'terminal', ['yes-1', 'skip-2', 'no-3', 'send'])
    expect(filled).toEqual(['Answers to the 13:36 report: 1 yes. 3 no. No answer yet: 2, 4, 5, 6, 7.'])
    expect(submitted).toEqual([])
    const ui = await $.ui.mount(message(GOOD_REPORT, 'terminal'))
    expect(await ui.find({ type: 'Text', text: /In the prompt box, press Enter to send/ })).toBeDefined()
    await ui.unmount()
  })

  test('Send on the phone sends straight away', async ($, on) => {
    const { filled, submitted } = engine(on)
    await press($, GOOD_REPORT, 'mobile', ['yes-1', 'yes-2', 'send'])
    expect(filled).toEqual([])
    expect(submitted).toEqual(['Answers to the 13:36 report: 1 yes. 2 yes. No answer yet: 3, 4, 5, 6, 7.'])
  })

  test('Send falls back to sending when the prompt box cannot be filled', async ($, on) => {
    const { submitted } = engine(on, false)
    await press($, GOOD_REPORT, 'desktop', ['no-1', 'send'])
    expect(submitted).toEqual(['Answers to the 13:36 report: 1 no. No answer yet: 2, 3, 4, 5, 6, 7.'])
  })
})

test('Send names the time the report arrived, not the time of the press', async ($, on) => {
  let now = REPORT_AT
  const { filled } = engine(on, true, () => now)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.turn.complete({ turnId: 't1', answer: GOOD_REPORT, durationMs: 1000, reason: 'answer', isAborted: false })
  now = new Date(2026, 10, 25, 15, 5).getTime()
  await press($, GOOD_REPORT, 'terminal', ['yes-1', 'send'])
  expect(filled[0]?.startsWith('Answers to the 13:36 report: 1 yes.')).toBe(true)
})

describe('Change', () => {
  test('opens a field in the band under the reply and saves what is typed there', async ($, on) => {
    const { filled } = engine(on)
    await press($, GOOD_REPORT, 'terminal', ['yes-1', 'yes-2', 'change-3'])
    const field = await $.ui.mount(band('terminal'))
    expect(await field.find({ type: 'Text', text: /Change for ask 3: Put the approved Acme fix batch live/ })).toBeDefined()
    await field.input({ key: 'change-text', text: 'wait until the third batch finishes', kind: 'submit' })
    await field.unmount()
    await press($, GOOD_REPORT, 'terminal', ['send'])
    expect(filled).toEqual([
      'Answers to the 13:36 report: 1 yes. 2 yes. 3 change: wait until the third batch finishes. No answer yet: 4, 5, 6, 7.',
    ])
  })

  test('on the phone, the next message goes to Claude as typed and is also kept as the change', async ($, on) => {
    const { submitted } = engine(on)
    await press($, GOOD_REPORT, 'mobile', ['change-1'])
    const result = await $.prompt.submit({ text: 'keep them until 20/12 instead', origin: { kind: 'bridge' }, wait: false })
    expect(result.drop).toBe(undefined)
    await $.prompt.submit({ text: 'unrelated question', origin: { kind: 'bridge' }, wait: false })
    await press($, GOOD_REPORT, 'mobile', ['send'])
    expect(submitted).toEqual([
      'keep them until 20/12 instead',
      'unrelated question',
      'Answers to the 13:36 report: 1 change: keep them until 20/12 instead. No answer yet: 2, 3, 4, 5, 6, 7.',
    ])
  })

  test('a typed "1 change: ..." prompt in the terminal reaches Claude word for word', async ($, on) => {
    const { submitted } = engine(on)
    await press($, GOOD_REPORT, 'terminal', ['change-1'])
    const typed = '1 change: the weekly spend limit can only be configured by me from Claude, not in the Slack channel itself.'
    const result = await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    expect(result.drop).toBe(undefined)
    expect(submitted).toEqual([typed])
    const second = '2 change: it does not have to be this strict, it can be decided by the model.'
    const again = await $.prompt.submit({ text: second, origin: { kind: 'composer' }, wait: false })
    expect(again.drop).toBe(undefined)
    expect(submitted).toEqual([typed, second])
  })

  test('Cancel closes the change without saving', async ($, on) => {
    const { submitted } = engine(on)
    await press($, GOOD_REPORT, 'terminal', ['change-1'])
    const field = await $.ui.mount(band('terminal'))
    await field.press({ key: 'cancel-change' })
    await field.unmount()
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
    expect(submitted).toEqual(['hello'])
  })
})

describe('Not ready', () => {
  test('an ask missing a required part shows Not ready and no Yes button', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(message(PROMOTE_NO_FAILURE_REASON, surface, `promote-${surface}`))
      expect(await ui.find({ type: 'Text', text: /Not ready: failure details for 2 of 2 failed tests/ })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'yes-1' })).toBe(undefined)
      expect(await ui.find({ type: 'Button', key: 'no-1' })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'change-1' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a spend ask with no time in Yes means keeps its Yes button and shows a hint', async ($, on) => {
    engine(on)
    const text = 'Ready.\n\n### Needs you\n1. Start the rollout watcher\n   Type: spend\n   Recommend: yes\n   Yes means: a worker watches the rollout chats.\n   No means: nothing happens.\n   Cost: about $2\n   Delivers: a list of bad chats\n   When: after the rollout\n'
    const ui = await $.ui.mount(message(text, 'terminal', 'hint'))
    expect(await ui.find({ type: 'Text', text: /Hint: no when it happens in "Yes means"/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Not ready/ })).toBe(undefined)
    expect(await ui.find({ type: 'Button', key: 'yes-1' })).toBeDefined()
    await ui.unmount()
  })

  test('a choice missing examples shows no option buttons', async ($, on) => {
    engine(on)
    await press($, BAD_REPORT, 'terminal', ['skip-1', 'skip-2', 'skip-3', 'skip-4'])
    const ui = await $.ui.mount(message(BAD_REPORT, 'terminal'))
    expect(await ui.find({ type: 'Text', text: /Not ready: a type/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'option-5-A' })).toBe(undefined)
    await ui.unmount()
  })
})

type Run = { text: string; color?: string; bold?: boolean; italic?: boolean }

const runsOf = (node: RenderElement | string, inherited: Omit<Run, 'text'> = {}): Run[] => {
  if (typeof node === 'string') return [{ text: node, ...inherited }]
  if (node.type === 'engine') return []
  const props = (node.props ?? {}) as Record<string, unknown>
  if (node.type === 'Text') {
    const style = {
      ...inherited,
      ...(typeof props.color === 'string' ? { color: props.color } : {}),
      ...(props.bold === true ? { bold: true } : {}),
      ...(props.italic === true ? { italic: true } : {}),
    }
    return (node.children ?? []).flatMap(child => runsOf(child as RenderElement | string, style))
  }
  if (node.type === 'Box' || node.type === 'Link') {
    const isColumn = props.flexDirection === 'column'
    return (node.children ?? []).flatMap(child => [...runsOf(child as RenderElement | string, inherited), ...(isColumn ? [{ text: '\n' }] : [])])
  }
  return []
}

const runOf = (runs: readonly Run[], text: string) => runs.find(run => run.text === text)

const lines = (runs: readonly Run[]) =>
  runs
    .map(run => run.text)
    .join('')
    .split('\n')
    .map(line => line.trimEnd())

const INKS = {
  heading: { color: '#heading', bold: true },
  recommend: { color: '#recommend', bold: true },
  risk: { color: '#risk' },
  caution: { color: '#caution' },
  done: { color: '#done' },
}

const withReplyColors = {
  plugins: [
    {
      name: 'reply-colors-stand-in',
      register(on: On) {
        on('engine.create', async ($, e, next) => {
          const beneath = await next(e)
          return {
            ...beneath,
            replyColors: {
              inks: ({ surface }: { surface: string }) => ({
                heading: { color: '#heading', bold: true },
                recommend: { color: '#recommend', bold: true },
                risk: { color: '#risk' },
                caution: { color: '#caution' },
                done: { color: surface === 'terminal' ? '#done' : 'success' },
              }),
              paint: ({ text, surface }: { text: string; surface: string }) => [{ text, color: `#painted-${surface}`, italic: true }],
            },
          }
        })
      },
    },
  ],
}

const PAINTED_VALUES = [
  'the batch goes live on Acme chats today at 16:00.',
  'it waits until 01/12, and the cleanup job keeps protecting it.',
  '46 of 48 passed',
  'a rider asking for a refund in Tagalog got the English article',
  'the Tagalog article is still in review.',
  'today Tagalog riders already get the English article, so nothing gets worse.',
  'a timeout on the order lookup in the test sandbox',
  'the sandbox order service was down for 3 minutes.',
  'the same test passed on the rerun at 14:10 and live lookups are unchanged.',
  'riders asking why they were charged a cancellation fee now get the fee rule and a refund check, instead of a generic apology.',
  'Rider: "Why was I charged 50 pesos?" Bot: "You cancelled 6 minutes after the driver accepted, so the fee applies. If the driver was late, I can check for a refund."',
  "re-promote yesterday's version from the change history; takes about 5 minutes.",
]

const cardRuns = async ($: Engine, surface: Surface = 'terminal') => {
  const ui = await $.ui.mount(message(SAMPLE_ASK, surface, `ask-${surface}`))
  const runs = runsOf(await ui.drawn())
  await ui.unmount()
  return runs
}

describe('card layout', () => {
  test('each failed test is its own block with Why and Safe because as their own labelled parts, parts spaced by blank lines', async ($, on) => {
    engine(on)
    await press($, GOOD_REPORT, 'terminal', ['skip-1', 'skip-2'])
    const ui = await $.ui.mount(message(GOOD_REPORT, 'terminal'))
    expect(await ui.find({ type: 'Text', text: /^Failed 1$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^a rider asking for a refund in Tagalog got the English article\.?$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Why:  $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^the Tagalog article is still in review/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Safe because:  $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Rollback  $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^re-promote yesterday/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Text', text: /^ $/ })).length).toBeGreaterThanOrEqual(13)
    await ui.unmount()
  })
})

describe('card colours from reply-colors', () => {
  test('every value goes through the shared colouring and every label takes its palette colour, word for word', withReplyColors, async ($, on) => {
    engine(on)
    const runs = await cardRuns($)
    expect(runOf(runs, 'Your call')).toMatchObject({ color: INKS.caution.color, bold: true })
    expect(runOf(runs, ' GO LIVE')?.color).toBe(INKS.caution.color)
    expect(runOf(runs, 'Yes means  ')).toMatchObject({ color: INKS.done.color, bold: true })
    expect(runOf(runs, 'No means  ')).toMatchObject({ color: INKS.risk.color, bold: true })
    expect(runOf(runs, 'Tests  ')).toMatchObject({ color: INKS.heading.color, bold: true })
    expect(runOf(runs, 'For customers  ')).toMatchObject({ color: INKS.heading.color, bold: true })
    expect(runOf(runs, 'Failed 1')).toMatchObject({ color: INKS.risk.color, bold: true })
    expect(runOf(runs, 'Why:  ')?.bold).toBe(true)
    expect(runOf(runs, 'Safe because:  ')?.bold).toBe(true)
    expect(runOf(runs, 'Needs you')?.color).toBe(INKS.caution.color)
    for (const value of PAINTED_VALUES) expect(runOf(runs, value)).toEqual({ text: value, color: '#painted-terminal', italic: true })
  })

  test('a recommendation takes the recommend colour', withReplyColors, async ($, on) => {
    engine(on)
    await press($, SAMPLE_ASK, 'terminal', ['skip-1'])
    const runs = await cardRuns($)
    expect(runOf(runs, 'Recommend: yes')).toMatchObject({ color: INKS.recommend.color, bold: true })
  })

  test('the card asks for the colours of the surface it is drawn on', withReplyColors, async ($, on) => {
    engine(on)
    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const runs = await cardRuns($, surface)
      expect(runOf(runs, surface === 'mobile' ? 'Yes means' : 'Yes means  ')).toMatchObject({ color: 'success', bold: true })
      for (const value of PAINTED_VALUES) expect(runOf(runs, value)?.color).toBe(`#painted-${surface}`)
    }
  })

  test('without reply-colors the card keeps its own theme colours and plain text', async ($, on) => {
    engine(on)
    const runs = await cardRuns($)
    expect(runOf(runs, 'Yes means  ')).toMatchObject({ color: 'success', bold: true })
    expect(runOf(runs, 'No means  ')).toMatchObject({ color: 'error', bold: true })
    expect(runOf(runs, 'Failed 1')).toMatchObject({ color: 'error', bold: true })
    expect(runOf(runs, '46 of 48 passed')).toEqual({ text: '46 of 48 passed' })
    expect(runOf(runs, ' GO LIVE')).toMatchObject({ color: 'warning', bold: true })
  })
})

describe('card spacing', () => {
  test('a blank line between every labelled part, buttons together at the bottom', withReplyColors, async ($, on) => {
    engine(on)
    const drawn = lines(await cardRuns($))
    const start = drawn.findIndex(line => line.startsWith('1  Put the approved'))
    const card = drawn.slice(start)
    const labelled = ['Your call', 'Yes means', 'No means', 'Tests', 'Failed 1', 'Why:', 'Safe because:', 'Failed 2', 'For customers', 'Example', 'Rollback']
    for (const label of labelled) {
      const at = card.findIndex(line => line.trimStart().startsWith(label))
      expect(at > 0 && card[at - 1]!.trim() === '').toBe(true)
    }
  })

  test('a blank line after the headline and before the Needs you row', withReplyColors, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount(message(SAMPLE_ASK, 'terminal', 'ask-rows'))
    const root = (await ui.drawn()) as RenderElement
    await ui.unmount()
    const rows = ('children' in root ? root.children ?? [] : []).flat(Infinity) as RenderElement[]
    const rowText = (row: RenderElement) => runsOf(row).map(run => run.text).join('')
    const kinds = rows.map(row => (row.type === 'Markdown' ? 'summary' : rowText(row).trim() === '' ? 'blank' : rowText(row).startsWith('Needs you  ask') ? 'needs-you' : 'other'))
    expect(kinds.slice(0, 5)).toEqual(['other', 'blank', 'summary', 'blank', 'needs-you'])
  })

  test('on the phone each label sits on its own line with its text indented under it', withReplyColors, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount(message(SAMPLE_ASK, 'mobile', 'ask-phone'))
    const json = JSON.stringify(await ui.drawn())
    expect(json).toContain('"paddingLeft":2')
    expect(await ui.find({ type: 'Text', text: /^Rollback$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'yes-1' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'details-1' })).toBe(undefined)
    await ui.unmount()
  })
})

const drawnWords = (node: unknown): string[] => {
  if (typeof node === 'string') return [node]
  if (node === null || typeof node !== 'object') return []
  const element = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const own = [element.props?.text, element.props?.label].filter((value): value is string => typeof value === 'string')
  return [...own, ...(element.children ?? []).flatMap(drawnWords)]
}

const wordsOf = (text: string) =>
  text
    .replace(/\*\*/g, '')
    .split(/[^\p{L}\p{N}#'/:-]+/u)
    .map(word => word.replace(/^[':-]+|[':-]+$/g, ''))
    .filter(word => word !== '')

const FIELD_LABEL = /^(\s*(?:\d+\.\s+)?)(?:Type:\s*\S+.*$|[A-Z][A-Za-z ]{1,24}:)/

const contentOf = (text: string) =>
  text
    .replace(/\*\*/g, '')
    .split('\n')
    .map(line => line.replace(FIELD_LABEL, '$1'))
    .join('\n')

const missingWords = async ($: Engine, text: string, surface: Surface, requestId: string) => {
  const ui = await $.ui.mount(message(text, surface, requestId))
  const shown = new Set(wordsOf(drawnWords(await ui.drawn()).join(' \n ')))
  await ui.unmount()
  return [...new Set(wordsOf(contentOf(text)))].filter(word => !shown.has(word))
}

describe('nothing hidden', () => {
  test('a prose answer that opens with "Needs you:" and carries an ask shows every word, on every surface', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      expect(await missingWords($, PROSE_ANSWER_WITH_ASK, surface, `prose-${surface}`)).toEqual([])
      const ui = await $.ui.mount(message(PROSE_ANSWER_WITH_ASK, surface, `prose-card-${surface}`))
      expect(await ui.find({ type: 'Text', text: /ask 1 of 1/ })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'yes-1' })).toBeDefined()
      expect(await ui.find({ type: 'Markdown', text: /Fourth ticket:\*\* waits on the Acme pricing answer/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Recommend: yes, because all three have green plans$/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('every word of a full report stays visible at every step of the walk-through', async ($, on) => {
    engine(on)
    const keys = ['skip-1', 'skip-2', 'skip-3', 'skip-4', 'skip-5', 'skip-6', 'option-7-A']
    for (let index = 0; index <= keys.length; index += 1) {
      expect(await missingWords($, GOOD_REPORT, 'terminal', `walk-${index}`)).toEqual([])
      expect(await missingWords($, BAD_REPORT, 'terminal', `walk-bad-${index}`)).toEqual([])
      if (index < keys.length) await press($, GOOD_REPORT, 'terminal', [keys[index]!])
    }
  })

  test('the ask on the card is not repeated in the text above it', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount(message(GOOD_REPORT, 'terminal'))
    const summary = await ui.find({ type: 'Markdown' })
    expect(String(summary?.props.text)).not.toContain('Stop the cleanup job deleting')
    expect(String(summary?.props.text)).toContain('Switch off the platform')
    await ui.unmount()
  })

  test('Send adds the answers under a draft already in the prompt box instead of replacing it', async ($, on) => {
    const { filled, fillModes } = engine(on, true, () => REPORT_AT, 'half-typed thought')
    await press($, GOOD_REPORT, 'terminal', ['yes-1', 'send'])
    expect(fillModes).toEqual(['append'])
    expect(filled[0]?.startsWith('\nAnswers to the 13:36 report: 1 yes.')).toBe(true)
  })
})
