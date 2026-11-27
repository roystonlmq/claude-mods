import type { ElementTable, Register, RenderElement } from 'claude-code'

import type { ReplyColors, ReplyColorsRun, ReplyColorsSurface } from '../types'
import { paintText, parseLines, spaced } from './paint'
import type { Line, Span } from './paint'
import { inksFor, paletteOf } from './palettes'
import type { Palette } from './palettes'

type Node = RenderElement | string

const textProps = (palette: Palette, span: Span) => {
  const ink = span.role === undefined ? undefined : palette[span.role]
  return {
    ...(ink !== undefined ? { color: ink.color } : {}),
    ...(span.bold || ink?.bold ? { bold: true } : {}),
    ...(span.italic || ink?.italic ? { italic: true } : {}),
  }
}

const drawReply = (ui: ElementTable, palette: Palette, text: string): RenderElement => {
  const { Box, Text, Link, Markdown } = ui
  const spansOf = (spans: readonly Span[], base: Partial<Span> = {}) =>
    spans.map(span => {
      const merged = { ...base, ...span, role: span.role ?? base.role }
      if (merged.href !== undefined) {
        return (
          <Text {...textProps(palette, merged)}>
            <Link href={merged.href}>{merged.text}</Link>
          </Text>
        )
      }
      return <Text {...textProps(palette, merged)}>{merged.text}</Text>
    })

  const lineOf = (line: Line) => {
    if (line.kind === 'blank') return <Text> </Text>
    if (line.kind === 'markdown') return <Markdown text={line.text} />
    if (line.kind === 'heading') return <Text>{spansOf(line.spans, { role: 'heading' })}</Text>
    if (line.kind === 'quote') {
      return (
        <Box flexDirection="row">
          <Text color={palette.quote.color}>▎ </Text>
          <Box flexDirection="column" flexShrink={1}>
            <Text>{spansOf(line.spans, { role: 'quote' })}</Text>
          </Box>
        </Box>
      )
    }
    if (line.kind === 'item') {
      const marker = line.isRecommended ? palette.recommend : palette.bullet
      return (
        <Box flexDirection="row" paddingLeft={line.indent}>
          <Text color={marker.color} bold>{`${line.marker} `}</Text>
          <Box flexDirection="column" flexShrink={1}>
            <Text>{spansOf(line.spans)}</Text>
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="row" paddingLeft={line.indent}>
        <Text>{spansOf(line.spans)}</Text>
      </Box>
    )
  }

  return <Box flexDirection="column">{spaced(parseLines(text)).map(lineOf)}</Box>
}

const asTranscriptRow = (ui: ElementTable, body: RenderElement, isFirstOfReply: boolean): RenderElement => {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" marginTop={1}>
      <Box width={2} flexShrink={0}>
        <Text>{isFirstOfReply ? '⏺' : ' '}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {body}
      </Box>
    </Box>
  )
}

const recolor = (node: Node, paintEngineRow: () => RenderElement, paintMarkdown: (text: string) => RenderElement): Node => {
  if (typeof node === 'string') return node
  if (node.type === 'engine') return paintEngineRow()
  if (node.type === 'Markdown' && !('press' in node) && node.props.dimColor !== true) return paintMarkdown(node.props.text)
  if ((node.type === 'Box' || node.type === 'Text') && node.children !== undefined) {
    return { ...node, children: node.children.map(child => recolor(child as Node, paintEngineRow, paintMarkdown)) } as RenderElement
  }
  return node
}

const replyColorsOf = (palette: Palette): ReplyColors => ({
  inks: ({ surface }) => ({ ...inksFor(palette, surface) }),
  paint: ({ text, surface }) => {
    const inks = inksFor(palette, surface)
    return paintText(text).map((span): ReplyColorsRun => ({
      text: span.text,
      ...textProps(inks, span),
      ...(span.href !== undefined ? { href: span.href } : {}),
    }))
  },
})

export const register: Register = (on, options) => {
  const palette = paletteOf(options.palette)

  on('engine.create', async ($, e, next) => {
    const beneath = await next(e)
    return { ...beneath, replyColors: replyColorsOf(palette) }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const tree = await next(e)
    if (e.props.isSummary === true || e.props.text.trim() === '') return tree
    const surface: ReplyColorsSurface = e.surface
    const inks = inksFor(palette, surface)
    const ui = $.ui.resolve(e)
    const reply = (text: string) => drawReply(ui, inks, text)
    return recolor(
      tree,
      () => (surface === 'terminal' ? asTranscriptRow(ui, reply(e.props.text), e.props.isFirstOfReply) : reply(e.props.text)),
      reply,
    ) as RenderElement
  }).catch(($, e, next) => next(e))
}
