import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'quote-reply'

const message = (text: string, requestId = 'msg-1') =>
  ({
    plugin: PLUGIN,
    component: 'AssistantMessage',
    requestId,
    props: { text, isFirstOfReply: true },
  }) as const

const LONG_FIRST_LINE =
  'The rollout plan has three stages and each stage carries its own check, ' +
  'so the first thing to confirm is that the sandbox matches production for ' +
  'every route we care about before any sampled traffic goes near the change.'

const engine = (on: On, draft = '', isFilled = true) => {
  const filled: string[] = []
  const submitted: string[] = []
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_, e) => {
    if (isFilled) filled.push(e.text)
    return isFilled
      ? { isFilled: true }
      : { isFilled: false, refusal: 'no_composer' as const }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  return { filled, submitted }
}

const pressReply = async (
  $: Engine,
  text: string,
  surface: 'terminal' | 'desktop' | 'mobile',
  requestId?: string,
) => {
  const ui = await $.ui.mount({ ...message(text, requestId), surface })
  await ui.press({ key: 'reply' })
  await ui.unmount()
}

describe('Reply button', () => {
  test('keeps the message row and fills a quote of that message', async ($, on) => {
    const { filled } = engine(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...message('Deploy is **done**.\nNext: run the backtest.'), surface })
      expect(await ui.find({ type: 'Text', text: /engine row/ })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'reply' })).toBeDefined()
      await ui.press({ key: 'reply' })
      await ui.unmount()
    }
    expect(filled).toEqual([
      '> Deploy is done.\n> Next: run the backtest.\n\n',
      '> Deploy is done.\n> Next: run the backtest.\n\n',
    ])
  })

  test('quotes the message whose button was pressed, not another', async ($, on) => {
    const { filled } = engine(on)
    const first = await $.ui.mount({ ...message('First answer.', 'a'), surface: 'terminal' })
    const second = await $.ui.mount({ ...message('Second answer.', 'b'), surface: 'terminal' })
    await second.press({ key: 'reply' })
    await first.unmount()
    await second.unmount()
    expect(filled).toEqual(['> Second answer.\n\n'])
  })

  test('trims a long message to a short quote', async ($, on) => {
    const { filled } = engine(on)
    const long = `${LONG_FIRST_LINE}\n\n${'More detail. '.repeat(80)}\n\n\`\`\`bash\nrm -rf x\n\`\`\``
    await pressReply($, long, 'terminal')
    const quote = filled[0] ?? ''
    expect(quote.startsWith('> The rollout plan has three stages')).toBe(true)
    expect(quote.endsWith('…\n\n')).toBe(true)
    expect(quote.length).toBeLessThan(180)
    expect(quote.includes('More detail. More detail. More detail. More detail. More detail. More detail.')).toBe(false)
    expect(quote.includes('rm -rf')).toBe(false)
  })

  test('puts the quote above a draft already typed', async ($, on) => {
    const { filled } = engine(on, 'my half-typed answer')
    await pressReply($, 'Pick A or B?', 'desktop')
    expect(filled).toEqual(['> Pick A or B?\n\nmy half-typed answer'])
  })

  test('on mobile, the next message sent carries the quote', async ($, on) => {
    const { filled, submitted } = engine(on)
    await pressReply($, 'Should I promote the changeset?', 'mobile')
    expect(filled).toEqual([])
    const band = await $.ui.mount({
      plugin: PLUGIN,
      component: 'AbovePrompt',
      surface: 'mobile',
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 60, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await band.find({ type: 'Text', text: /Replying to: Should I promote the changeset\?/ })).toBeDefined()
    await band.unmount()
    await $.prompt.submit({ text: 'Yes, go ahead', origin: { kind: 'bridge' }, wait: false })
    await $.prompt.submit({ text: 'And one more thing', origin: { kind: 'bridge' }, wait: false })
    expect(submitted).toEqual([
      '> Should I promote the changeset?\n\nYes, go ahead',
      'And one more thing',
    ])
  })

  test('leaves a task notification alone while a reply waits', async ($, on) => {
    const { submitted } = engine(on)
    await pressReply($, 'Ready to merge?', 'mobile')
    await $.prompt.submit({ text: 'task finished', origin: { kind: 'task-notification' }, wait: false })
    await $.prompt.submit({ text: 'Merge it', origin: { kind: 'bridge' }, wait: false })
    expect(submitted).toEqual(['task finished', '> Ready to merge?\n\nMerge it'])
  })

  test('falls back to the next message when the box refuses the fill', async ($, on) => {
    const { submitted } = engine(on, '', false)
    await pressReply($, 'Which instance?', 'desktop')
    await $.prompt.submit({ text: 'Sandbox', origin: { kind: 'composer' }, wait: false })
    expect(submitted).toEqual(['> Which instance?\n\nSandbox'])
  })
})

describe('Reload', () => {
  test('a fresh load asks every message drawn before it to draw again', async ($, on) => {
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

describe('Reply to selection (desktop menu)', () => {
  const MENU = { plugin: PLUGIN, surface: 'desktop', component: 'ContextMenu' } as const

  test('quotes only the highlighted text', async ($, on) => {
    const { filled } = engine(on)
    const ui = await $.ui.mount({
      ...MENU,
      props: {
        row: { component: 'AssistantMessage', requestId: 'msg-1' },
        selection: { text: 'only this part\nand this line', requestId: 'msg-1' },
      },
    })
    await ui.press({ key: 'reply-selection' })
    await ui.unmount()
    expect(filled).toEqual(['> only this part\n> and this line\n\n'])
  })

  test('adds no row when nothing is selected', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ ...MENU, props: { link: { href: 'https://example.com' } } })
    expect(await ui.find({ type: 'Button', key: 'reply-selection' })).toBeUndefined()
    await ui.unmount()
  })
})
