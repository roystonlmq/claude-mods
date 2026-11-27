import { describe, expect, test } from 'claude-code/testing'

import { askProblems, blockReason, codeNamesIn, hasWhen, missingParts, parseReport } from '../hooks/shape'
import { answersMessage, freshStep, withPick } from '../hooks/steps'
import { BAD_REPORT, GOOD_REPORT, PLAIN_CHAT, PROMOTE_NO_FAILURE_REASON } from './fixtures'

const parsed = (text: string) => {
  const report = parseReport(text)
  if (report === null) throw new Error('expected a report')
  return report
}

const problemFor = (text: string, ask: number) =>
  askProblems(parsed(text)).find(one => one.ask === ask)?.missing ?? []

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
    expect(first.title).toBe('Stop the cleanup job deleting two Acme bot changes that are waiting for Dana')
    expect(first.ref).toBe('PR app#133 · WP1')
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
      'Hi Dana, two bot changes waiting for you are now protected until 15/12, so nothing you are reviewing will be cleared.',
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
    expect(askProblems(parsed(GOOD_REPORT))).toEqual([])
  })

  test('a promote ask with failed tests and no explanation is not ready', async () => {
    expect(problemFor(PROMOTE_NO_FAILURE_REASON, 1)).toEqual([
      'failure details for 2 of 2 failed tests (each "Failed: what failed. Why: ... Safe because: ..."; unknown is not enough to go live)',
    ])
  })

  test('a promote ask names its missing example and rollback', async () => {
    const missing = problemFor(BAD_REPORT, 2)
    expect(missing.some(part => part.startsWith('failure details for 2 of 2'))).toBe(true)
    expect(missing.includes('one sample chat or example')).toBe(true)
    expect(missing.includes('how to roll back')).toBe(true)
  })

  test('reads numbered failure labels and treats unknown as not explained', async () => {
    const lines = '   Failed test 1: unknown. Why: unknown. Safe because: unknown.\n   Failure 2: Failed: the sandbox timed out. Why: the order service was down. Safe because: it passed on rerun at 14:10.\n'
    const text = PROMOTE_NO_FAILURE_REASON.replace('   Customer change:', `${lines}   Customer change:`)
    const ask = parsed(text).asks[0]!
    expect(ask.failures.map(one => one.what)).toEqual(['unknown', 'the sandbox timed out'])
    expect(ask.fields.tests).toBe('46 of 48 passed')
    expect(missingParts(ask)[0]?.startsWith('failure details for 1 of 2 failed tests')).toBe(true)
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

  test('an ask without a type, a No means or a dated Yes means is caught', async () => {
    expect(problemFor(BAD_REPORT, 5)[0]).toBe('a type (one of promote, delete, merge, message, spend, choice, decide)')
    const merge = problemFor(BAD_REPORT, 1)
    expect(merge.includes('a date or time in "Yes means"')).toBe(true)
    expect(merge.includes('"No means"')).toBe(true)
    expect(merge.includes('plain words instead of code names (move WP1 to the Ref line)')).toBe(true)
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
    expect(askProblems(report)).toEqual([])
  })

  test('words that only mention unknown, or a blank part, are still caught', async () => {
    const text = 'Needs you: one ask\n\n### Needs you\n1. Merge the cleanup fix\n   Type: merge\n   Recommend: yes\n   Yes means: the unknown cases get handled.\n   No means: it waits until 01/12.\n   Behaviour change: the job skips protected changes.\n   Tests:\n   Still open: nothing\n'
    expect(missingParts(parsed(text).asks[0]!)).toEqual(['a date or time in "Yes means"', 'test results ("Tests: X of Y passed")'])
  })

  test('the block reason names the ask and its missing parts', async () => {
    const report = parsed(PROMOTE_NO_FAILURE_REASON)
    const reason = blockReason(report, askProblems(report))
    expect(reason.includes('Ask 1 "Put the approved Acme fix batch live" (promote): missing failure details for 2 of 2 failed tests')).toBe(true)
  })

  test('dates and code names are recognised', async () => {
    expect(hasWhen('on 29/11 they stay')).toBe(true)
    expect(hasWhen('goes live today at 16:00')).toBe(true)
    expect(hasWhen('it stays')).toBe(false)
    expect(codeNamesIn('merge PR #133 for WP1 at 6ad1d2c9')).toEqual(['PR #133', 'WP1', '6ad1d2c9'])
    expect(codeNamesIn('Acme riders on 29/11')).toEqual([])
  })
})

describe('answer message', () => {
  test('builds one message with every pick and the open asks', async () => {
    const report = parsed(GOOD_REPORT)
    let step = { ...freshStep(0), at: '13:36' }
    step = withPick(report, step, report.asks[0]!, { answer: 'yes' })
    step = withPick(report, step, report.asks[2]!, { answer: 'change', text: 'wait for the third batch' })
    step = withPick(report, step, report.asks[3]!, { answer: 'no' })
    step = withPick(report, step, report.asks[4]!, { answer: 'skip' })
    step = withPick(report, step, report.asks[6]!, { answer: 'option', text: 'A' })
    expect(answersMessage(report, step)).toBe(
      'Answers to the 13:36 report: 1 yes. 3 change: wait for the third batch. 4 no. 7 option A. No answer yet: 2, 5, 6.',
    )
  })
})
