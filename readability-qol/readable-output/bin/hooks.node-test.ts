import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

import { BAD_REPORT, GOOD_FENCED, INCOMPLETE_ASK, PLAIN_CHAT, PROMOTE_NO_FAILURE_FENCED, PROMOTE_NO_FAILURE_REASON } from '../tests/fixtures.ts'
import { REPORT_SHAPE } from '../hooks/prompt.ts'

const STOP_CHECK = new URL('./stop-check.ts', import.meta.url).pathname
const SESSION_START = new URL('./session-start.ts', import.meta.url).pathname

test('the stop check never blocks a reply, complete or not', () => {
  for (const message of [GOOD_FENCED, PLAIN_CHAT, INCOMPLETE_ASK, BAD_REPORT, PROMOTE_NO_FAILURE_REASON, PROMOTE_NO_FAILURE_FENCED]) {
    const output = execFileSync('node', [STOP_CHECK], { input: JSON.stringify({ session_id: 'test', last_assistant_message: message }) }).toString()
    assert.equal(output, '')
  }
})

test('the session start script adds the reply shape as session context', () => {
  const output = JSON.parse(execFileSync('node', [SESSION_START]).toString())
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.equal(output.hookSpecificOutput.additionalContext, REPORT_SHAPE)
})

test('the session text asks for fenced ask blocks and formatted prose, and stays short', () => {
  assert.match(REPORT_SHAPE, /```ask\n/)
  assert.match(REPORT_SHAPE, /fenced block with the info string "ask"/)
  assert.match(REPORT_SHAPE, /blank line between each/)
  assert.match(REPORT_SHAPE, /Key facts in bold/)
  assert.match(REPORT_SHAPE, /shows on the card as Not ready/)
  assert.doesNotMatch(REPORT_SHAPE, /### Needs you/)
  assert.ok(REPORT_SHAPE.split(/\s+/).length < 320)
})
