import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { BAD_REPORT, GOOD_REPORT, INCOMPLETE_ASK, PLAIN_CHAT, PROMOTE_NO_FAILURE_REASON, PROSE_STATUS } from '../tests/fixtures.ts'
import { REPORT_SHAPE } from '../hooks/prompt.ts'
import { MAX_BLOCKS_PER_TURN, decide } from './stop-check.ts'

const SCRIPT = new URL('./stop-check.ts', import.meta.url).pathname
const SESSION_START = new URL('./session-start.ts', import.meta.url).pathname

const session = () => `test-${process.pid}-${Math.random().toString(36).slice(2)}`

test('lets a good report through', () => {
  assert.equal(decide({ session_id: session(), last_assistant_message: GOOD_REPORT }), null)
})

test('lets a plain chat reply through', () => {
  assert.equal(decide({ session_id: session(), last_assistant_message: PLAIN_CHAT }), null)
})

test('lets a prose status reply through with no state-word headline', () => {
  assert.equal(decide({ session_id: session(), last_assistant_message: PROSE_STATUS }), null)
})

test('blocks an incomplete ask and asks only for its missing parts', () => {
  const reason = decide({ session_id: session(), last_assistant_message: INCOMPLETE_ASK })?.reason ?? ''
  assert.match(reason, /- Ask 1 "Delete the August driver-rating draft" \(delete\): add whether it can be restored/)
  assert.doesNotMatch(reason, /Ask 2/)
  assert.doesNotMatch(reason, /whole report/i)
  assert.match(reason, /Reply with only these asks/)
})

test('blocks a promote ask with no failure explanation and names it', () => {
  const decision = decide({ session_id: session(), last_assistant_message: PROMOTE_NO_FAILURE_REASON })
  assert.equal(decision?.decision, 'block')
  assert.match(decision?.reason ?? '', /Ask 1 "Put the approved Acme fix batch live" \(promote\): add failure details for 2 of 2 failed tests/)
})

test('names every ask with missing parts in the bad report', () => {
  const reason = decide({ session_id: session(), last_assistant_message: BAD_REPORT })?.reason ?? ''
  for (const ask of [1, 2, 3, 4, 5]) assert.match(reason, new RegExp(`- Ask ${ask} "`))
})

test(`blocks at most ${MAX_BLOCKS_PER_TURN} time in one turn, then lets it through`, () => {
  assert.equal(MAX_BLOCKS_PER_TURN, 1)
  const id = session()
  const first = decide({ session_id: id, stop_hook_active: false, last_assistant_message: BAD_REPORT })
  const second = decide({ session_id: id, stop_hook_active: true, last_assistant_message: BAD_REPORT })
  assert.equal(first?.decision, 'block')
  assert.equal(second, null)
  const nextTurn = decide({ session_id: id, stop_hook_active: false, last_assistant_message: BAD_REPORT })
  assert.equal(nextTurn?.decision, 'block')
})

test('does not block an ask whose only gap is a missing date', () => {
  const text = 'Ready to go live.\n\n### Needs you\n1. Start the rollout watcher\n   Type: spend\n   Recommend: yes\n   Yes means: a worker watches the rollout chats.\n   No means: nothing happens.\n   Cost: about $2\n   Delivers: a list of bad chats\n   When: after the rollout\n'
  assert.equal(decide({ session_id: session(), last_assistant_message: text }), null)
})

test('reads the last reply from the transcript when the hook input has none', () => {
  const folder = mkdtempSync(join(tmpdir(), 'readable-output-'))
  const transcript = join(folder, 'transcript.jsonl')
  const lines = [
    { type: 'user', message: { role: 'user', content: 'status?' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: PROMOTE_NO_FAILURE_REASON }] } },
  ]
  writeFileSync(transcript, lines.map(line => JSON.stringify(line)).join('\n'))
  assert.equal(decide({ session_id: session(), transcript_path: transcript })?.decision, 'block')
})

test('the script prints a block decision on stdout and nothing for a good report', () => {
  const run = (message: string) =>
    execFileSync('node', [SCRIPT], { input: JSON.stringify({ session_id: session(), last_assistant_message: message }) }).toString()
  assert.equal(JSON.parse(run(PROMOTE_NO_FAILURE_REASON)).decision, 'block')
  assert.equal(run(GOOD_REPORT), '')
})

test('the session start script adds the report shape as session context', () => {
  const output = JSON.parse(execFileSync('node', [SESSION_START]).toString())
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.equal(output.hookSpecificOutput.additionalContext, REPORT_SHAPE)
})

test('the session-start prompt keeps the card shape for asks and asks for formatted prose otherwise', () => {
  assert.match(REPORT_SHAPE, /Use the card shape only when the reply asks the user to decide/)
  assert.match(REPORT_SHAPE, /blank line between each/)
  assert.match(REPORT_SHAPE, /Key facts in bold/)
  assert.doesNotMatch(REPORT_SHAPE, /State words/)
  assert.doesNotMatch(REPORT_SHAPE, /Safe because/)
  assert.ok(REPORT_SHAPE.split(/\s+/).length < 300)
})
