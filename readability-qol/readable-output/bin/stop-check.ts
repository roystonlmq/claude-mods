import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { askProblems, blockReason, parseReport } from '../hooks/shape.ts'

export const MAX_BLOCKS_PER_TURN = 1

type StopInput = {
  session_id?: string
  transcript_path?: string
  stop_hook_active?: boolean
  last_assistant_message?: string
}

type Decision = { decision: 'block'; reason: string } | null

const textOfEntry = (entry: unknown): string | null => {
  if (typeof entry !== 'object' || entry === null) return null
  const message = (entry as { type?: string; message?: { content?: unknown } }).message
  if ((entry as { type?: string }).type !== 'assistant' || message === undefined) return null
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const texts = content.flatMap(block =>
    typeof block === 'object' && block !== null && (block as { type?: string }).type === 'text'
      ? [String((block as { text?: string }).text ?? '')]
      : [],
  )
  return texts.length === 0 ? null : texts.join('\n')
}

export const lastAssistantText = (input: StopInput) => {
  if (typeof input.last_assistant_message === 'string') return input.last_assistant_message
  if (input.transcript_path === undefined) return ''
  const lines = readFileSync(input.transcript_path, 'utf8').trim().split('\n').reverse()
  for (const line of lines) {
    try {
      const text = textOfEntry(JSON.parse(line))
      if (text !== null) return text
    } catch {
      continue
    }
  }
  return ''
}

const ownFolder = () => {
  const uid = process.getuid?.()
  const folder = join(tmpdir(), `readable-output-stop-${uid ?? 'user'}`)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const stat = lstatSync(folder)
  const isOwn = stat.isDirectory() && !stat.isSymbolicLink() && (uid === undefined || stat.uid === uid) && (stat.mode & 0o077) === 0
  return isOwn ? folder : null
}

const counterFile = (sessionId: string) => {
  const folder = ownFolder()
  return folder === null ? null : join(folder, `${sessionId.replace(/[^\w-]/g, '_')}.count`)
}

const writeCount = (file: string, count: number) => {
  const staged = `${file}.${process.pid}.tmp`
  writeFileSync(staged, String(count), { flag: 'wx', mode: 0o600 })
  renameSync(staged, file)
}

const readCount = (file: string) => {
  try {
    return Number(readFileSync(file, 'utf8').trim()) || 0
  } catch {
    return 0
  }
}

export const decide = (input: StopInput): Decision => {
  const file = counterFile(input.session_id ?? 'unknown')
  if (file === null) return null
  const blocksSoFar = input.stop_hook_active === true ? readCount(file) : 0
  const report = parseReport(lastAssistantText(input))
  const problems = report === null ? [] : askProblems(report)
  if (problems.length === 0 || blocksSoFar >= MAX_BLOCKS_PER_TURN) {
    writeCount(file, 0)
    return null
  }
  writeCount(file, blocksSoFar + 1)
  return { decision: 'block', reason: blockReason(problems) }
}

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href

if (isMain) {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}') as StopInput
  const decision = decide(input)
  if (decision !== null) process.stdout.write(`${JSON.stringify(decision)}\n`)
}
