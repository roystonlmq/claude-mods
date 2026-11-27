# readability-qol

Quality-of-life mods that make Claude's output easier to read and answer, in the terminal, the desktop app, VS Code and on the phone. Two plugins that work alone or together:

- [reply-colors](reply-colors/): colours every reply. Headings, labels, recommendations, risk and done words, numbers and quotes stand out, and list items get a blank line between them. Drawing only: the stored text is unchanged.
- [readable-output](readable-output/): asks Claude to write status reports in one fixed shape, then redraws each report as a step-through of its asks with Yes, No, Change, Skip and one Send.

With both on, the report card takes its colours from reply-colors (`$.replyColors`), so there is one palette and one set of colour rules.

## Example

A reply like this:

```
Here is where the three worker jobs stand after tonight's runs.
- Report worker: it wrote the weekly summary twice because the first copy timed out.
- Watcher: it flagged 4 of 52 chats tonight, all for slow replies during the 22:00 peak.
```

is drawn with "Report worker:" and "Watcher:" in bold, the bullet markers in soft blue, "4 of 52" and "22:00" in lavender, and a blank line before each bullet. Every word stays as Claude wrote it.

## Install

```
/plugin install reply-colors --marketplace roystonlmq/claude-mods
/plugin install readable-output --marketplace roystonlmq/claude-mods
```

readable-output also has two optional settings hooks, a SessionStart prompt and a Stop check. See its README.
