/**
 * Load a TUI palette from a JSON theme file. Extra OMP keys are ignored;
 * `vars` references, 256-color indexes, empty terminal-default colors, and
 * `toolDiffAdded` / `toolDiffRemoved` aliases are accepted.
 * @module @deepseek-ai/dsh-tui/theme-file
 */

/** Truecolor tokens one built-in or custom theme paints with. */
export interface TuiPalette {
  accent: string
  borderMuted: string
  error: string
  muted: string
  dim: string
  text: string
  selectedBg: string
  userMessageBg: string
  userMessageText: string
  toolPendingBg: string
  toolSuccessBg: string
  toolErrorBg: string
  mdHeading: string
  mdLink: string
  mdLinkUrl: string
  mdCode: string
  mdCodeBlock: string
  mdCodeBlockBorder: string
  mdQuote: string
  mdQuoteBorder: string
  mdHr: string
  mdListBullet: string
  diffAdd: string
  diffDel: string
}

/** Palette keys a custom theme file must resolve. */
export const PALETTE_KEYS = [
  'accent',
  'borderMuted',
  'error',
  'muted',
  'dim',
  'text',
  'selectedBg',
  'userMessageBg',
  'userMessageText',
  'toolPendingBg',
  'toolSuccessBg',
  'toolErrorBg',
  'mdHeading',
  'mdLink',
  'mdLinkUrl',
  'mdCode',
  'mdCodeBlock',
  'mdCodeBlockBorder',
  'mdQuote',
  'mdQuoteBorder',
  'mdHr',
  'mdListBullet',
  'diffAdd',
  'diffDel',
] as const satisfies readonly (keyof TuiPalette)[]

const DIFF_ALIASES = {
  diffAdd: 'toolDiffAdded',
  diffDel: 'toolDiffRemoved',
} as const

const ANSI16 = [
  '#000000', '#800000', '#008000', '#808000',
  '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00',
  '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
] as const

const CUBE = [0, 95, 135, 175, 215, 255] as const

/**
 * Parse one theme JSON document into a live palette.
 * @param raw - file contents.
 * @param origin - path or id used in error text.
 * @returns the resolved palette.
 */
export function parseThemeDocument(raw: string, origin: string): TuiPalette {
  let document: unknown
  try {
    document = JSON.parse(raw) as unknown
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`invalid theme JSON (${origin}): ${detail}`)
  }
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`invalid theme JSON (${origin}): expected an object`)
  }
  const root = document as Record<string, unknown>
  const vars = parseVars(root.vars, origin)
  const colors = colorTable(root)
  if (colors === undefined) {
    throw new Error(`invalid theme JSON (${origin}): missing colors`)
  }
  const palette = {} as TuiPalette
  for (const key of PALETTE_KEYS) {
    const rawValue = colors[key] ?? aliased(colors, key)
    if (rawValue === undefined) {
      throw new Error(`invalid theme JSON (${origin}): missing color ${key}`)
    }
    palette[key] = resolveColor(rawValue, vars, origin, key, [])
  }
  return palette
}

function colorTable(root: Record<string, unknown>): Record<string, unknown> | undefined {
  if (root.colors !== undefined) {
    if (root.colors === null || typeof root.colors !== 'object' || Array.isArray(root.colors)) {
      return undefined
    }
    return root.colors as Record<string, unknown>
  }
  return root
}

function aliased(colors: Record<string, unknown>, key: keyof TuiPalette): unknown {
  if (key !== 'diffAdd' && key !== 'diffDel') return undefined
  return colors[DIFF_ALIASES[key]]
}

function parseVars(value: unknown, origin: string): Record<string, unknown> {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid theme JSON (${origin}): vars must be an object`)
  }
  return value as Record<string, unknown>
}

function resolveColor(
  value: unknown,
  vars: Record<string, unknown>,
  origin: string,
  key: string,
  stack: readonly string[],
): string {
  if (value === '') return ''
  if (typeof value === 'number' && Number.isInteger(value)) return color256ToHex(value, origin, key)
  if (typeof value !== 'string') {
    throw new Error(`invalid theme JSON (${origin}): color ${key} must be hex, a var name, a 256-color index, or empty`)
  }
  if (isHex(value)) return normalizeHex(value)
  const next = vars[value]
  if (next === undefined) {
    throw new Error(`invalid theme JSON (${origin}): unknown color ${key} value ${value}`)
  }
  if (stack.includes(value)) {
    throw new Error(`invalid theme JSON (${origin}): circular var ${value}`)
  }
  return resolveColor(next, vars, origin, key, [...stack, value])
}

function isHex(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
}

function normalizeHex(value: string): string {
  if (value.length === 7) return value.toLowerCase()
  const r = value[1]
  const g = value[2]
  const b = value[3]
  if (r === undefined || g === undefined || b === undefined) return value.toLowerCase()
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
}

function color256ToHex(index: number, origin: string, key: string): string {
  if (index < 0 || index > 255) {
    throw new Error(`invalid theme JSON (${origin}): color ${key} 256-index out of range`)
  }
  if (index < 16) return ANSI16[index] ?? '#000000'
  if (index >= 232) {
    const gray = 8 + (index - 232) * 10
    return toHex(gray, gray, gray)
  }
  const cube = index - 16
  const r = CUBE[Math.floor(cube / 36)] ?? 0
  const g = CUBE[Math.floor(cube % 36 / 6)] ?? 0
  const b = CUBE[cube % 6] ?? 0
  return toHex(r, g, b)
}

function toHex(r: number, g: number, b: number): string {
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

function byte(value: number): string {
  return value.toString(16).padStart(2, '0')
}
