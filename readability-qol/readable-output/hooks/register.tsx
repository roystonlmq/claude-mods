import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, PromptOrigin, Register, RenderElement, UiPressArgument } from 'claude-code'

import type { PendingChange, Pick, Step } from '../types'
import type { CardInk, CardInkRole, CardRun, CardSurface } from '../types/reply-colors'
import { bodyText, findAsks, missingParts, sameAsk, timingHints } from './shape'
import type { Ask, AskType } from './shape'
import { answeredCount, answersMessage, freshStep, keepRecent, messageKey, pickWords, progressBar, shortTitle, withPick } from './steps'

const steps = atom({ plugin: 'readable-output', key: 'steps' } as const, {} as Record<string, Step>, { shape: 'steps-1' })
const changing = atom({ plugin: 'readable-output', key: 'changing' } as const, null as PendingChange | null, { shape: 'changing-1' })

const TYPE_TAGS: Record<AskType, { tag: string; role: CardInkRole }> = {
  promote: { tag: 'GO LIVE', role: 'caution' },
  delete: { tag: 'DELETE', role: 'risk' },
  merge: { tag: 'CODE CHANGE', role: 'heading' },
  message: { tag: 'MESSAGE', role: 'heading' },
  spend: { tag: 'SPEND', role: 'caution' },
  choice: { tag: 'CHOICE', role: 'heading' },
  decide: { tag: 'DECISION', role: 'heading' },
}

const PLAIN_INKS: Record<CardInkRole, CardInk> = {
  heading: { color: 'suggestion', bold: true },
  recommend: { color: 'success', bold: true },
  risk: { color: 'error', bold: true },
  caution: { color: 'warning', bold: true },
  done: { color: 'success', bold: true },
}

const NARROW_COLUMNS = 60
const HISTORY_ROWS = 200

type Card = {
  inks: Record<CardInkRole, CardInk>
  paint: (text: string) => Promise<CardRun[]>
}

const cardOf = async ($: EngineInterface, surface: CardSurface): Promise<Card> => {
  try {
    const inks = await $.replyColors.inks({ surface })
    return {
      inks,
      paint: async text => {
        try {
          return await $.replyColors.paint({ text, surface })
        } catch {
          return [{ text }]
        }
      },
    }
  } catch {
    return { inks: PLAIN_INKS, paint: async text => [{ text }] }
  }
}

type PaintedPart = { label: string; role: CardInkRole; runs: CardRun[] }

type PaintedFailure = { what: CardRun[]; why?: CardRun[]; safe?: CardRun[] }

type Painted = { leads: PaintedPart[]; failures: PaintedFailure[]; trails: PaintedPart[] }

const runsView = (ui: ElementTable, runs: readonly CardRun[]) => {
  const { Text, Link } = ui
  return (
    <Text>
      {runs.map(run => {
        const style = {
          ...(run.color !== undefined ? { color: run.color } : {}),
          ...(run.bold ? { bold: true } : {}),
          ...(run.italic ? { italic: true } : {}),
        }
        return run.href !== undefined ? (
          <Text {...style}>
            <Link href={run.href}>{run.text}</Link>
          </Text>
        ) : (
          <Text {...style}>{run.text}</Text>
        )
      })}
    </Text>
  )
}

