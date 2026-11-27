import { describe, expect, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'
import type { ConfigRow, RenderElement } from 'claude-code'

import { inline, paint, parseLines, plainText, spaced, withLabel } from '../hooks/paint'
import { LIGHT_PALETTES, PALETTES, THEME_INKS } from '../hooks/palettes'
import { LABELLED_PROSE_REPLY, PLAIN_REPLY, MIXED_MARKDOWN, READABLE_REPORT_SUMMARY, SAMPLE_REPLY } from './fixtures'

const PLUGIN = 'reply-colors'
const CALM = PALETTES.calm
const VIVID = PALETTES.vivid

type Run = { text: string; color?: string; bold?: boolean; italic?: boolean; href?: string }

const runsOf = (node: RenderElement | string, inherited: Omit<Run, 'text'> = {}): Run[] => {
  if (typeof node === 'string') return [{ text: node, ...inherited }]
  if (node.type === 'Text') {
    const props = (node.props ?? {}) as Record<string, unknown>
    const style = {
      ...inherited,
      ...(typeof props.color === 'string' ? { color: props.color } : {}),
      ...(props.bold === true ? { bold: true } : {}),
      ...(props.italic === true ? { italic: true } : {}),
    }
    return (node.children ?? []).flatMap(child => runsOf(child as RenderElement | string, style))
  }
  if (node.type === 'Link') {
    return (node.children ?? []).flatMap(child => runsOf(child as RenderElement | string, { ...inherited, href: node.props.href }))
  }
  if (node.type === 'Box') {
    const isColumn = (node.props as Record<string, unknown> | undefined)?.flexDirection === 'column'
    return (node.children ?? []).flatMap(child => [
      ...runsOf(child as RenderElement | string, inherited),
      ...(isColumn ? [{ text: '\n' }] : []),
    ])
  }
  if (node.type === 'Markdown') return [{ text: node.props.text, color: 'markdown' }]
  return []
}

type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

const message = (text: string, surface: Surface = 'terminal', extra: Record<string, unknown> = {}) =>
  ({ plugin: PLUGIN, component: 'AssistantMessage', requestId: 'msg-1', surface, props: { text, isFirstOfReply: true, ...extra } }) as const

const draw = async ($: Engine, text: string, surface: Surface = 'terminal', extra: Record<string, unknown> = {}) => {
  const ui = await $.ui.mount(message(text, surface, extra))
  const tree = await ui.drawn()
  await ui.unmount()
  return tree
}

const colorOf = (runs: readonly Run[], text: string) => runs.find(run => run.text === text)
const words = (text: string) => text.replace(/^⏺/, '').replace(/\s+/g, ' ').trim()

describe('reload', () => {
  test('a fresh load asks every reply drawn before it to draw again', async ($, on) => {
    const invalidated: string[] = []
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.invalidate', (_, e) => {
      invalidated.push(e.event)
      return { value: undefined }
    })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect(invalidated).toEqual(['ui.render'])
  })
})

