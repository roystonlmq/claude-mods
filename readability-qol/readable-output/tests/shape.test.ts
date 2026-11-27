import { describe, expect, test } from 'claude-code/testing'

import { bodyText, codeNamesIn, findAsks, parseAskBlock, sameAsk, hasWhen, missingParts, parseReport, timingHints } from '../hooks/shape'
import { answersMessage, freshStep, withPick } from '../hooks/steps'
import { BAD_REPORT, GOOD_FENCED, GOOD_REPORT, INCOMPLETE_ASK, PLAIN_CHAT, PROMOTE_NO_FAILURE_REASON, PROSE_STATUS } from './fixtures'

const parsed = (text: string) => {
  const report = parseReport(text)
  if (report === null) throw new Error('expected a report')
  return report
}

const problemsOf = (asks: readonly Parameters<typeof missingParts>[0][]) =>
  asks.map(ask => ({ ask: ask.number, missing: missingParts(ask) })).filter(one => one.missing.length > 0)

const problemFor = (text: string, ask: number) => problemsOf(parsed(text).asks).find(one => one.ask === ask)?.missing ?? []

describe('parser', () => {
  test('reads the headline, sections and every ask of the good report', async () => {
    const report = parsed(GOOD_REPORT)
    expect(report.state).toBe('Needs you')
    expect(report.headline).toBe('Needs you: Acme cleanup job is live with the 4-day rule')
    expect(report.sections.map(section => section.name)).toEqual(['Done', 'Caught', 'Not possible', 'Needs you', 'Running'])
    expect(report.asks.map(ask => ask.number)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(report.asks.map(ask => ask.type)).toEqual(['merge', 'decide', 'promote', 'delete', 'message', 'spend', 'choice'])
  })

  test('keeps code names on the Ref line, not in the title', async () => {
    const first = parsed(GOOD_REPORT).asks[0]!
    expect(first.title).toBe('Stop the cleanup job deleting two Acme bot changes that are waiting for Sam')
    expect(first.ref).toBe('PR app#901 · WP9')
  })

  test('splits each promote failure into what, why and why it is safe', async () => {
    const promote = parsed(GOOD_REPORT).asks[2]!
    expect(promote.failures.length).toBe(2)
    expect(promote.failures[0]).toEqual({
      what: 'a rider asking for a refund in Tagalog got the English article',
      why: 'the Tagalog article is still in review.',
      safe: 'today Tagalog riders already get the English article, so nothing gets worse.',
    })
  })

  test('reads a quoted draft under Draft and the options of a choice', async () => {
    const report = parsed(GOOD_REPORT)
    expect(report.asks[4]!.fields.draft).toBe(
      'Hi Sam, two bot changes waiting for you are now protected until 15/12, so nothing you are reviewing will be cleared.',
    )
    expect(report.asks[6]!.options.map(option => option.label)).toEqual(['A', 'B'])
    expect(report.asks[6]!.options[1]!.example).toBe('a motorbike rider sees "For cars only" above the toll article.')
  })

  test('a plain chat reply is not a report', async () => {
    expect(parseReport(PLAIN_CHAT)).toBe(null)
  })
})

describe('required parts', () => {
  test('the good report has every required part', async () => {
    expect(problemsOf(parsed(GOOD_REPORT).asks)).toEqual([])
  })

  test('a promote ask with failed tests and no explanation is not ready', async () => {
    expect(problemFor(PROMOTE_NO_FAILURE_REASON, 1)).toEqual([
      'why the 2 failed tests are safe ("Failed: what failed. Why: ... Safe because: ..."; one line can cover a group)',
    ])
  })

  test('a promote ask names its missing example and rollback', async () => {
    const missing = problemFor(BAD_REPORT, 2)
    expect(missing.some(part => part.startsWith('why the 2 failed tests are safe'))).toBe(true)
    expect(missing.includes('one sample chat or example')).toBe(true)
    expect(missing.includes('how to roll back')).toBe(true)
  })

  test('reads numbered failure labels, and one explained line covers the group', async () => {
    const lines = '   Failed test 1: unknown. Why: unknown. Safe because: unknown.\n   Failure 2: Failed: the sandbox timed out. Why: the order service was down. Safe because: it passed on rerun at 14:10.\n'
    const text = PROMOTE_NO_FAILURE_REASON.replace('   Customer change:', `${lines}   Customer change:`)
    const ask = parsed(text).asks[0]!
    expect(ask.failures.map(one => one.what)).toEqual(['unknown', 'the sandbox timed out'])
    expect(ask.fields.tests).toBe('46 of 48 passed')
    expect(missingParts(ask)).toEqual([])
    const unexplained = PROMOTE_NO_FAILURE_REASON.replace('   Customer change:', '   Failed test 1: unknown. Why: unknown. Safe because: unknown.\n   Customer change:')
    expect(missingParts(parsed(unexplained).asks[0]!)[0]?.startsWith('why the 2 failed tests are safe')).toBe(true)
  })

  test('a delete ask needs what goes, restorable and what breaks', async () => {
    expect(problemFor(BAD_REPORT, 3)).toEqual([
      'what goes, in plain words',
      'whether it can be restored ("Restorable: yes, for 30 days" or "no")',
      'what breaks if it should not have gone',
    ])
  })

  test('a message ask needs the draft and why now', async () => {
    expect(problemFor(BAD_REPORT, 4)).toEqual(['the draft text', 'why now'])
  })

  test('an ask without a type or a No means is caught, and a merge needs no date', async () => {
    expect(problemFor(BAD_REPORT, 5)[0]).toBe('a type (one of promote, delete, merge, message, spend, choice, decide)')
    const merge = problemFor(BAD_REPORT, 1)
    expect(merge.some(part => part.startsWith('when it happens'))).toBe(false)
    expect(merge.includes('"No means"')).toBe(true)
    expect(merge.includes('plain words instead of code names (move WP9 to the Ref line)')).toBe(true)
  })

  test('a restorable delete must say for how long', async () => {
    const text = PROMOTE_NO_FAILURE_REASON.replace(/1\. Put[\s\S]*$/, '1. Delete the August draft\n   Type: delete\n   Recommend: no\n   Yes means: today it goes.\n   No means: it stays until 01/12.\n   What goes: the August draft.\n   Restorable: yes\n   If wrong: the draft is rebuilt by hand.\n')
    expect(missingParts(parsed(text).asks[0]!)).toEqual(['for how long it can be restored'])
  })

  test('a part that plainly says the fact is unknown is accepted', async () => {
    const asks = [
      '1. Merge the cleanup fix\n   Type: merge\n   Recommend: yes\n   Yes means: unknown until the rerun finishes.\n   No means: the job keeps clearing changes until 01/12.\n   Behaviour change: the job skips protected changes.\n   Tests: not run yet, the sandbox is down.\n   Still open: nothing\n',
      '2. Delete the August draft\n   Type: delete\n   Recommend: no\n   Yes means: today it goes.\n   No means: it stays until 01/12.\n   What goes: the August draft.\n   Restorable: unknown, I will check the backup today.\n   If wrong: the draft is rebuilt by hand.\n',
      '3. Put the fix batch live\n   Type: promote\n   Recommend: no\n   Yes means: live today at 16:00.\n   No means: it waits until 01/12.\n   Tests: not known yet, the run is still going.\n   Customer change: riders get the new article.\n   Example: a rider asks about tolls.\n   Rollback: unknown, I will check before going live.\n',
    ]
    const report = parsed(`Needs you: three asks\n\n### Needs you\n${asks.join('\n')}`)
    expect(problemsOf(report.asks)).toEqual([])
  })

  test('words that only mention unknown, or a blank part, are still caught', async () => {
    const text = 'Needs you: one ask\n\n### Needs you\n1. Merge the cleanup fix\n   Type: merge\n   Recommend: yes\n   Yes means: the unknown cases get handled.\n   No means: it waits until 01/12.\n   Behaviour change: the job skips protected changes.\n   Tests:\n   Still open: nothing\n'
    expect(missingParts(parsed(text).asks[0]!)).toEqual(['test results ("Tests: X of Y passed")'])
  })

  test('a missing time is a card hint for promote, spend and message only, never a missing part', async () => {
    const ask = (type: string) =>
      `Needs you: one ask\n\n### Needs you\n1. Do the thing\n   Type: ${type}\n   Recommend: yes\n   Yes means: it happens.\n   No means: it does not.\n`
    const timing = (type: string) => {
      const one = parsed(ask(type)).asks[0]!
      expect(missingParts(one).some(part => part.startsWith('when it happens'))).toBe(false)
      return timingHints(one)
    }
    expect(timing('decide')).toEqual([])
    expect(timing('delete')).toEqual([])
    expect(timing('merge')).toEqual([])
    expect(timing('promote')).toEqual(['when it happens in "Yes means" (today, 29/11, 16:00)'])
    expect(timing('spend').length).toBe(1)
    expect(timing('message').length).toBe(1)
  })

  test('a prose status reply with headings and no asks has no problems', async () => {
    const report = parseReport(PROSE_STATUS)
    expect(report === null ? [] : problemsOf(report.asks)).toEqual([])
  })

  test('an incomplete ask names only what is missing', async () => {
    const problems = problemsOf(parsed(INCOMPLETE_ASK).asks)
    expect(problems.map(one => one.ask)).toEqual([1])
    expect(problems[0]!.missing.some(part => part.includes('whether it can be restored'))).toBe(true)
  })

  test('dates and code names are recognised', async () => {
    expect(hasWhen('on 29/11 they stay')).toBe(true)
    expect(hasWhen('goes live today at 16:00')).toBe(true)
    expect(hasWhen('it stays')).toBe(false)
    expect(codeNamesIn('merge PR #901 for WP9 at 9c8b7a6f')).toEqual(['PR #901', 'WP9', '9c8b7a6f'])
    expect(codeNamesIn('Acme riders on 29/11')).toEqual([])
  })
})

describe('answer message', () => {
  test('builds one message with every pick and the open asks', async () => {
    const report = parsed(GOOD_REPORT)
    let step = { ...freshStep(0), at: '13:36' }
    step = withPick(report.asks, step, report.asks[0]!, { answer: 'yes' })
    step = withPick(report.asks, step, report.asks[2]!, { answer: 'change', text: 'wait for the third batch' })
    step = withPick(report.asks, step, report.asks[3]!, { answer: 'no' })
    step = withPick(report.asks, step, report.asks[4]!, { answer: 'skip' })
    step = withPick(report.asks, step, report.asks[6]!, { answer: 'option', text: 'A' })
    expect(answersMessage(report.asks, step)).toBe(
      'Answers to the 13:36 report: 1 yes. 3 change: wait for the third batch. 4 no. 7 option A. No answer yet: 2, 5, 6.',
    )
  })
})

describe('fenced asks', () => {
  test('reads every fenced ask with its title, type and parts, numbered in order', async () => {
    const { asks, isFenced } = findAsks(GOOD_FENCED)
    expect(isFenced).toBe(true)
    expect(asks.map(ask => ask.number)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(asks.map(ask => ask.title)).toEqual(parsed(GOOD_REPORT).asks.map(ask => ask.title))
    expect(asks.map(ask => ask.type)).toEqual(parsed(GOOD_REPORT).asks.map(ask => ask.type))
    expect(asks.every(ask => missingParts(ask).length === 0)).toBe(true)
  })

  test('a fenced ask with no title line is named by its number', async () => {
    const ask = parseAskBlock('Type: decide\nRecommend: yes\nYes means: it stays.\nNo means: it moves.\n', 2)
    expect(ask.title).toBe('Ask 2')
    expect(ask.type).toBe('decide')
  })

  test('a reply with no fence falls back to the prose parser, and prose with no asks has none', async () => {
    expect(findAsks(GOOD_REPORT)).toEqual({ asks: parsed(GOOD_REPORT).asks, isFenced: false })
    expect(findAsks(PLAIN_CHAT).asks).toEqual([])
    expect(findAsks(PROSE_STATUS).asks).toEqual([])
  })

  test('the body text drops the fences and keeps every other line', async () => {
    const body = bodyText(GOOD_FENCED)
    expect(body.includes('```ask')).toBe(false)
    expect(body.includes('Stop the cleanup job deleting')).toBe(false)
    expect(body.includes('### Caught')).toBe(true)
    expect(body.includes('### Running')).toBe(true)
    expect(bodyText(PLAIN_CHAT)).toBe(PLAIN_CHAT.trim())
  })

  test('the same ask in two replies is matched by title', async () => {
    const [one] = findAsks(GOOD_FENCED).asks
    const [other] = parsed(GOOD_REPORT).asks
    expect(sameAsk(one!, other!)).toBe(true)
  })
})
