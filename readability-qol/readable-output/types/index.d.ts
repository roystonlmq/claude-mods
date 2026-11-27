export type Answer = 'yes' | 'no' | 'skip' | 'change' | 'option'

export type Pick = { answer: Answer; text?: string }

export type Step = {
  at: string
  index: number
  picks: Record<string, Pick>
  isRefShown: boolean
  sentText: string | null
}

export type PendingChange = { report: string; ask: number; title: string; position: number }

declare module 'claude-code' {
  interface PluginState {
    'readable-output': {
      steps: Shaped<Record<string, Step>>
      changing: Shaped<PendingChange | null>
    }
  }
}
