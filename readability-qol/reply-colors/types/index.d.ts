export type ReplyColorsRole =
  | 'heading'
  | 'strong'
  | 'bullet'
  | 'recommend'
  | 'risk'
  | 'caution'
  | 'done'
  | 'number'
  | 'quote'
  | 'code'
  | 'link'

export type ReplyColorsInk = { color: string; bold?: boolean; italic?: boolean }

export type ReplyColorsSurface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

export type ReplyColorsRun = {
  text: string
  color?: string
  bold?: boolean
  italic?: boolean
  href?: string
}

export type ReplyColorsInksInput = { surface: ReplyColorsSurface }

export type ReplyColorsPaintInput = { text: string; surface: ReplyColorsSurface }

export type ReplyColors = {
  inks: (e: ReplyColorsInksInput) => Record<ReplyColorsRole, ReplyColorsInk>
  paint: (e: ReplyColorsPaintInput) => ReplyColorsRun[]
}

export type ReplyBodySource = {
  bodyText: (e: { text: string }) => string
}

declare module 'claude-code' {
  interface EngineInterface {
    replyColors: ReplyColors
    readableOutput: ReplyBodySource
  }
}
