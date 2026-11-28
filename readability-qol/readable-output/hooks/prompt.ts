import { readFileSync } from 'node:fs'

export const OUTPUT_STYLE_PATH = new URL('../output-styles/readable.md', import.meta.url)

const FRONTMATTER = /^---\n[\s\S]*?\n---\n+/

export const REPORT_SHAPE = readFileSync(OUTPUT_STYLE_PATH, 'utf8').replace(FRONTMATTER, '').trimEnd()
