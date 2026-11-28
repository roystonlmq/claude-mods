import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

import { BAD_REPORT, GOOD_FENCED, INCOMPLETE_ASK, PLAIN_CHAT, PROMOTE_NO_FAILURE_FENCED, PROMOTE_NO_FAILURE_REASON } from '../tests/fixtures.ts'
import { readFileSync } from 'node:fs'

import { OUTPUT_STYLE_PATH, REPORT_SHAPE } from '../hooks/prompt.ts'

const STOP_CHECK = new URL('./stop-check.ts', import.meta.url).pathname
const SESSION_START = new URL('./session-start.ts', import.meta.url).pathname

test('the stop check never blocks a reply, complete or not', () => {
  for (const message of [GOOD_FENCED, PLAIN_CHAT, INCOMPLETE_ASK, BAD_REPORT, PROMOTE_NO_FAILURE_REASON, PROMOTE_NO_FAILURE_FENCED]) {
    const output = execFileSync('node', [STOP_CHECK], { input: JSON.stringify({ session_id: 'test', last_assistant_message: message }) }).toString()
    assert.equal(output, '')
  }
})

test('the session start script adds nothing, so the output style is the only copy of the reply shape', () => {
  assert.equal(execFileSync('node', [SESSION_START]).toString(), '')
})

test('the Readable output style keeps the coding instructions and holds the reply shape', () => {
  const style = readFileSync(OUTPUT_STYLE_PATH, 'utf8')
  assert.match(style, /^---\nname: Readable\n/)
  assert.match(style, /\nkeep-coding-instructions: true\n---\n/)
  assert.ok(style.endsWith(`${REPORT_SHAPE}\n`))
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
