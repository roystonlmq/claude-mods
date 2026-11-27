export type CardInk = { color: string; bold?: boolean; italic?: boolean }

export type CardInkRole = 'heading' | 'recommend' | 'risk' | 'caution' | 'done'

export type CardRun = { text: string; color?: string; bold?: boolean; italic?: boolean; href?: string }

export type CardSurface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

declare module 'claude-code' {
  interface EngineInterface {
    replyColors: {
      inks: (e: { surface: CardSurface }) => Record<CardInkRole, CardInk>
      paint: (e: { text: string; surface: CardSurface }) => CardRun[]
    }
  }
}
