# quote-reply

Adds a small "↩ Reply" button under each Claude message. Tap it to quote that message (trimmed to about two lines) at the top of your next prompt, then type your answer below it.

- Terminal and desktop: the quote goes straight into the prompt box above anything you already typed.
- Mobile (Remote Control): the phone's own message box can't be filled from the session, so the quote is held. A "Replying to: …" band appears with a Cancel button, and the next message you send carries the quote at its top.
- Desktop right-click on highlighted text: "Reply to selection" quotes only what you highlighted.
- After `/reload-plugins`, messages drawn before the reload get their button back too: each load asks every message to draw again once.

## Example

Claude replies:

```
## Deploy plan
1. Promote the **fix** on 26/11 at 4pm.
2. If it fails, roll back.
```

Tap "↩ Reply" and the prompt box starts with:

```
> Deploy plan
> Promote the fix on 26/11 at 4pm. …

```

Markdown marks are stripped, an `ask` block shows as "Ask: <title>", other code blocks show as `[code]`, and the quote stops at two lines or about 160 characters.

## Install

```
/plugin install quote-reply --marketplace roystonlmq/claude-mods
```

From a shell: `claude plugin install quote-reply@claude-mods` after `claude plugin marketplace add roystonlmq/claude-mods`.

## Check it

From a checkout of this repository: `claude plugin test quote-reply`.
