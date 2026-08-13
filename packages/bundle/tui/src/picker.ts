/**
 * Bottom-anchored SelectList overlay used by `/model` and `/theme`.
 * @module @deepseek-ai/dsh-tui/picker
 */

import { SelectList, type Component, type OverlayHandle, type SelectItem, type TUI } from '@oh-my-pi/pi-tui'
import { bold, fg, TUI_COLOR, TUI_SELECT_LIST_THEME } from './theme.ts'
import { wrapLine } from './wrap.ts'

/** Callbacks for one picker session. */
export interface OverlayPickerCallbacks {
  /** The user confirmed the highlighted item. */
  onSelect: (item: SelectItem) => void
  /** Escape or an empty catalog dismissed the overlay. */
  onCancel: () => void
}

/**
 * Title + searchable list + footer hint, shown through `tui.showOverlay`.
 */
export class OverlayPicker implements Component {
  private readonly list: SelectList

  /**
   * @param title - accent heading above the list.
   * @param items - rows to search and select.
   * @param hint - dim footer under the list.
   * @param callbacks - confirm and dismiss handlers.
   * @param selectedValue - preselected `SelectItem.value`, when present.
   */
  constructor(
    private readonly title: string,
    items: readonly SelectItem[],
    private readonly hint: string,
    callbacks: OverlayPickerCallbacks,
    selectedValue?: string,
  ) {
    this.list = new SelectList(items, 12, TUI_SELECT_LIST_THEME)
    this.list.onSelect = callbacks.onSelect
    this.list.onCancel = callbacks.onCancel
    if (selectedValue !== undefined) {
      const index = items.findIndex(item => item.value === selectedValue)
      if (index >= 0) this.list.setSelectedIndex(index)
    }
  }

  /**
   * @param width - columns available to this overlay.
   * @returns heading, list, and hint rows.
   */
  render(width: number): string[] {
    return [
      ...wrapLine(bold(fg(TUI_COLOR.accent, this.title)), width),
      ...this.list.render(width),
      ...wrapLine(fg(TUI_COLOR.dim, this.hint), width),
    ]
  }

  /**
   * Forward keys to the inner select list.
   * @param data - raw terminal input.
   */
  handleInput(data: string): void {
    this.list.handleInput(data)
  }

  /** Drop list caches. */
  invalidate(): void {
    this.list.invalidate()
  }
}

/**
 * Show a picker overlay anchored to the bottom of the terminal.
 * @param tui - the live renderer.
 * @param picker - the overlay component.
 * @returns the handle whose `hide` the caller must invoke on select or cancel.
 */
export function showPicker(tui: TUI, picker: OverlayPicker): OverlayHandle {
  return tui.showOverlay(picker, { anchor: 'bottom-center', width: '90%', maxHeight: '40%' })
}
