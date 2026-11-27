import type { Pick, Step } from '../types'
import type { Ask } from './shape'

export const STEPS_KEPT = 40

export const messageKey = (text: string) => {
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
  }
  return `r${hash.toString(36)}`
}

const pad = (value: number) => String(value).padStart(2, '0')

export const clockTime = (ms: number) => {
  const at = new Date(ms)
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

export const freshStep = (ms: number): Step => ({
  at: clockTime(ms),
  index: 0,
  picks: {},
  isRefShown: false,
  sentText: null,
})

export const keepRecent = (steps: Record<string, Step>, key: string, step: Step) => {
  const entries = Object.entries(steps).filter(([one]) => one !== key)
  return Object.fromEntries([...entries.slice(-(STEPS_KEPT - 1)), [key, step]])
}

export const pickWords = (pick: Pick) => {
  if (pick.answer === 'change') return `change: ${pick.text ?? ''}`.trim()
  if (pick.answer === 'option') return `option ${pick.text ?? ''}`.trim()
  if (pick.answer === 'skip') return 'skipped'
  return pick.answer
}

export const answeredCount = (step: Step) =>
  Object.values(step.picks).filter(pick => pick.answer !== 'skip').length

export const answersMessage = (asks: readonly Ask[], step: Step) => {
  const answered = asks.flatMap(ask => {
    const pick = step.picks[String(ask.number)]
    if (pick === undefined || pick.answer === 'skip') return []
    const words = pickWords(pick)
    return [`${ask.number} ${words}${/[.!?]$/.test(words) ? '' : '.'}`]
  })
  const open = asks
    .filter(ask => {
      const pick = step.picks[String(ask.number)]
      return pick === undefined || pick.answer === 'skip'
    })
    .map(ask => ask.number)
  const tail = open.length === 0 ? [] : [`No answer yet: ${open.join(', ')}.`]
  return [`Answers to the ${step.at} report:`, ...answered, ...tail].join(' ')
}

export const shortTitle = (title: string, limit = 42) => {
  if (title.length <= limit) return title
  const head = title.slice(0, limit)
  const space = head.lastIndexOf(' ')
  return `${(space > limit / 2 ? head.slice(0, space) : head).trimEnd()}…`
}

export const progressBar = (done: number, total: number) =>
  `${'█'.repeat(done)}${'░'.repeat(Math.max(0, total - done))}`

export const withPick = (asks: readonly Ask[], step: Step, ask: Ask, pick: Pick): Step => {
  const position = asks.findIndex(one => one.number === ask.number)
  return {
    ...step,
    picks: { ...step.picks, [String(ask.number)]: pick },
    index: Math.min(asks.length, position + 1),
    sentText: null,
  }
}
