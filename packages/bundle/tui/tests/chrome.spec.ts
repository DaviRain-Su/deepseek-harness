/** Session header, footer, and bottom-pinned prompt chrome. */

import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Component } from '@oh-my-pi/pi-tui'
import { visibleWidth } from '@oh-my-pi/pi-tui'
import {
  formatCwdForFooter,
  homeDir,
  isCwdInsideHome,
  MeasuredChild,
  SessionChrome,
  SessionFooter,
  SessionHeader,
  runningSubagentsLabel,
  subagentWindowTitle,
} from '../src/chrome.ts'

function stub(lines: string[], hooks?: {
  invalidate?: () => void
  dispose?: () => void
  setIgnoreTight?: (ignore: boolean) => void
}): Component {
  return {
    render: () => lines,
    ...hooks?.invalidate === undefined ? {} : { invalidate: hooks.invalidate },
    ...hooks?.dispose === undefined ? {} : { dispose: hooks.dispose },
    ...hooks?.setIgnoreTight === undefined ? {} : { setIgnoreTight: hooks.setIgnoreTight },
  }
}

function stack(header: MeasuredChild, transcript: MeasuredChild, chrome: SessionChrome, width: number): string[] {
  return [...header.render(width), ...transcript.render(width), ...chrome.render(width)]
}

describe('SessionHeader', () => {
  it('wraps the accent product name, key hints, and session id', () => {
    const header = new SessionHeader('session-1')
    header.invalidate()
    const lines = header.render(80)
    expect(lines.join('\n')).toContain('dsh')
    expect(lines.join('\n')).toContain('ctrl+c interrupt')
    expect(lines.join('\n')).toContain('ctrl+o expand')
    expect(lines.join('\n')).toContain('alt+o diff')
    expect(lines.join('\n')).toContain('/model')
    expect(lines.join('\n')).toContain('/theme')
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
    expect(footer.render(80)[1]).toContain('enter append')
    expect(footer.render(80)[1]).toContain('ctrl+c cancel')
    expect(visibleWidth(footer.render(28)[1] ?? '')).toBeLessThanOrEqual(28)
    for (const line of footer.render(4)) expect(visibleWidth(line)).toBeLessThanOrEqual(4)
    expect(visibleWidth(footer.render(16)[1] ?? '')).toBeLessThanOrEqual(16)
    expect(new SessionFooter('/tmp/work', 'm', undefined).render(40)[0]).toContain('/tmp/work')
    expect(new SessionFooter('/tmp/work', 'm', '/tmp/work').render(40)[0]).toContain('~')
  })

  it('counts running subagents on the stats row and shares the window-title label', () => {
    const footer = new SessionFooter('/tmp', 'm')
    footer.setSubagents(1)
    expect(footer.render(80)[1]).toContain('1 subagent running')
    footer.setSubagents(2)
    expect(footer.render(80)[1]).toContain('2 subagents running')
    footer.setSubagents(0)
    expect(footer.render(80)[1]).not.toContain('subagent')
    expect(runningSubagentsLabel(0)).toBeUndefined()
    expect(subagentWindowTitle(0)).toBe('dsh')
    expect(subagentWindowTitle(1)).toBe('dsh · 1 subagent running')
    expect(subagentWindowTitle(2)).toBe('dsh · 2 subagents running')
  })
})

describe('SessionChrome', () => {
  it('pads so the editor and footer sit on the last rows of a short frame', () => {
    const header = new MeasuredChild(stub(['H']))
    const transcript = new MeasuredChild(stub(['T']))
    const editor = stub(['E1', 'E2', 'E3'])
    const footer = stub(['F1', 'F2'])
    const chrome = new SessionChrome(() => 12, () => header.rows + transcript.rows, editor, footer)
    const frame = stack(header, transcript, chrome, 40)
    expect(frame).toHaveLength(12)
    expect(frame.slice(-5)).toEqual(['E1', 'E2', 'E3', 'F1', 'F2'])
    expect(frame.slice(0, 2)).toEqual(['H', 'T'])
    expect(frame.slice(2, 7).every(line => line === '')).toBe(true)
  })

  it('drops the pad when the transcript already fills the viewport', () => {
    const header = new MeasuredChild(stub(['H']))
    const transcript = new MeasuredChild(stub(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']))
    const chrome = new SessionChrome(
      () => 10,
      () => header.rows + transcript.rows,
      stub(['E']),
      stub(['F1', 'F2']),
    )
    const frame = stack(header, transcript, chrome, 40)
    expect(frame).toEqual(['H', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'E', 'F1', 'F2'])
  })

  it('forwards invalidate, dispose, and setIgnoreTight', () => {
    let invalidated = 0
    let disposed = 0
    let tight: boolean | undefined
    const inner = stub(['X'], {
      invalidate: () => { invalidated += 1 },
      dispose: () => { disposed += 1 },
      setIgnoreTight: (ignore) => { tight = ignore },
    })
    const measured = new MeasuredChild(inner)
    measured.invalidate()
    measured.setIgnoreTight(true)
    measured.dispose()
    expect(invalidated).toBe(1)
    expect(disposed).toBe(1)
    expect(tight).toBe(true)
    expect(measured.children).toEqual([inner])

    let editorInvalidated = 0
    let footerDisposed = 0
    const chrome = new SessionChrome(
      () => 4,
      () => 0,
      stub(['E'], { invalidate: () => { editorInvalidated += 1 }, setIgnoreTight: () => {} }),
      stub(['F'], { dispose: () => { footerDisposed += 1 } }),
    )
    chrome.invalidate()
    chrome.setIgnoreTight(false)
    chrome.dispose()
    expect(editorInvalidated).toBe(1)
    expect(footerDisposed).toBe(1)
    expect(chrome.children).toHaveLength(2)
  })
})
