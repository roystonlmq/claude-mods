# claude-mods

Two Claude Code mods, packaged as one plugin marketplace.

| Mod | Plugins | What it does |
| --- | --- | --- |
| [readability-qol](readability-qol/) | `reply-colors`, `readable-output` | Makes long replies and status reports easy to scan and answer |
| [quote-reply](quote-reply/) | `quote-reply` | A Reply button under each Claude message that quotes it into your next prompt |

Each plugin is a function-hooks mod: a `hooks/register.tsx` module that Claude Code loads and compiles itself. There is no build step and nothing to `npm install`.

## Install

Needs Claude Code 2.1.275 or later. This repository is private, so you need GitHub access to it and `gh` (or git) signed in on your machine.

At the prompt of a terminal session:

```
/plugin install reply-colors --marketplace roystonlmq/claude-mods
/plugin install readable-output --marketplace roystonlmq/claude-mods
/plugin install quote-reply --marketplace roystonlmq/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin marketplace add roystonlmq/claude-mods
claude plugin install reply-colors@claude-mods
claude plugin install readable-output@claude-mods
claude plugin install quote-reply@claude-mods
```

New sessions pick them up. `claude plugin disable <name>@claude-mods` turns one off.

## Check a checkout

```
claude plugin validate readability-qol/reply-colors
claude plugin test readability-qol/reply-colors
claude plugin test readability-qol/readable-output
claude plugin test quote-reply
node --test readability-qol/readable-output/bin/hooks.node-test.ts
```

The engine writes each mod's TypeScript declarations to `.claude-plugin/types/` the first time it loads the mod. After that, `npx -p typescript tsc -p <mod folder>` type-checks it.

## License

MIT, see [LICENSE](LICENSE).