const partView = (ui: ElementTable, ink: CardInk, label: string, runs: readonly CardRun[], isNarrow: boolean): RenderElement => {
  const { Box, Text } = ui
  const labelText = (
    <Text bold color={ink.color}>
      {isNarrow ? label : `${label}  `}
    </Text>
  )
  if (isNarrow) {
    return (
      <Box flexDirection="column">
        {labelText}
        <Box flexDirection="column" paddingLeft={2}>
          {runsView(ui, runs)}
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="row">
      <Box flexShrink={0}>{labelText}</Box>
      <Box flexDirection="column" flexShrink={1}>
        {runsView(ui, runs)}
      </Box>
    </Box>
  )
}

const REPLYING_ORIGINS: ReadonlySet<PromptOrigin['kind']> = new Set(['composer', 'bridge'])

const isPersonTyping = (origin: PromptOrigin) =>
  REPLYING_ORIGINS.has(origin.kind) || (origin.kind === 'plugin' && 'asUser' in origin && origin.asUser === true)

const partsOf = (ask: Ask): [string, string][] => {
  const field = (label: string, key: string): [string, string][] => {
    const value = ask.fields[key]
    return value === undefined || value.trim() === '' ? [] : [[label, value]]
  }
  if (ask.type === 'promote') return [...field('Tests', 'tests')]
  if (ask.type === 'delete') return [...field('What goes', 'goes'), ...field('Restorable', 'restorable'), ...field('If wrong', 'ifWrong')]
  if (ask.type === 'merge') return [...field('Changes', 'behaviour'), ...field('Tests', 'tests'), ...field('Still open', 'open')]
  if (ask.type === 'message') return [...field('To', 'to'), ...field('Draft', 'draft'), ...field('Why now', 'whyNow')]
  if (ask.type === 'spend') return [...field('Cost', 'cost'), ...field('Delivers', 'delivers'), ...field('When', 'when')]
  if (ask.type === 'choice') {
    return ask.options.map((option): [string, string] => [
      `Option ${option.label}`,
      option.example ? `${option.outcome} Example: ${option.example}` : option.outcome,
    ])
  }
  return []
}

const SHOWN_FIELDS: Record<AskType, readonly string[]> = {
  promote: ['tests', 'customers', 'example', 'rollback'],
  delete: ['goes', 'restorable', 'ifWrong'],
  merge: ['behaviour', 'tests', 'open'],
  message: ['to', 'draft', 'whyNow'],
  spend: ['cost', 'delivers', 'when'],
  choice: [],
  decide: [],
}

const extrasOf = (ask: Ask): [string, string][] => {
  const shown = new Set([
    'recommend',
    'ref',
    ...(ask.type === undefined ? [] : ['type', ...SHOWN_FIELDS[ask.type]]),
    ...(ask.type === 'choice' ? [] : ['yes', 'no']),
  ])
  const fields = Object.entries(ask.fields)
    .filter(([key, value]) => !shown.has(key) && value.trim() !== '')
    .map(([key, value]): [string, string] => [ask.labels[key] ?? key, value])
  const failures =
    ask.type === 'promote'
      ? []
      : ask.failures.map((failure): [string, string] => [
          'Failed',
          [failure.what, failure.why && `Why: ${failure.why}`, failure.safe && `Safe because: ${failure.safe}`].filter(Boolean).join(' '),
        ])
  return [...fields, ...failures, ...(ask.loose.length === 0 ? [] : [['Also', ask.loose.join('\n')] as [string, string]])]
}

const afterFailuresOf = (ask: Ask): [string, string][] => {
  if (ask.type !== 'promote') return []
  return (
    [
      ['For customers', ask.fields.customers],
      ['Example', ask.fields.example],
      ['Rollback', ask.fields.rollback],
    ] as [string, string | undefined][]
  ).filter((part): part is [string, string] => part[1] !== undefined && part[1].trim() !== '')
}

const paintAsk = async (card: Card, ask: Ask): Promise<Painted> => {
  const paintPart = async (label: string, role: CardInkRole, value: string): Promise<PaintedPart> => ({ label, role, runs: await card.paint(value) })
  return {
    leads: [
      ...(ask.type !== 'choice' && ask.fields.yes !== undefined ? [await paintPart('Yes means', 'done', ask.fields.yes)] : []),
      ...(ask.type !== 'choice' && ask.fields.no !== undefined ? [await paintPart('No means', 'risk', ask.fields.no)] : []),
      ...(await Promise.all(partsOf(ask).map(([label, value]) => paintPart(label, 'heading', value)))),
    ],
    failures:
      ask.type === 'promote'
        ? await Promise.all(
            ask.failures.map(
              async (failure): Promise<PaintedFailure> => ({
                what: await card.paint(failure.what),
                ...(failure.why ? { why: await card.paint(failure.why) } : {}),
                ...(failure.safe ? { safe: await card.paint(failure.safe) } : {}),
              }),
            ),
          )
        : [],
    trails: await Promise.all([...afterFailuresOf(ask), ...extrasOf(ask)].map(([label, value]) => paintPart(label, 'heading', value))),
  }
}

const isLaterFixed = async ($: EngineInterface, text: string, ask: Ask) => {
  try {
    const result = await $.session.messages({ last: HISTORY_ROWS })
    if (!Array.isArray(result)) return false
    const rows = result
    const at = rows.findIndex(row => row.role === 'assistant' && row.text.includes(text))
    if (at === -1) return false
    return rows
      .slice(at + 1)
      .filter(row => row.role === 'assistant')
      .some(row => findAsks(row.text).asks.some(later => sameAsk(later, ask) && missingParts(later).length === 0))
  } catch {
    return false
  }
}

const saveStep = async ($: EngineInterface, key: string, change: (step: Step) => Step) => {
  const now = await $.clock.now()
  return update($, steps, all => keepRecent(all, key, change(all[key] ?? freshStep(now))))
}

const startChange = async ($: EngineInterface, key: string, asks: readonly Ask[], ask: Ask) => {
  const position = asks.findIndex(one => one.number === ask.number)
  await update($, changing, () => ({ report: key, ask: ask.number, title: ask.title, position }))
  $.ui.toast(`Type the change for ask ${ask.number} in the field under the reply. A message you send also goes to Claude and is kept as the change.`)
}

const saveChange = async ($: EngineInterface, pending: PendingChange, text: string) => {
  const trimmed = text.trim()
  await update($, changing, () => null)
  if (trimmed === '') return
  await saveStep($, pending.report, step => ({
    ...step,
    picks: { ...step.picks, [String(pending.ask)]: { answer: 'change', text: trimmed } },
    index: Math.max(step.index, pending.position + 1),
    sentText: null,
  }))
}

const send = async ($: EngineInterface, key: string, asks: readonly Ask[], press: UiPressArgument) => {
  const step = (await read($, steps))[key]
  if (step === undefined) return
  const text = answersMessage(asks, step)
  await update($, changing, () => null)
  if (press.surface !== 'mobile') {
    const draft = await $.prompt.read().then(box => box.text, () => '')
    const filled =
      draft.trim() === ''
        ? await $.prompt.fill({ text, mode: 'replace', cursor: text.length })
        : await $.prompt.fill({ text: `\n${text}`, mode: 'append' })
    if (filled.isFilled) {
      await saveStep($, key, one => ({ ...one, sentText: `In the prompt box, press Enter to send: ${text}` }))
      return
    }
  }
  await $.prompt.submit({ text, asUser: true })
  await saveStep($, key, one => ({ ...one, sentText: `Sent: ${text}` }))
}

type CardInput = {
  ui: ElementTable
  card: Card
  text: string
  asks: readonly Ask[]
  isFenced: boolean
  isNarrow: boolean
}

const drawCards = async ($: EngineInterface, { ui, card, text, asks, isFenced, isNarrow }: CardInput): Promise<RenderElement> => {
  const { Box, Text, Button } = ui
  const key = messageKey(text)
  const step = (await read($, steps))[key] ?? freshStep(await $.clock.now())
  const pending = await read($, changing)
  const total = asks.length
  const current = asks[step.index]
  const answered = answeredCount(step)
  const receipts = asks
    .filter(ask => step.picks[String(ask.number)] !== undefined)
    .map(ask => {
      const pick = step.picks[String(ask.number)]!
      return `${pick.answer === 'skip' ? '·' : '✓'} ${ask.number} ${shortTitle(ask.title, 34)}: ${pickWords(pick)}`
    })
  const missing = current === undefined ? [] : missingParts(current)
  const isFixedLater = current !== undefined && missing.length > 0 && (await isLaterFixed($, text, current))
  const painted = current !== undefined && isFenced ? await paintAsk(card, current) : undefined
  const blank = (id: string) => <Text key={id}> </Text>
  const partBlock = (id: string, part: PaintedPart) => [blank(`gap-${id}`), <Box key={id}>{partView(ui, card.inks[part.role], part.label, part.runs, isNarrow)}</Box>]
  const pickOf = (ask: Ask, one: Pick) => () => saveStep($, key, all => withPick(asks, all, ask, one))

  const askView = (ask: Ask) => {
    const isReady = missing.length === 0
    const hints = timingHints(ask)
    const tag = ask.type === undefined ? undefined : TYPE_TAGS[ask.type]
    const isChanging = pending !== null && pending.report === key && pending.ask === ask.number
    const rec = ask.recommend?.trim()
    const isYourCall = rec !== undefined && /^your call\W*$/i.test(rec)
    const recInk = isYourCall ? card.inks.caution : card.inks.recommend
    const canAnswer = !isFixedLater
    return (
      <Box key={`ask-${ask.number}`} flexDirection="column" borderStyle="round" borderColor={isReady || isFixedLater ? 'subtle' : 'error'} paddingX={1}>
        <Text>
          <Text bold color={card.inks.heading.color}>
            {ask.number}  {ask.title}
          </Text>
          {tag !== undefined && <Text color={card.inks[tag.role].color} bold>{` ${tag.tag}`}</Text>}
        </Text>
        <Text> </Text>
        {rec === undefined || rec === '' ? (
          <Text bold color={card.inks.caution.color}>
            No recommendation
          </Text>
        ) : (
          <Text bold color={recInk.color}>
            {isYourCall ? 'Your call' : `Recommend: ${rec}`}
          </Text>
        )}
        {painted?.leads.map((part, index) => partBlock(`lead-${index}`, part))}
        {painted?.failures.map((failure, index) => [
          blank(`gap-failed-${index}`),
          <Text key={`failed-${index}`} bold color={card.inks.risk.color}>{`Failed ${index + 1}`}</Text>,
          <Box key={`failed-body-${index}`} flexDirection="column" paddingLeft={2}>
            {runsView(ui, failure.what)}
            {failure.why && [blank(`gap-why-${index}`), partView(ui, card.inks.heading, 'Why:', failure.why, isNarrow)]}
            {failure.safe && [blank(`gap-safe-${index}`), partView(ui, card.inks.heading, 'Safe because:', failure.safe, isNarrow)]}
          </Box>,
        ])}
        {painted?.trails.map((part, index) => partBlock(`trail-${index}`, part))}
        {isFenced && ask.ref !== undefined && [<Text key="gap-ref"> </Text>, <Text key="ref" dimColor>Ref: {ask.ref}</Text>]}
        {isFixedLater && [<Text key="gap-later"> </Text>, <Text key="later" color={card.inks.done.color} bold>Updated in a later reply: answer it there.</Text>]}
        {!isReady && !isFixedLater && [<Text key="gap-missing"> </Text>, <Text key="missing" color="error" bold>Not ready: {missing.join('; ')}</Text>]}
        {hints.length > 0 && [<Text key="gap-hint"> </Text>, <Text key="hint" color="warning">Hint: no {hints.join('; ')}</Text>]}
        {isChanging && [<Text key="gap-changing"> </Text>, <Text key="changing" color="warning">Changing: type it in the field under the reply, or send it as your next message to Claude.</Text>]}
        <Text> </Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {canAnswer && isReady && ask.type !== 'choice' && <Button key={`yes-${ask.number}`} label="Yes" variant="primary" onPress={pickOf(ask, { answer: 'yes' })} />}
          {canAnswer &&
            isReady &&
            ask.type === 'choice' &&
            ask.options.map(option => (
              <Button key={`option-${ask.number}-${option.label}`} label={`Option ${option.label}`} onPress={pickOf(ask, { answer: 'option', text: option.label })} />
            ))}
          {canAnswer && ask.type !== 'choice' && <Button key={`no-${ask.number}`} label="No" onPress={pickOf(ask, { answer: 'no' })} />}
          {canAnswer && <Button key={`change-${ask.number}`} label="Change" onPress={() => startChange($, key, asks, ask)} />}
          <Button key={`skip-${ask.number}`} label="Skip" dimColor onPress={pickOf(ask, { answer: 'skip' })} />
          {step.index > 0 && (
            <Button key={`back-${ask.number}`} label="← Back" dimColor onPress={() => saveStep($, key, one => ({ ...one, index: Math.max(0, one.index - 1) }))} />
          )}
        </Box>
      </Box>
    )
  }

  const endView = (
    <Box key="end" flexDirection="column">
      <Text>{total === 1 ? 'The only ask is seen.' : `All ${total} asks seen.`}</Text>
      <Box flexDirection="row" columnGap={1}>
        <Button key="back-end" label="← Back" dimColor onPress={() => saveStep($, key, one => ({ ...one, index: Math.max(0, total - 1) }))} />
      </Box>
    </Box>
  )

  return (
    <Box flexDirection="column">
      {blank('gap-needs-you')}
      <Text>
        <Text bold color={card.inks.caution.color}>
          Needs you
        </Text>
        <Text>
          {'  '}ask {Math.min(step.index + 1, total)} of {total}{'  '}
        </Text>
        <Text color={card.inks.heading.color}>{progressBar(Math.min(step.index, total), total)}</Text>
      </Text>
      {receipts.length > 0 && <Text dimColor>{receipts.join('   ')}</Text>}
      {current === undefined ? endView : askView(current)}
      {step.sentText !== null ? (
        <Text color="success">{step.sentText}</Text>
      ) : (
        answered > 0 && (
          <Box flexDirection="row" columnGap={1}>
            <Button key="send" label={`Send ${answered} answer${answered === 1 ? '' : 's'}`} variant="primary" onPress={press => send($, key, asks, press)} />
            {current !== undefined && <Text dimColor>or keep going; unanswered asks are sent as "no answer yet"</Text>}
          </Box>
        )
      )}
    </Box>
  )
}

const isButton = (node: unknown) => typeof node === 'object' && node !== null && (node as { type?: string }).type === 'Button'

const withCardsBeforeButtons = (Box: ElementTable['Box'], row: RenderElement, cards: RenderElement): RenderElement => {
  const children = row.type === 'Box' && row.props?.flexDirection === 'column' ? (row.children ?? []) : undefined
  if (children === undefined || !isButton(children.at(-1))) {
    return (
      <Box flexDirection="column">
        {row}
        {cards}
      </Box>
    )
  }
  let firstButton = children.length
  while (firstButton > 0 && isButton(children[firstButton - 1])) firstButton -= 1
  return { ...row, children: [...children.slice(0, firstButton), cards, ...children.slice(firstButton)] } as RenderElement
}

export const register: Register = on => {
  on('engine.create', async ($, e, next) => {
    const beneath = await next(e)
    return { ...beneath, readableOutput: { bodyText: ({ text }: { text: string }) => bodyText(text) } }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && findAsks(e.answer).asks.length > 0) await saveStep($, messageKey(e.answer), step => step)
    return done
  })

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    $.ui.invalidate('ui.render')
    return started
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const row = await next(e)
    if (e.props.isSummary === true) return row
    const { asks, isFenced } = findAsks(e.props.text)
    if (asks.length === 0) return row
    const { Box } = $.ui.resolve(e)
    try {
      const cards = await drawCards($, {
        ui: $.ui.resolve(e),
        card: await cardOf($, e.surface),
        text: e.props.text,
        asks,
        isFenced,
        isNarrow: e.surface === 'mobile' || (e.viewport?.columns !== undefined && e.viewport.columns < NARROW_COLUMNS),
      })
      return withCardsBeforeButtons(Box, row, cards)
    } catch (error) {
      $.ui.log(`readable-output: card not drawn: ${String(error)}`, { to: 'debug' })
      return row
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const pending = await read($, changing)
    if (pending === null || e.props.hasSurvey) return next(e)
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text color="warning">Change for ask {pending.ask}: {shortTitle(pending.title, 60)}</Text>
        <Input
          key="change-text"
          placeholder="Type the change, then Enter. Or send it to Claude as your next message."
          submitLabel="save"
          autoFocus
          onSubmit={value => saveChange($, pending, value)}
        />
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor>Your next message goes to Claude and is also kept as the change for ask {pending.ask}.</Text>
          <Button key="cancel-change" label="Cancel" dimColor onPress={() => update($, changing, () => null)} />
        </Box>
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    const pending = await read($, changing)
    if (pending === null || e.command !== undefined || !isPersonTyping(e.origin)) return next(e)
    if (e.origin.kind === 'plugin') return next(e)
    await saveChange($, pending, e.text).catch(error => $.ui.log(`readable-output: change not kept: ${String(error)}`, { to: 'debug' }))
    return next(e)
  }).catch(($, e, next) => next(e))
}
