import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { BAD_REPORT, GOOD_REPORT, PLAIN_CHAT, PROMOTE_NO_FAILURE_REASON } from '../tests/fixtures.ts'
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

test('blocks a promote ask with no failure explanation and names it', () => {
  const decision = decide({ session_id: session(), last_assistant_message: PROMOTE_NO_FAILURE_REASON })
  assert.equal(decision?.decision, 'block')
  assert.match(decision?.reason ?? '', /Ask 1 "Put the approved Acme fix batch live" \(promote\): missing failure details for 2 of 2 failed tests/)
})

test('names every ask with missing parts in the bad report', () => {
  const reason = decide({ session_id: session(), last_assistant_message: BAD_REPORT })?.reason ?? ''
  for (const ask of [1, 2, 3, 4, 5]) assert.match(reason, new RegExp(`- Ask ${ask} "`))
})

test(`blocks at most ${MAX_BLOCKS_PER_TURN} times in one turn, then lets it through`, () => {
  const id = session()
  const first = decide({ session_id: id, stop_hook_active: false, last_assistant_message: BAD_REPORT })
  const second = decide({ session_id: id, stop_hook_active: true, last_assistant_message: BAD_REPORT })
  const third = decide({ session_id: id, stop_hook_active: true, last_assistant_message: BAD_REPORT })
  assert.equal(first?.decision, 'block')
  assert.equal(second?.decision, 'block')
  assert.equal(third, null)
  const nextTurn = decide({ session_id: id, stop_hook_active: false, last_assistant_message: BAD_REPORT })
  assert.equal(nextTurn?.decision, 'block')
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

test('the session-start prompt asks for short bullets with a bold lead label in long replies', () => {
  assert.match(REPORT_SHAPE, /# Any reply longer than a few lines/)
  assert.match(REPORT_SHAPE, /one idea each, each starting with a short bold label and a colon/)
})
