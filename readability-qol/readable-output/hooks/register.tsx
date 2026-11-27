import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, PromptOrigin, Register, RenderElement, UiPressArgument } from 'claude-code'

import type { PendingChange, Pick, Step } from '../types'
import type { CardInk, CardInkRole, CardRun, CardSurface } from '../types/reply-colors'
import { missingParts, parseReport } from './shape'
import type { Ask, AskType, Report } from './shape'
import {
  answeredCount,
  answersMessage,
  freshStep,
  keepRecent,
  nonAskMarkdown,
  pickWords,
  progressBar,
  reportKey,
  shortTitle,
  withPick,
} from './steps'

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

const partView = (ui: ElementTable, ink: CardInk | undefined, label: string, runs: readonly CardRun[], isNarrow: boolean): RenderElement => {
  const { Box, Text } = ui
  const labelText = <Text bold {...(ink !== undefined ? { color: ink.color } : {})}>{isNarrow ? label : `${label}  `}</Text>
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

const STATE_COLORS: Record<string, string> = {
  Done: 'success',
  'Partly done': 'warning',
  'Needs you': 'warning',
  Running: 'suggestion',
  Blocked: 'error',
  Failed: 'error',
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

const stepOf = async ($: EngineInterface, key: string) =>
  (await read($, steps))[key] ?? freshStep(await $.clock.now())

const recordReport = async ($: EngineInterface, text: string) => {
  const report = parseReport(text)
  if (report === null || report.asks.length === 0) return
  const key = reportKey(report)
  const step = freshStep(await $.clock.now())
  await update($, steps, all => (all[key] === undefined ? keepRecent(all, key, step) : all))
}

const saveStep = async ($: EngineInterface, key: string, change: (step: Step) => Step) => {
  const now = await $.clock.now()
  return update($, steps, all => keepRecent(all, key, change(all[key] ?? freshStep(now))))
}

const answer = ($: EngineInterface, key: string, report: Report, ask: Ask, pick: Pick) =>
  saveStep($, key, step => withPick(report, step, ask, pick))

const startChange = async ($: EngineInterface, key: string, report: Report, ask: Ask) => {
  const position = report.asks.findIndex(one => one.number === ask.number)
  await update($, changing, () => ({ report: key, ask: ask.number, title: ask.title, position }))
  $.ui.toast(`Type the change for ask ${ask.number} in the field under the reply, or send it as your next message.`)
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

const send = async ($: EngineInterface, key: string, report: Report, press: UiPressArgument) => {
  const step = (await read($, steps))[key]
  if (step === undefined) return
  const text = answersMessage(report, step)
  await update($, changing, () => null)
  if (press.surface !== 'mobile') {
    const filled = await $.prompt.fill({ text, mode: 'replace', cursor: text.length })
    if (filled.isFilled) {
      await saveStep($, key, one => ({ ...one, sentText: `In the prompt box, press Enter to send: ${text}` }))
      return
    }
  }
  await $.prompt.submit({ text, asUser: true })
  await saveStep($, key, one => ({ ...one, sentText: `Sent: ${text}` }))
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await recordReport($, e.answer)
    return done
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary === true) return next(e)
    const report = parseReport(e.props.text)
    if (report === null || report.asks.length === 0) return next(e)
    const key = reportKey(report)
    const step = await stepOf($, key)
    const pending = await read($, changing)
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const total = report.asks.length
    const current = report.asks[step.index]
    const answered = answeredCount(step)
    const summary = nonAskMarkdown(report)
    const receipts = report.asks
      .filter(ask => step.picks[String(ask.number)] !== undefined)
      .map(ask => {
        const pick = step.picks[String(ask.number)]!
        const mark = pick.answer === 'skip' ? '·' : '✓'
        return `${mark} ${ask.number} ${shortTitle(ask.title, 34)}: ${pickWords(pick)}`
      })

    const ui = $.ui.resolve(e)
    const card = await cardOf($, e.surface)
    const isNarrow = e.surface === 'mobile' || (e.viewport?.columns !== undefined && e.viewport.columns < NARROW_COLUMNS)
    const paintPart = async (label: string, role: CardInkRole, value: string): Promise<PaintedPart> => ({ label, role, runs: await card.paint(value) })
    const painted =
      current === undefined
        ? undefined
        : {
            leads: [
              ...(current.type !== 'choice' && current.fields.yes !== undefined ? [await paintPart('Yes means', 'done', current.fields.yes)] : []),
              ...(current.type !== 'choice' && current.fields.no !== undefined ? [await paintPart('No means', 'risk', current.fields.no)] : []),
              ...(await Promise.all(partsOf(current).map(([label, value]) => paintPart(label, 'heading', value)))),
            ],
            failures:
              current.type === 'promote'
                ? await Promise.all(
                    current.failures.map(
                      async (failure): Promise<PaintedFailure> => ({
                        what: await card.paint(failure.what),
                        ...(failure.why ? { why: await card.paint(failure.why) } : {}),
                        ...(failure.safe ? { safe: await card.paint(failure.safe) } : {}),
                      }),
                    ),
                  )
                : [],
            trails: await Promise.all(afterFailuresOf(current).map(([label, value]) => paintPart(label, 'heading', value))),
          }
    const blank = (key: string) => <Text key={key}> </Text>
    const partBlock = (key: string, part: PaintedPart) => [blank(`gap-${key}`), <Box key={key}>{partView(ui, card.inks[part.role], part.label, part.runs, isNarrow)}</Box>]

    const askView = (ask: Ask) => {
      const missing = missingParts(ask)
      const isReady = missing.length === 0
      const tag = ask.type === undefined ? undefined : TYPE_TAGS[ask.type]
      const isChanging = pending !== null && pending.report === key && pending.ask === ask.number
      const pick = (one: Pick) => () => answer($, key, report, ask, one)
      const rec = ask.recommend?.trim()
      const isYourCall = rec !== undefined && /^your call/i.test(rec)
      const recInk = isYourCall ? card.inks.caution : card.inks.recommend
      return (
        <Box key={`ask-${ask.number}`} flexDirection="column" borderStyle="round" borderColor={isReady ? 'subtle' : 'error'} paddingX={1}>
          <Text>
            <Text bold>{ask.number}  {ask.title}</Text>
            {tag !== undefined && <Text color={card.inks[tag.role].color} bold>{` ${tag.tag}`}</Text>}
          </Text>
          <Text> </Text>
          {rec === undefined || rec === '' ? (
            <Text bold>No recommendation</Text>
          ) : (
            <Text bold color={recInk.color}>{isYourCall ? 'Your call' : `Recommend: ${rec}`}</Text>
          )}
          {painted?.leads.map((part, index) => partBlock(`lead-${index}`, part))}
          {painted?.failures.map((failure, index) => [
            blank(`gap-failed-${index}`),
            <Text key={`failed-${index}`} bold color={card.inks.risk.color}>{`Failed ${index + 1}`}</Text>,
            <Box key={`failed-body-${index}`} flexDirection="column" paddingLeft={2}>
              {runsView(ui, failure.what)}
              {failure.why && [blank(`gap-why-${index}`), partView(ui, undefined, 'Why:', failure.why, isNarrow)]}
              {failure.safe && [blank(`gap-safe-${index}`), partView(ui, undefined, 'Safe because:', failure.safe, isNarrow)]}
            </Box>,
          ])}
          {painted?.trails.map((part, index) => partBlock(`trail-${index}`, part))}
          {step.isRefShown && ask.ref !== undefined && [<Text> </Text>, <Text dimColor>Ref: {ask.ref}</Text>]}
          {!isReady && [<Text> </Text>, <Text color="error" bold>Not ready: {missing.join('; ')}</Text>]}
          {isChanging && [<Text> </Text>, <Text color="warning">Changing: type it in the field under the reply, or send it as your next message.</Text>]}
          <Text> </Text>
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {isReady && ask.type !== 'choice' && <Button key={`yes-${ask.number}`} label="Yes" variant="primary" onPress={pick({ answer: 'yes' })} />}
            {isReady &&
              ask.type === 'choice' &&
              ask.options.map(option => (
                <Button key={`option-${ask.number}-${option.label}`} label={`Option ${option.label}`} onPress={pick({ answer: 'option', text: option.label })} />
              ))}
            {ask.type !== 'choice' && <Button key={`no-${ask.number}`} label="No" onPress={pick({ answer: 'no' })} />}
            <Button key={`change-${ask.number}`} label="Change" onPress={() => startChange($, key, report, ask)} />
            <Button key={`skip-${ask.number}`} label="Skip" dimColor onPress={pick({ answer: 'skip' })} />
            {step.index > 0 && (
              <Button key={`back-${ask.number}`} label="← Back" dimColor onPress={() => saveStep($, key, one => ({ ...one, index: Math.max(0, one.index - 1) }))} />
            )}
            {ask.ref !== undefined && (
              <Button
                key={`details-${ask.number}`}
                label={step.isRefShown ? 'Hide details' : 'Details'}
                dimColor
                onPress={() => saveStep($, key, one => ({ ...one, isRefShown: !one.isRefShown }))}
              />
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
        <Text bold color={STATE_COLORS[report.state ?? ''] ?? 'text'}>{report.headline}</Text>
        {summary !== '' && [blank('gap-summary'), <Markdown key="summary" text={summary} />]}
        {blank('gap-needs-you')}
        <Text>
          <Text bold color={card.inks.caution.color}>Needs you</Text>
          <Text>  ask {Math.min(step.index + 1, total)} of {total}  </Text>
          <Text color={card.inks.heading.color}>{progressBar(Math.min(step.index, total), total)}</Text>
        </Text>
        {receipts.length > 0 && <Text dimColor>{receipts.join('   ')}</Text>}
        {current === undefined ? endView : askView(current)}
        {step.sentText !== null ? (
          <Text color="success">{step.sentText}</Text>
        ) : (
          answered > 0 && (
            <Box flexDirection="row" columnGap={1}>
              <Button key="send" label={`Send ${answered} answer${answered === 1 ? '' : 's'}`} variant="primary" onPress={press => send($, key, report, press)} />
              {current !== undefined && <Text dimColor>or keep going; unanswered asks are sent as "no answer yet"</Text>}
            </Box>
          )
        )}
      </Box>
    )
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
          placeholder="Type the change, then Enter. Or send it as your next message."
          submitLabel="save"
          autoFocus
          onSubmit={value => saveChange($, pending, value)}
        />
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor>Your next message also becomes the change for ask {pending.ask}.</Text>
          <Button key="cancel-change" label="Cancel" dimColor onPress={() => update($, changing, () => null)} />
        </Box>
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    const pending = await read($, changing)
    if (pending === null || e.command !== undefined || !isPersonTyping(e.origin)) return next(e)
    if (e.origin.kind === 'plugin') return next(e)
    await saveChange($, pending, e.text)
    return { drop: `Saved as the change for ask ${pending.ask}. Press Send in the report when you are ready.` }
  }).catch(($, e, next) => next(e))
}
