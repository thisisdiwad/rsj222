/**
 * PKG-016 / P29 — ekran rekordów, statystyk i archiwum (DOS, 480×270).
 * Jedna tabela z zakładkami; model przygotowuje warstwa aplikacji.
 */

import { COLOR, clear, fitTableText, header, panel, text } from './competitionView'

export type RecordsTab = 'records' | 'stats' | 'archive'

export type RecordsColumn = {
  readonly label: string
  readonly x: number
  readonly width: number
  readonly align?: 'left' | 'right'
}

export type RecordsScreenView = {
  readonly tab: RecordsTab
  readonly subtitle: string
  readonly columns: readonly RecordsColumn[]
  readonly rows: readonly { readonly cells: readonly string[]; readonly human: boolean }[]
  readonly focusedRow: number
  readonly scroll: number
  readonly visibleRows: number
  readonly emptyText: string
  readonly notes: readonly string[]
  readonly message: string
}

const TABS: readonly { readonly id: RecordsTab; readonly label: string }[] = [
  { id: 'records', label: 'REKORDY' },
  { id: 'stats', label: 'STATYSTYKI' },
  { id: 'archive', label: 'ARCHIWUM WERSJI' },
]

export function drawRecordsScreen(context: CanvasRenderingContext2D, view: RecordsScreenView): void {
  clear(context)
  header(context, 'REKORDY I STATYSTYKI', view.subtitle)

  // Zakładki: ←/→ przełącza, aktywna na złotym tle.
  let tabX = 18
  for (const tab of TABS) {
    const width = tab.label.length * 6 + 16
    const active = tab.id === view.tab
    context.fillStyle = active ? COLOR.gold : COLOR.panelAlt
    context.fillRect(tabX, 38, width, 13)
    text(context, tab.label, tabX + 8, 48, active ? COLOR.ink : COLOR.dim, 7)
    tabX += width + 4
  }

  const noteHeight = view.notes.length > 0 ? view.notes.length * 10 + 8 : 0
  const tableHeight = 190 - noteHeight
  panel(context, 18, 54, 444, tableHeight)
  for (const column of view.columns) {
    const x = column.align === 'right' ? column.x + column.width : column.x
    text(context, column.label, x, 68, COLOR.dim, 7, column.align ?? 'left')
  }
  context.fillStyle = COLOR.blue
  context.fillRect(24, 72, 432, 1)

  if (view.rows.length === 0) text(context, view.emptyText, 30, 88, COLOR.dim, 7)
  const maximum = Math.max(0, view.rows.length - view.visibleRows)
  const start = Math.min(maximum, Math.max(0, view.scroll))
  const rowHeight = Math.max(10, Math.floor((tableHeight - 26) / view.visibleRows))
  view.rows.slice(start, start + view.visibleRows).forEach((row, offset) => {
    const index = start + offset
    const y = 84 + offset * rowHeight
    const focused = index === view.focusedRow
    if (focused) {
      context.fillStyle = COLOR.panelAlt
      context.fillRect(24, y - 9, 432, 12)
      context.fillStyle = COLOR.gold
      context.fillRect(24, y - 9, 2, 12)
    } else if (row.human) {
      context.fillStyle = '#294657'
      context.fillRect(24, y - 9, 432, 11)
    }
    const color = focused || row.human ? COLOR.gold : COLOR.text
    view.columns.forEach((column, cell) => {
      const value = fitTableText(row.cells[cell] ?? '', column.width, 1)
      const x = column.align === 'right' ? column.x + column.width : column.x
      text(context, value, x, y, color, 7, column.align ?? 'left')
    })
  })
  if (view.rows.length > view.visibleRows) {
    text(context, `${start + 1}-${Math.min(view.rows.length, start + view.visibleRows)}/${view.rows.length}`, 452, 54 + tableHeight - 6, COLOR.dim, 7, 'right')
  }

  if (view.notes.length > 0) {
    panel(context, 18, 54 + tableHeight + 2, 444, noteHeight - 2)
    view.notes.forEach((note, index) => text(context, fitTableText(note, 424, 1), 28, 54 + tableHeight + 14 + index * 10, COLOR.dim, 7))
  }

  context.fillStyle = COLOR.green
  context.fillRect(18, 250, 444, 14)
  text(context, fitTableText(view.message, 432, 1), 24, 260, COLOR.ink, 7)
}