describe('a long status reply', () => {
  test('section titles become bold headings', async $ => {
    const runs = runsOf(await draw($, SAMPLE_REPLY))
    for (const title of ["What's done", 'Why it stopped short of merging', 'Your call', 'One small side effect to know about', 'Spend']) {
      expect(colorOf(runs, title)).toEqual({ text: title, color: CALM.heading.color, bold: true })
    }
  })

  test('body sentences stay plain', async $ => {
    const runs = runsOf(await draw($, SAMPLE_REPLY))
    expect(colorOf(runs, 'The comparison check and the length limit are gone.')).toEqual({ text: 'The comparison check and the length limit are gone.' })
  })

  test('the recommendation, money, percentages and counts stand out', async $ => {
    const runs = runsOf(await draw($, SAMPLE_REPLY))
    expect(colorOf(runs, 'I recommend this')).toEqual({ text: 'I recommend this', color: CALM.recommend.color, bold: true })
    for (const value of ['US$1', 'US$5,000', 'US$1,500', '94%', '83%', '80%', '2 of 3', '11']) {
      expect(colorOf(runs, value)?.color).toBe(CALM.number.color)
    }
  })

  test('quoted text is subdued and "hasn\'t merged" is not shown as done', async $ => {
    const runs = runsOf(await draw($, SAMPLE_REPLY))
    expect(colorOf(runs, '"Keep prose as prose and points as points"')).toEqual({
      text: '"Keep prose as prose and points as points"',
      color: CALM.quote.color,
      italic: true,
    })
    expect(runs.some(run => run.text === 'merged')).toBe(false)
  })

  test('bullet markers are coloured and the recommended option gets the recommend colour', async $ => {
    const runs = runsOf(await draw($, SAMPLE_REPLY))
    const markers = runs.filter(run => run.text === '- ')
    expect(markers).toHaveLength(8)
    expect(markers.filter(run => run.color === CALM.recommend.color)).toHaveLength(1)
    expect(markers.filter(run => run.color === CALM.bullet.color)).toHaveLength(7)
  })

  test('every word is drawn as written', async $ => {
    const runs = runsOf(await draw($, SAMPLE_REPLY))
    expect(words(runs.map(run => run.text).join(''))).toBe(words(SAMPLE_REPLY))
  })

  test('the stored text handed to the engine is the original', async ($, on) => {
    const seen: string[] = []
    on('ui.render', async (_, e, next) => {
      if (e.component === 'AssistantMessage') seen.push(e.props.text)
      return next(e)
    })
    await draw($, SAMPLE_REPLY)
    expect(seen).toEqual([SAMPLE_REPLY])
  })
})

describe('markdown and word rules', () => {
  test('headings, risk words, done words, code, quotes, fences, tables and links', async $ => {
    const runs = runsOf(await draw($, MIXED_MARKDOWN))
    expect(colorOf(runs, 'Deploy plan')).toEqual({ text: 'Deploy plan', color: CALM.heading.color, bold: true })
    expect(colorOf(runs, 'Promote')?.color).toBe(CALM.caution.color)
    expect(colorOf(runs, 'fix')).toEqual({ text: 'fix', color: CALM.strong.color, bold: true })
    expect(colorOf(runs, 'fails')?.color).toBe(CALM.risk.color)
    expect(colorOf(runs, 'roll back')?.color).toBe(CALM.caution.color)
    expect(colorOf(runs, 'git revert abc123')?.color).toBe(CALM.code.color)
    expect(colorOf(runs, 'the runbook')).toEqual({ text: 'the runbook', color: CALM.link.color, href: 'https://example.com/runbook' })
    expect(colorOf(runs, '26/11')?.color).toBe(CALM.number.color)
    expect(colorOf(runs, '4pm')?.color).toBe(CALM.number.color)
    expect(colorOf(runs, 'Note: do not force push to main.')).toEqual({ text: 'Note: do not force push to main.', color: CALM.quote.color, italic: true })
    expect(colorOf(runs, '```bash\ngit push --force\n```')?.color).toBe('markdown')
    expect(runs.some(run => run.color === 'markdown' && run.text.includes('| tests | 46 of 48 passed |'))).toBe(true)
    expect(runs.filter(run => run.text === 'live').map(run => run.color)).toEqual([CALM.caution.color, CALM.done.color])
    expect(colorOf(runs, 'passed')?.color).toBe(CALM.done.color)
    expect(runs.some(run => run.text === 'failed')).toBe(false)
  })

  test('outcome words are judged by what comes before them', () => {
    const roleOf = (sentence: string, word: string) => paint(inline(sentence)).find(span => span.text === word)?.role
    expect(roleOf('PR 12 merged at noon.', 'merged')).toBe('done')
    expect(roleOf('It has not merged yet.', 'merged')).toBe(undefined)
    expect(roleOf('Wait until merged.', 'merged')).toBe(undefined)
    expect(roleOf('Ready to go live today.', 'live')).toBe('caution')
    expect(roleOf('The bot is now live.', 'live')).toBe('done')
    expect(roleOf('Then force-push the branch.', 'force-push')).toBe('risk')
    expect(roleOf('Result: FAIL', 'FAIL')).toBe('risk')
    expect(roleOf('No tests failed.', 'failed')).toBe(undefined)
    expect(roleOf('Delete the old draft.', 'Delete')).toBe('risk')
    expect(roleOf('Recommend: yes', 'Recommend:')).toBe('recommend')
    expect(roleOf('Option B (recommended)', '(recommended)')).toBe('recommend')
    expect(roleOf('All checks PASS', 'PASS')).toBe('done')
  })

  test('identifiers and versions keep their digits plain', () => {
    const roles = paint(inline('ASD-STE100 on v2.1 and PR #133 took 3 runs'))
      .filter(span => span.role === 'number')
      .map(span => span.text)
    expect(roles).toEqual(['3'])
  })

  test('the parsed lines hold every character of the source text', () => {
    expect(plainText(parseLines(SAMPLE_REPLY))).toBe(SAMPLE_REPLY)
  })
})

