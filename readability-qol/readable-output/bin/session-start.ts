import { REPORT_SHAPE } from '../hooks/prompt.ts'

export const sessionStartOutput = () => ({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: REPORT_SHAPE },
})

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href

if (isMain) process.stdout.write(`${JSON.stringify(sessionStartOutput())}\n`)
