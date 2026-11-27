# readable-output

Makes Claude's replies easy to read, and its asks easy to answer, in the terminal and on the phone.

The SessionStart hook below tells Claude two things, in about 230 words:

- **Most replies are prose.** Status updates and explanations open with a short lead line, then use a bold label or small heading per topic, short paragraphs with a blank line between each, and key facts (numbers, dates, names, outcomes, risks) in bold, so reply-colors can colour them. There is no fixed headline or section list.
- **Asks get a card.** Only when a reply asks the user to decide something does it use the card shape: numbered asks under a "### Needs you" heading. Each ask has a type, a recommendation, "Yes means" and "No means", and a Ref line for code names. Promote, spend and message asks should say when Yes happens (today, 29/11, 16:00); if they don't, the card shows a hint but still offers Yes. The session text does not list each type's extra parts. The Stop check lists them only when an ask of that type is missing one:

| Ask type | What it must say |
| --- | --- |
| Go live (promote) | Tests passed, X of Y. For each failed test: what failed, why, and why it is still safe. What changes for customers, with one sample chat. How to roll back. |
| Delete | What goes, in plain words. Whether it can be restored, and for how long. What breaks if it should not have gone. |
| Code change (merge) | What behaviour changes. Test results. What is still open. |
| Message someone | Who it goes to. The exact draft. Why now. |
| Spend or start a worker | Expected cost. What it delivers. When. |
| Choice | Each option's outcome, with a concrete example. |
| Decision | Anything else. The common parts are enough. |

Code names such as pull request numbers, work-package labels and hashes go on a Ref line only. The card shows that line dimmed under the ask.

## What you see

The mod redraws each reply that has numbered asks under Needs you as a step-through. Prose replies are left as they are. It never hides text: every line of the reply is drawn, either in the text above the card or on the card itself.

- The text above the card is the whole reply except the ask the card shows, so prose answers, explanations and the other asks stay readable.
- The card shows every line of its ask, including parts it has no special label for and loose lines, under Also.

- One ask at a time, with all its facts on screen. Each part has a bold label and a blank line before it. Wrapped text stays indented under its label; on the phone the label sits on its own line with the text indented below. Each failed test is its own block, with Why and Safe because as separate parts.
- Colours come from reply-colors when it is on (see With other mods): Recommend in gold, Your call and the GO LIVE tag in amber, Yes means in green, No means and Failed in soft red, other labels in blue, and inside every value the same risk, caution, outcome, number, quote and code colours as plain replies. Every word stays as Claude wrote it; copy and the stored message are unchanged.
- Buttons: Yes, No, Change, Skip and Back. A choice shows one button per option instead of Yes and No.
- A progress bar, and a receipt line for the asks you have answered.
- One Send button that builds a single message, for example "Answers to the 13:36 report: 1 yes. 3 change: wait for the third batch. No answer yet: 4, 5."
  - Terminal: Send puts the message in the prompt box so you can read it, then you press Enter. A draft already in the box is kept, with the answers added under it.
  - Phone: Send sends it straight away.
- Change opens a text field in the band under the reply. Or type it as your next message: it goes to Claude exactly as typed, and the mod also keeps it as that ask's change. No typed prompt is ever held back.

If an ask is missing a required part, its card shows "Not ready" and the missing part, and has no Yes button. A promote, spend or message ask with no time in Yes means shows a "Hint" line instead and keeps its Yes button.

## With other mods

- reply-colors: the card asks reply-colors for its colours (`$.replyColors.inks` and `$.replyColors.paint`), so the card follows the palette chosen in reply-colors' settings (calm or vivid) in the terminal, and theme colours on the desktop app, VS Code and the phone. reply-colors also colours the summary above the card. If reply-colors is off, the card draws with its own theme colours and plain values, and nothing else changes.

## The check before a reply ends

An optional Stop hook reads each finished reply. It makes no model call. It runs the same rule-based parser that the card uses.

- Replies with no "Needs you" section that holds numbered asks go straight through. That covers prose, status updates and explanations, with or without headings or a state word.
- A missing date never blocks a reply; it shows as a hint on the card.
- If an ask is missing a required part, Claude is sent back once with only those asks, the parts they are missing and the full part list for their type. It is told to reply with just those asks under "### Needs you", without repeating the rest of the reply. Complete asks are not mentioned.
- A part that plainly says its fact is unknown, such as "Tests: not run yet" or "Restorable: unknown, I will check today", counts as filled. Failure details for a go-live ask still need what failed, why and why it is safe.
- It sends a reply back at most once per turn. After that the reply goes through, and the card marks those asks Not ready.

## Install

```
/plugin install readable-output --marketplace roystonlmq/claude-mods
/plugin install reply-colors --marketplace roystonlmq/claude-mods
```

reply-colors is optional. Install readable-output with project scope to keep it to one project.

The plugin draws the card. Two command hooks, added by hand to that project's `.claude/settings.json`, give Claude the reply guidance and run the check. They need Node 22.6 or later (it runs the `.ts` files directly). Point them at the installed copy, `~/.claude/plugins/cache/claude-mods/readable-output/<version>/`, or at a checkout:

```json
"hooks": {
  "SessionStart": [{ "hooks": [{ "type": "command", "command": "node <readable-output folder>/bin/session-start.ts || true", "timeout": 10 }] }],
  "Stop": [{ "hooks": [{ "type": "command", "command": "node <readable-output folder>/bin/stop-check.ts || true", "timeout": 10 }] }]
}
```

## Example

An ask written in the card shape:

```
The fix batch is ready to go live.

### Needs you
1. Put the approved fix batch live
   Type: promote
   Recommend: your call
   Yes means: the batch goes live today at 16:00.
   No means: it waits until 01/12.
   Tests: 46 of 48 passed
   Failed: a refund question in Tagalog got the English article. Why: the Tagalog article is in review. Safe because: nothing gets worse.
   Customer change: a fee question now gets the fee rule and a refund check.
   Example: "Why was I charged 50 pesos?" gets the fee rule.
   Rollback: re-promote yesterday's version; about 5 minutes.
```

is drawn as one card with a progress bar, each part under a bold label, the GO LIVE tag in amber, and Yes, No, Change, Skip and Back buttons. Send then builds one answer message, such as "Answers to the 13:36 report: 1 yes."

## Turn it off

- Everything: delete the SessionStart and Stop entries that mention `readable-output`, then `claude plugin uninstall readable-output@claude-mods --scope project`.
- Only the drawing: `claude plugin disable readable-output@claude-mods --scope project`. Claude still writes asks in the card shape, and the check still runs.
- Only the check: delete the Stop entry.

Changes to the settings hooks take effect in the next session.

## Check it

From a checkout of this repository:

```
claude plugin test readability-qol/readable-output
node --test readability-qol/readable-output/bin/hooks.node-test.ts
```