describe('living beside other mods', () => {
  test('a mod that adds under the row keeps its addition', { plugins: [
    {
      name: 'quote-reply-like',
      register(on) {
        on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
          const row = await next(e)
          const { Box, Button } = $.ui.resolve(e)
          return (
            <Box flexDirection="column">
              {row}
              <Button key="reply" label="↩ Reply" onPress={() => undefined} />
            </Box>
          )
        })
      },
    },
  ] }, async $ => {
    const ui = await $.ui.mount(message(SAMPLE_REPLY))
    expect(await ui.find({ type: 'Button', key: 'reply' })).toBeDefined()
    const runs = runsOf(await ui.drawn())
    expect(colorOf(runs, 'Spend')?.color).toBe(CALM.heading.color)
    await ui.unmount()
  })

  test('a mod that draws the whole reply itself keeps its drawing; only its plain markdown is coloured', { plugins: [
    {
      name: 'readable-output-like',
      register(on) {
        on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
          if (!e.props.text.startsWith('### Done')) return next(e)
          const { Box, Text, Button, Markdown } = $.ui.resolve(e)
          return (
            <Box flexDirection="column">
              <Text bold color="warning">Needs you: report headline</Text>
              <Markdown key="summary" text={e.props.text} />
              <Markdown text="An aside" dimColor />
              <Button key="yes-1" label="Yes" onPress={() => undefined} />
            </Box>
          )
        })
      },
    },
  ] }, async $ => {
    const ui = await $.ui.mount(message(READABLE_REPORT_SUMMARY))
    expect(await ui.find({ type: 'Button', key: 'yes-1' })).toBeDefined()
    const runs = runsOf(await ui.drawn())
    expect(colorOf(runs, 'Needs you: report headline')).toEqual({ text: 'Needs you: report headline', color: 'warning', bold: true })
    expect(colorOf(runs, 'An aside')?.color).toBe('markdown')
    expect(colorOf(runs, 'Caught')?.color).toBe(CALM.heading.color)
    expect(colorOf(runs, '29/11')?.color).toBe(CALM.number.color)
    expect(colorOf(runs, 'deleted')?.color).toBe(CALM.risk.color)
    await ui.unmount()
  })
})

const FENCED_ASK_REPLY = 'The sorter fix is ready.\n\n```ask\nMerge the stable sorter change\nType: merge\nRecommend: yes\n```\n\n**Next**\n\nI watch the build.'

