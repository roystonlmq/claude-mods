export type PendingReply = { quote: string; preview: string }

declare module 'claude-code' {
  interface PluginState {
    'quote-reply': { pending: PendingReply | null }
  }
}
