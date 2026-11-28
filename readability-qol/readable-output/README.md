# readable-output

Makes Claude's replies easy to read, and its asks easy to answer, in the terminal and on the phone.

The Readable output style (`output-styles/readable.md`) tells Claude two things, in about 300 words. It is the one place this text lives. An output style is part of the instructions sent with every request, so the format holds in long sessions, where SessionStart context drifts out of reach:

- **Most replies are prose.** A short lead line, then a bold label or small heading per topic, short paragraphs with a blank line between each, and key facts (numbers, dates, names, outcomes, risks) in bold, so reply-colors can colour them.
- **Each ask goes in a fenced `ask` block.** Only when a reply asks the user to decide something. The first line is a plain-word title, then labelled parts: a type, a recommendation, "Yes means" and "No means", the parts for that type, and a Ref line for code names.

| Ask type | Parts |
| --- | --- |
| Go live (promote) | Tests passed, X of Y. For failed tests, one or more "Failed: what. Why: ... Safe because: ..." lines; one line can cover a group. What changes for customers, with one sample chat. How to roll back. |
| Delete | What goes. Whether it can be restored, and for how long. What breaks if it should not have gone. |
| Code change (merge) | What behaviour changes. Test results. What is still open. |
| Message someone | Who it goes to. The exact draft. Why now. |
| Spend or start a worker | Expected cost. What it delivers. When. |
| Choice | Each option's outcome, with a concrete example. |
| Decision | The common parts are enough. |

## What you see

reply-colors draws the reply's text with its colours. readable-output adds one card under it for the asks. The card is an add-on: it always lets the mods beneath draw the reply first, so the reply keeps its colours and its Reply button whatever state the card is in, and whatever order the mods load in.

- A fenced ask is shown only on the card. reply-colors asks readable-output for the reply text without the ask blocks (`$.readableOutput.bodyText`), so nothing is drawn twice. Without readable-output the block shows as plain text.
- The card shows one ask at a time with all its parts, each under a bold label with a blank line before it. Each failed test line is its own block, with Why and Safe because as separate parts. The Ref line is dimmed.
- Buttons: Yes, No, Change, Skip and Back. A choice shows one button per option.
- A progress bar, and a receipt line for the asks you have answered.
- One Send button builds a single message, for example "Answers to the 13:36 report: 1 yes. 3 change: wait for the third batch. No answer yet: 4, 5."
  - Terminal: Send puts the message in the prompt box, then you press Enter. A draft already in the box is kept, with the answers added under it.
  - Phone: Send sends it straight away.
- Change opens a text field in the band under the reply. Or type it as your next message: it goes to Claude as typed, and the mod also keeps it as that ask's change.

If an ask is missing a required part, the card says "Not ready", names the part and has no Yes button. A part that plainly says its fact is unknown, such as "Tests: not run yet", counts as filled. A promote, spend or message ask with no time in Yes means shows a "Hint" line and keeps its Yes button.

If a later reply repeats an ask with the same title and every part filled, the earlier card says "Updated in a later reply: answer it there."

### Older replies

Replies written before 0.6.0 put numbered asks under a "### Needs you" heading. They still get a compact card (title, type, recommendation, buttons) under the coloured reply text, which keeps every line of the ask.

## With other mods

- reply-colors: the card takes its colours from `$.replyColors.inks` and `$.replyColors.paint`, so it follows the calm or vivid palette in the terminal and theme colours on the desktop app, VS Code and the phone. Without reply-colors the card uses its own theme colours.
- quote-reply: its Reply button stays last, under the card. A quoted ask shows as "Ask: <title>".

## Install

```
/plugin install readable-output --marketplace roystonlmq/claude-mods
/plugin install reply-colors --marketplace roystonlmq/claude-mods
```

reply-colors is optional. Install readable-output with project scope to keep it to one project.

The plugin ships the Readable output style. Turn it on in that project's `.claude/settings.json`, so other projects keep their own style:

```json
"outputStyle": "readable-output:Readable"
```

The style keeps Claude Code's coding instructions (`keep-coding-instructions: true`). Claude Code reads style files when it starts, so restart after an update. `/output-style` lists the styles and marks the active one.

`bin/session-start.ts` and `bin/stop-check.ts` are kept empty, so an older SessionStart or Stop entry that still points at them does nothing and the text is never sent twice. Delete those entries when convenient.

## Example

```ask
Put the approved fix batch live
Type: promote
Recommend: your call
Yes means: the batch goes live today at 16:00.
No means: it waits until 01/12.
Tests: 46 of 48 passed
Failed: two refund questions in Tagalog got the English article. Why: the Tagalog article is in review. Safe because: nothing gets worse.
Customer change: a fee question now gets the fee rule and a refund check.
Example: "Why was I charged 50 pesos?" gets the fee rule.
Rollback: re-promote yesterday's version; about 5 minutes.
```

is drawn as one card with a progress bar, each part under a bold label, the GO LIVE tag in amber, and Yes, No, Change, Skip and Back buttons.

## Turn it off

- Everything: delete the `outputStyle` line, then `claude plugin uninstall readable-output@claude-mods --scope project`.
- Only the card: `claude plugin disable readable-output@claude-mods --scope project`. Claude still writes ask blocks, which then show as plain text.

## Check it

From a checkout of this repository:

```
claude plugin test readability-qol/readable-output
node --test readability-qol/readable-output/bin/hooks.node-test.ts
```