describe('the body from readable-output', () => {
  test('paints the body readable-output hands over, so the ask fence its card shows is not drawn twice', { plugins: [
    {
      name: 'readable-output-body',
      register(on) {
        on('engine.create', async ($, e, next) => {
          const beneath = await next(e)
          return { ...beneath, readableOutput: { bodyText: ({ text }: { text: string }) => text.replace(/```ask\n[\s\S]*?```\n*/g, '') } }
        })
      },
    },
  ] }, async $ => {
    const runs = runsOf(await draw($, FENCED_ASK_REPLY))
    const drawn = runs.map(run => run.text).join('')
    expect(drawn.includes('Merge the stable sorter change')).toBe(false)
    expect(drawn.includes('The sorter fix is ready.')).toBe(true)
    expect(colorOf(runs, 'Next')?.color).toBe(CALM.heading.color)
  })

  test('without readable-output every line is painted, the ask fence included', async $ => {
    const drawn = runsOf(await draw($, FENCED_ASK_REPLY)).map(run => run.text).join('')
    expect(drawn.includes('Merge the stable sorter change')).toBe(true)
    expect(drawn.includes('I watch the build.')).toBe(true)
  })
})

describe('surfaces', () => {
  test('summaries keep the engine row', async $ => {
    expect(await draw($, SAMPLE_REPLY, 'terminal', { isSummary: true })).toMatchObject({ type: 'engine' })
  })

  test('the phone, desktop and VS Code colour replies with theme colours that follow light and dark', async $ => {
    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const tree = await draw($, PLAIN_REPLY, surface)
      const runs = runsOf(tree)
      expect(colorOf(runs, 'Cancelled, then not cancelled:')).toEqual({ text: 'Cancelled, then not cancelled:', color: THEME_INKS.strong.color, bold: true })
      expect(colorOf(runs, '4 of 52')?.color).toBe(THEME_INKS.number.color)
      expect(colorOf(runs, '- ')?.color).toBe(THEME_INKS.bullet.color)
      expect(runs.some(run => run.text === '⏺')).toBe(false)
      expect(words(runs.map(run => run.text).join(''))).toBe(words(PLAIN_REPLY))
    }
  })
})

describe('a plain reply with labelled bullets', () => {
  test('bullet labels are bold, every item and paragraph is its own block, every word stays', async $ => {
    const tree = await draw($, PLAIN_REPLY)
    const runs = runsOf(tree)
    for (const label of ['Cancelled, then not cancelled:', 'Report worker:', 'Watcher:']) {
      expect(colorOf(runs, label)).toEqual({ text: label, color: CALM.strong.color, bold: true })
    }
    expect(colorOf(runs, '21:40')?.color).toBe(CALM.number.color)
    expect(words(runs.map(run => run.text).join(''))).toBe(words(PLAIN_REPLY))
    expect(spaced(parseLines(PLAIN_REPLY)).map(line => line.kind)).toEqual([
      'text', 'blank', 'item', 'blank', 'item', 'blank', 'item', 'blank', 'text',
    ])
  })
})

describe('the shared colouring on $.replyColors', () => {
  test('another mod paints a line with the chosen palette and gets every word back', { options: { palette: 'vivid' }, plugins: [
    {
      name: 'card-like',
      register(on) {
        on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
          if (!e.props.text.startsWith('CARD')) return next(e)
          const { Box, Text } = $.ui.resolve(e)
          const runs = await $.replyColors.paint({ text: 'Tests: 46 of 48 passed, 2 failed. Rollback takes "about 5 minutes" via `promote`.', surface: e.surface })
          const inks = await $.replyColors.inks({ surface: e.surface })
          return (
            <Box flexDirection="column">
              <Text color={inks.recommend.color}>Recommend: yes</Text>
              <Text>{runs.map(run => <Text color={run.color} bold={run.bold} italic={run.italic}>{run.text}</Text>)}</Text>
            </Box>
          )
        })
      },
    },
  ] }, async $ => {
    const runs = runsOf(await draw($, 'CARD'))
    expect(colorOf(runs, 'Recommend: yes')?.color).toBe(VIVID.recommend.color)
    expect(colorOf(runs, 'Tests:')).toEqual({ text: 'Tests:', color: VIVID.strong.color, bold: true })
    expect(colorOf(runs, '46 of 48')?.color).toBe(VIVID.number.color)
    expect(colorOf(runs, 'passed')?.color).toBe(VIVID.done.color)
    expect(colorOf(runs, 'failed')?.color).toBe(VIVID.risk.color)
    expect(colorOf(runs, 'Rollback')?.color).toBe(VIVID.caution.color)
    expect(colorOf(runs, '"about 5 minutes"')?.italic).toBe(true)
    expect(colorOf(runs, 'promote')?.color).toBe(VIVID.code.color)
  })
})

