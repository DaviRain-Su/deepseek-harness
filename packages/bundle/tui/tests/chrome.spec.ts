/** Session header and footer chrome. */

import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { visibleWidth } from '@earendil-works/pi-tui'
import { formatCwdForFooter, homeDir, isCwdInsideHome, SessionFooter, SessionHeader } from '../src/chrome.ts'

describe('SessionHeader', () => {
  it('wraps the accent product name, key hints, and session id', () => {
    const header = new SessionHeader('session-1')
    header.invalidate()
    const lines = header.render(80)
    expect(lines.join('\n')).toContain('dsh')
    expect(lines.join('\n')).toContain('ctrl+c interrupt')
    expect(lines.join('\n')).toContain('/ commands')
    expect(lines.join('\n')).toContain('session session-1')
    expect(lines[0]).toContain('\x1b[')
    for (const line of header.render(8)) expect(visibleWidth(line)).toBeLessThanOrEqual(8)
  })
})

describe('formatCwdForFooter', () => {
  it('replaces home with ~ and leaves foreign paths intact', () => {
    expect(formatCwdForFooter('/tmp/work', undefined)).toBe('/tmp/work')
    expect(formatCwdForFooter('/tmp/work', '/tmp/work')).toBe('~')
    expect(formatCwdForFooter('/tmp/work/proj', '/tmp/work')).toBe('~/proj')
    expect(formatCwdForFooter('/other', '/tmp/work')).toBe('/other')
    expect(formatCwdForFooter('/tmp/work/../other', '/tmp/work')).toBe('/tmp/work/../other')
    expect(formatCwdForFooter('/tmp/work', '/tmp/work/proj')).toBe('/tmp/work')
    expect(isCwdInsideHome('')).toBe(true)
    expect(isCwdInsideHome('proj')).toBe(true)
    expect(isCwdInsideHome('..')).toBe(false)
    expect(isCwdInsideHome(`..${sep}x`)).toBe(false)
    expect(isCwdInsideHome('/elsewhere')).toBe(false)
    expect(homeDir({ HOME: '/a' })).toBe('/a')
    expect(homeDir({ USERPROFILE: '/b' })).toBe('/b')
    expect(homeDir({})).toBeUndefined()
    expect(new SessionFooter('/tmp/work', 'm').render(40)[0]).toBeDefined()
  })
})

describe('SessionFooter', () => {
  it('shows a dim cwd and right-aligned model, then a cancel hint while running', () => {
    const footer = new SessionFooter('/tmp/work/proj', '', '/tmp/work')
    footer.invalidate()
    footer.setModel('deepseek / v4')
    const idle = footer.render(80)
    expect(idle).toHaveLength(2)
    expect(idle[0]).toContain('~/proj')
    expect(idle[1]).toContain('deepseek / v4')
    expect(idle[1]?.startsWith(' ')).toBe(true)
    expect(idle.join('\n')).not.toContain('/help')
    for (const line of footer.render(8)) expect(visibleWidth(line)).toBeLessThanOrEqual(8)
    footer.setBusy(true)
    footer.setModel('abcdefghijklmnopqrstuvwxyz')
    expect(footer.render(80)[1]).toContain('ctrl+c cancel')
    expect(visibleWidth(footer.render(28)[1] ?? '')).toBeLessThanOrEqual(28)
    for (const line of footer.render(4)) expect(visibleWidth(line)).toBeLessThanOrEqual(4)
    expect(visibleWidth(footer.render(16)[1] ?? '')).toBeLessThanOrEqual(16)
    expect(new SessionFooter('/tmp/work', 'm', undefined).render(40)[0]).toContain('/tmp/work')
    expect(new SessionFooter('/tmp/work', 'm', '/tmp/work').render(40)[0]).toContain('~')
  })
})
