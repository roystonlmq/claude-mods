import type { ReplyColorsInk, ReplyColorsSurface } from '../types'
import type { Role } from './paint'

export type Ink = ReplyColorsInk

export type Palette = Record<Role, Ink>

export const PALETTES = {
  calm: {
    heading: { color: '#8fbcd4', bold: true },
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

export type PaletteName = keyof typeof PALETTES

export const paletteOf = (name: unknown): Palette =>
  typeof name === 'string' && name in PALETTES ? PALETTES[name as PaletteName] : PALETTES.calm

export const THEME_INKS = {
  heading: { color: 'suggestion', bold: true },
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