describe('palettes', () => {
  test('vivid swaps the colours', { options: { palette: 'vivid' } }, async $ => {
    const runs = runsOf(await draw($, SAMPLE_REPLY))
    expect(colorOf(runs, 'Spend')?.color).toBe(VIVID.heading.color)
    expect(colorOf(runs, 'US$1,500')?.color).toBe(VIVID.number.color)
  })
})

describe('spacing and labels', () => {
  test('a heading straight after text gets a blank line before it', () => {
    const kinds = spaced(parseLines('Intro line.\n## Next\nBody.')).map(line => line.kind)
    expect(kinds).toEqual(['text', 'blank', 'heading', 'text'])
  })

  test('every list item gets a blank line before it, nested items and continuation lines stay with their parent', () => {
    expect(spaced(parseLines('- one\n- two')).map(line => line.kind)).toEqual(['item', 'blank', 'item'])
    expect(spaced(parseLines('- one\n  - nested\n- two')).map(line => line.kind)).toEqual(['item', 'item', 'blank', 'item'])
    expect(spaced(parseLines('- one\n  more of one\n- two')).map(line => line.kind)).toEqual(['item', 'text', 'blank', 'item'])
    expect(spaced(parseLines('Intro sentence here.\n- one\nAfter.')).map(line => line.kind)).toEqual(['text', 'blank', 'item', 'blank', 'text'])
    expect(spaced(parseLines('## Done\n- one\n- two')).map(line => line.kind)).toEqual(['heading', 'item', 'blank', 'item'])
  })

  test('a label before a colon at the start of a line is bold', () => {
    expect(withLabel(inline('Tests: 46 of 48 passed'))[0]).toEqual({ text: 'Tests:', bold: true })
    expect(withLabel(inline('Cancelled, then not cancelled: the worker'))[0]).toEqual({ text: 'Cancelled, then not cancelled:', bold: true })
    expect(withLabel(inline('The screenshot above is from the dev bot: short'))[0]).toEqual({ text: 'The screenshot above is from the dev bot: short' })
  })

  test('the drawn status reply bolds "The wider meter:" and keeps every word', async $ => {
    const runs = runsOf(await draw($, SAMPLE_REPLY))
    expect(colorOf(runs, 'The wider meter:')).toEqual({ text: 'The wider meter:', color: CALM.strong.color, bold: true })
    expect(words(runs.map(run => run.text).join(''))).toBe(words(SAMPLE_REPLY))
  })
})

const README_EXAMPLE = `Your call
- Add two short lines to the prompt and test once more (I recommend this): "Keep prose as prose".
- Ship as it is.

Spend
- The wider meter: this month is about 94% of the US$5,000 cap.`

const QOL_README_EXAMPLE = `Here is where the three worker jobs stand after tonight's runs.
- Report worker: it wrote the weekly summary twice because the first copy timed out.
- Watcher: it flagged 4 of 52 chats tonight, all for slow replies during the 22:00 peak.`

