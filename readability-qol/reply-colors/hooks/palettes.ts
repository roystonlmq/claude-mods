import type { ReplyColorsInk, ReplyColorsSurface } from '../types'
import type { Role } from './paint'

export type Ink = ReplyColorsInk

export type Palette = Record<Role, Ink>

export type Scheme = 'dark' | 'light'

export const PALETTES = {
  calm: {
    heading: { color: '#8fbcd4', bold: true },
    strong: { color: '#e3a6c6', bold: true },
    bullet: { color: '#7a9fc2' },
    recommend: { color: '#e6c378', bold: true },
    risk: { color: '#e38c8c' },
    caution: { color: '#e0ad6e' },
    done: { color: '#9fcb8f' },
    number: { color: '#c3a2d9' },
    quote: { color: '#a9b2bf', italic: true },
    code: { color: '#93b7c2' },
    link: { color: '#8fbcd4' },
  },
  vivid: {
    heading: { color: '#5fafff', bold: true },
    strong: { color: '#ff87d7', bold: true },
    bullet: { color: '#5fafff' },
    recommend: { color: '#ffd75f', bold: true },
    risk: { color: '#ff5f5f', bold: true },
    caution: { color: '#ffaf00' },
    done: { color: '#5fd75f' },
    number: { color: '#d787ff' },
    quote: { color: '#bcbcbc', italic: true },
    code: { color: '#5fd7d7' },
    link: { color: '#5fafff' },
  },
} as const satisfies Record<string, Palette>

export const LIGHT_PALETTES = {
  calm: {
    heading: { color: '#2b6688', bold: true },
    strong: { color: '#9c3567', bold: true },
    bullet: { color: '#3f6a94' },
    recommend: { color: '#8a5a00', bold: true },
    risk: { color: '#b03a3a' },
    caution: { color: '#9a5300' },
    done: { color: '#3a7530' },
    number: { color: '#6f4796' },
    quote: { color: '#5c6570', italic: true },
    code: { color: '#2c6b78' },
    link: { color: '#2b6688' },
  },
  vivid: {
    heading: { color: '#005fd7', bold: true },
    strong: { color: '#c7005f', bold: true },
    bullet: { color: '#005fd7' },
    recommend: { color: '#946800', bold: true },
    risk: { color: '#d70000', bold: true },
    caution: { color: '#c75000' },
    done: { color: '#007a00' },
    number: { color: '#8700af' },
    quote: { color: '#585858', italic: true },
    code: { color: '#007a7a' },
    link: { color: '#005fd7' },
  },
} as const satisfies Record<keyof typeof PALETTES, Palette>

export type PaletteName = keyof typeof PALETTES

export const paletteNameOf = (name: unknown): PaletteName =>
  typeof name === 'string' && name in PALETTES ? (name as PaletteName) : 'calm'

export const paletteOf = (name: unknown, scheme: Scheme = 'dark'): Palette =>
  (scheme === 'light' ? LIGHT_PALETTES : PALETTES)[paletteNameOf(name)]

export const schemeOf = (theme: unknown): Scheme =>
  typeof theme === 'string' && /light/i.test(theme) ? 'light' : 'dark'

export const THEME_INKS = {
  heading: { color: 'suggestion', bold: true },
  strong: { color: 'planMode', bold: true },
  bullet: { color: 'suggestion' },
  recommend: { color: 'claude', bold: true },
  risk: { color: 'error' },
  caution: { color: 'warning' },
  done: { color: 'success' },
  number: { color: 'merged' },
  quote: { color: 'inactive', italic: true },
  code: { color: 'permission' },
  link: { color: 'suggestion' },
} as const satisfies Palette

export const inksFor = (palette: Palette, surface: ReplyColorsSurface): Palette =>
  surface === 'terminal' ? palette : THEME_INKS
