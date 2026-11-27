# reply-colors

Colours Claude's replies so long replies are easy to scan, in the terminal, the desktop app, VS Code and on the phone. It changes colour, weight and spacing only. Every word stays as Claude wrote it, and the stored message is untouched: copy, ctrl+o and Claude's own context keep the original text.

## What it colours

| Part | Look (calm palette) |
| --- | --- |
| Headings: `#` headings, a bold line on its own, and short title lines with content under them, such as "What's done" or "Your call" | bold soft blue, with a blank line before each heading |
| Labels before a colon at the start of a line or a bullet, up to 6 words, such as "Tests:", "The wider meter:" or "Cancelled, then not cancelled:" | bold |
| Bullet markers (`-`, `*`, `1.`) | soft blue. The marker is gold on the option Claude recommends |
| Recommendations: "I recommend this", "(recommended)", "Recommend:" | bold gold |
| Risk words: delete, force push, failed, FAIL | soft red |
| Caution words: promote, rollback, roll back, revert, go live | amber |
| Outcome words: merged, passed, PASS, done, shipped, "is live" | green. Not when negated or conditional, so "hasn't merged" and "until merged" stay plain |
| Money, percentages, dates, times and counts such as "2 of 3" | lavender. Digits inside names such as ASD-STE100, v2.1 or #133 stay plain |
| Quoted text in double quotes, block quotes | grey italic |
| Inline code | muted teal |
| Links | stay clickable, in the heading blue |

Every list item gets a blank line before it, and so does a paragraph that follows a list. Nested items and a heading's first item stay tight. Wrapped lines stay indented under the bullet. Code blocks and tables are drawn by Claude Code as usual.

In the terminal it uses the palette you pick (below). On the desktop app, VS Code and the phone it uses the app's theme colours (blue headings, green outcome words, red risk words, amber caution words, purple numbers), so it stays readable in light and dark mode. Tool-call summaries are not coloured.

## With other mods

- quote-reply: the Reply button stays under each reply.
- readable-output (status report cards): reply-colors colours the summary above the card (Done, Caught and the rest), and the card colours itself through reply-colors. reply-colors adds `$.replyColors` with two calls: `inks({ surface })` gives the colour for each role, and `paint({ text, surface })` gives the coloured runs for one line of text, using the same rules and the same palette setting as replies. Without reply-colors the card falls back to its own theme colours.

## Example

```
Your call
- Add two short lines to the prompt and test once more (I recommend this): "Keep prose as prose".
- Ship as it is.

Spend
- The wider meter: this month is about 94% of the US$5,000 cap.
```

"Your call" and "Spend" become bold blue headings with a blank line before them. "I recommend this" is bold gold and its bullet marker turns gold. The quote is grey italic, "The wider meter:" is bold, and "94%" and "US$5,000" are lavender.

## Install

```
/plugin install reply-colors --marketplace roystonlmq/claude-mods
```

From a shell: `claude plugin install reply-colors@claude-mods` after `claude plugin marketplace add roystonlmq/claude-mods`.

## Palettes

Two palettes for the terminal, both made for a dark background:

- `calm` (default): soft blue headings, gold recommendations, muted red, amber and green.
- `vivid`: brighter, more saturated colours, with risk words in bold red.

To switch, run `/config`, find the reply-colors Palette row and pick one. Or set it in `~/.claude/settings.json`:

```json
"pluginConfigs": { "reply-colors@claude-mods": { "options": { "palette": "vivid" } } }
```

## Turn it off

```
claude plugin disable reply-colors@claude-mods --scope user
```

`claude plugin enable reply-colors@claude-mods --scope user` turns it back on. Both take effect in new sessions.

## Check it

From a checkout of this repository:

```
claude plugin test readability-qol/reply-colors
```