describe('the README examples', () => {
  test('reply-colors README example draws as described', async $ => {
    const runs = runsOf(await draw($, README_EXAMPLE))
    for (const title of ['Your call', 'Spend']) {
      expect(colorOf(runs, title)).toEqual({ text: title, color: CALM.heading.color, bold: true })
    }
    expect(colorOf(runs, 'I recommend this')).toEqual({ text: 'I recommend this', color: CALM.recommend.color, bold: true })
    expect(runs.filter(run => run.text === '- ' && run.color === CALM.recommend.color)).toHaveLength(1)
    expect(colorOf(runs, '"Keep prose as prose"')).toEqual({ text: '"Keep prose as prose"', color: CALM.quote.color, italic: true })
    expect(colorOf(runs, 'The wider meter:')).toEqual({ text: 'The wider meter:', color: CALM.strong.color, bold: true })
    for (const value of ['94%', 'US$5,000']) expect(colorOf(runs, value)?.color).toBe(CALM.number.color)
    expect(spaced(parseLines(README_EXAMPLE)).map(line => line.kind)).toEqual(['heading', 'item', 'blank', 'item', 'blank', 'heading', 'item'])
  })

  test('readability-qol README example draws as described', async $ => {
    const runs = runsOf(await draw($, QOL_README_EXAMPLE))
    for (const label of ['Report worker:', 'Watcher:']) expect(colorOf(runs, label)).toEqual({ text: label, color: CALM.strong.color, bold: true })
    expect(runs.filter(run => run.text === '- ').every(run => run.color === CALM.bullet.color)).toBe(true)
    for (const value of ['4 of 52', '22:00']) expect(colorOf(runs, value)?.color).toBe(CALM.number.color)
    expect(spaced(parseLines(QOL_README_EXAMPLE)).map(line => line.kind)).toEqual(['text', 'blank', 'item', 'blank', 'item'])
  })
})

describe('links', () => {
  test('only http and https links stay clickable, others draw as plain label text', () => {
    expect(inline('see [docs](https://example.com/a)')).toContainEqual({ text: 'docs', role: 'link', href: 'https://example.com/a' })
    for (const href of ['javascript:void0', 'file:///etc/passwd', 'vscode://open']) {
      const spans = inline(`see [docs](${href})`)
      expect(spans.some(span => span.href !== undefined)).toBe(false)
      expect(spans.map(span => span.text).join('')).toBe('see docs')
    }
  })
})


const themeRows = (theme: string): { value: ConfigRow[] } => ({
  value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: theme, provider: { plugin: 'engine', tier: 'core' } as ConfigRow['provider'], isLocked: false }],
})

const startWithTheme = async ($: Engine, on: Parameters<TestBody>[1], theme: string) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('config.list', () => themeRows(theme))
  on('ui.invalidate', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(at => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('bold text and heading-like lines', () => {
  test('bold text and bold-led labels take the strong colour, headings their own', async $ => {
    const runs = runsOf(await draw($, LABELLED_PROSE_REPLY))
    for (const title of ['What it does, in order', 'Next step', 'Spend']) {
      expect(colorOf(runs, title)).toEqual({ text: title, color: CALM.heading.color, bold: true })
    }
    for (const label of ['Removes test names:', 'Scans for secrets:', 'The cache is warm.']) {
      expect(colorOf(runs, label)).toEqual({ text: label, color: CALM.strong.color, bold: true })
    }
    expect(CALM.strong.color).not.toBe(CALM.heading.color)
  })

  test('numbers, outcomes and dates inside bold keep their own colours', async $ => {
    const runs = runsOf(await draw($, LABELLED_PROSE_REPLY))
    expect(colorOf(runs, '94%')).toEqual({ text: '94%', color: CALM.number.color, bold: true })
    expect(colorOf(runs, 'done')).toEqual({ text: 'done', color: CALM.done.color, bold: true })
    expect(colorOf(runs, ':')).toEqual({ text: ':', color: CALM.strong.color, bold: true })
    expect(colorOf(runs, '47 of 50')?.color).toBe(CALM.number.color)
    expect(colorOf(runs, 'passed')?.color).toBe(CALM.done.color)
    expect(colorOf(runs, '29/11')?.color).toBe(CALM.number.color)
  })

  test('a bold or short line with a blank line after it is a heading, a bold sentence is not', () => {
    const kinds = parseLines(LABELLED_PROSE_REPLY).map(line => line.kind)
    expect(kinds).toEqual(['text', 'blank', 'heading', 'blank', 'item', 'item', 'blank', 'heading', 'blank', 'text', 'blank', 'heading', 'blank', 'text', 'blank', 'item'])
    expect(parseLines('Intro.\n\n**Closing words**').map(line => line.kind)).toEqual(['text', 'blank', 'text'])
  })

  test('every word is drawn as written in both palettes and both themes', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const runs = runsOf(await draw($, LABELLED_PROSE_REPLY, surface))
      expect(words(runs.map(run => run.text).join(''))).toBe(words(LABELLED_PROSE_REPLY.replace(/\*\*|### /g, '')))
    }
    expect(plainText(parseLines(LABELLED_PROSE_REPLY))).toBe(LABELLED_PROSE_REPLY.replace(/\*\*|### /g, ''))
  })

  test('vivid gives bold labels its own strong colour', { options: { palette: 'vivid' } }, async $ => {
    const runs = runsOf(await draw($, LABELLED_PROSE_REPLY))
    expect(colorOf(runs, 'Scans for secrets:')?.color).toBe(VIVID.strong.color)
    expect(colorOf(runs, 'Next step')?.color).toBe(VIVID.heading.color)
  })

  test('the phone and desktop use theme keys for strong and heading', async $ => {
    const runs = runsOf(await draw($, LABELLED_PROSE_REPLY, 'mobile'))
    expect(colorOf(runs, 'Scans for secrets:')?.color).toBe(THEME_INKS.strong.color)
    expect(colorOf(runs, 'Next step')?.color).toBe(THEME_INKS.heading.color)
  })
})

describe('light and dark terminal themes', () => {
  test('a light theme draws with the light palette', async ($, on) => {
    await startWithTheme($, on, 'light')
    const runs = runsOf(await draw($, LABELLED_PROSE_REPLY))
    expect(colorOf(runs, 'Scans for secrets:')?.color).toBe(LIGHT_PALETTES.calm.strong.color)
    expect(colorOf(runs, 'Next step')?.color).toBe(LIGHT_PALETTES.calm.heading.color)
    expect(colorOf(runs, '29/11')?.color).toBe(LIGHT_PALETTES.calm.number.color)
  })

  test('a light ANSI theme in vivid draws with the vivid light palette', { options: { palette: 'vivid' } }, async ($, on) => {
    await startWithTheme($, on, 'light-ansi')
    const runs = runsOf(await draw($, LABELLED_PROSE_REPLY))
    expect(colorOf(runs, 'Scans for secrets:')?.color).toBe(LIGHT_PALETTES.vivid.strong.color)
  })

  test('a dark theme keeps the dark palette', async ($, on) => {
    await startWithTheme($, on, 'dark-daltonized')
    const runs = runsOf(await draw($, LABELLED_PROSE_REPLY))
    expect(colorOf(runs, 'Scans for secrets:')?.color).toBe(CALM.strong.color)
  })

  test('every role reads against its background and strong never matches heading', () => {
    const sets = [
      [PALETTES.calm, '#1e1e1e'],
      [PALETTES.vivid, '#1e1e1e'],
      [LIGHT_PALETTES.calm, '#ffffff'],
      [LIGHT_PALETTES.vivid, '#ffffff'],
    ] as const
    for (const [palette, ground] of sets) {
      for (const [role, ink] of Object.entries(palette)) {
        expect({ role, ok: contrast(ink.color, ground) >= 4.5 }).toEqual({ role, ok: true })
      }
      expect(palette.strong.color).not.toBe(palette.heading.color)
      expect(Object.keys(palette).sort()).toEqual(Object.keys(THEME_INKS).sort())
    }
  })
})
