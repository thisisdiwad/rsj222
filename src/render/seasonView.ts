/**
 * PKG-014 / P23–P25 — ekrany DOS: hub sezonu/turnieju, edycja kalendarza i
 * drabinka KO. Bufor 480×270, wyłącznie font bitmapowy i prostokątne ramki.
 * Widok dostaje gotowy model z warstwy aplikacji; nie zna IndexedDB.
 */

import type { KoBracketView, KoPairRow } from '../app/competitionSession'
import { COLOR, clear, fitTableText, header, panel, points, text } from './competitionView'

export type SeasonHubRow = {
  readonly label: string
  readonly enabled: boolean
  /** Wiersz z wartością zmienianą ←/→. */
  readonly adjustable?: boolean
}

export type SeasonHubView = {
  readonly title: string
  readonly subtitle: string
  readonly rows: readonly SeasonHubRow[]
  readonly focusedRow: number
  readonly standingsTitle: string
  readonly standings: readonly { readonly rank: number; readonly name: string; readonly value: string; readonly human: boolean }[]
  readonly events: readonly {
    readonly number: number
    readonly label: string
    readonly state: 'done' | 'cancelled' | 'next' | 'pending'
    readonly note: string
  }[]
  readonly setLine: string
  readonly message: string
}

export type CalendarEditorView = {
  readonly events: readonly { readonly number: number; readonly label: string; readonly focused: boolean }[]
  readonly count: number
  readonly focusedNumber: number
  readonly library: readonly { readonly label: string; readonly selected: boolean }[]
  readonly setKey: string
  readonly dirty: boolean
  readonly message: string
}

export type KoBracketScreen = {
  readonly title: string
  readonly subtitle: string
  readonly bracket: KoBracketView
  readonly scroll: number
  readonly visibleRows: number
  readonly footer: string
}

function footerBar(context: CanvasRenderingContext2D, value: string, color: string = COLOR.green): void {
  context.fillStyle = color
  context.fillRect(18, 250, 444, 14)
  text(context, fitTableText(value, 432, 1), 24, 260, COLOR.ink, 7)
}

export function drawSeasonHub(context: CanvasRenderingContext2D, view: SeasonHubView): void {
  clear(context)
  header(context, view.title, view.subtitle)

  // Lewa kolumna: lista akcji z jawnym fokusem.
  panel(context, 18, 40, 190, 118)
  view.rows.forEach((row, index) => {
    const y = 58 + index * 16
    const focused = index === view.focusedRow
    if (focused) {
      context.fillStyle = COLOR.panelAlt
      context.fillRect(24, y - 11, 178, 15)
      context.fillStyle = COLOR.gold
      context.fillRect(24, y - 11, 2, 15)
    }
    const arrows = row.adjustable && row.enabled ? '← ' : ''
    const suffix = row.adjustable && row.enabled ? ' →' : ''
    const color = !row.enabled ? COLOR.border : focused ? COLOR.gold : COLOR.text
    text(context, fitTableText(`${focused ? '>' : ' '} ${arrows}${row.label}${suffix}`, 170, 1), 30, y, color, 7)
  })

  // Lewa kolumna, dół: kalendarz (okno wokół następnego konkursu).
  panel(context, 18, 162, 190, 84)
  text(context, 'KALENDARZ', 28, 176, COLOR.gold, 7)
  view.events.forEach((event, index) => {
    const y = 189 + index * 10
    const mark = event.state === 'done' ? '+' : event.state === 'cancelled' ? 'X' : event.state === 'next' ? '>' : '·'
    const color = event.state === 'next' ? COLOR.gold : event.state === 'pending' ? COLOR.dim : COLOR.text
    text(context, fitTableText(`${mark} ${String(event.number).padStart(2, '0')} ${event.label}`, 136, 1), 28, y, color, 7)
    text(context, event.note, 198, y, event.state === 'cancelled' ? COLOR.red : COLOR.dim, 7, 'right')
  })

  // Prawa kolumna: klasyfikacja.
  panel(context, 214, 40, 248, 206)
  text(context, view.standingsTitle, 224, 56, COLOR.gold, 7)
  context.fillStyle = COLOR.blue
  context.fillRect(224, 61, 228, 1)
  if (view.standings.length === 0) {
    text(context, 'BRAK WYNIKÓW — ROZEGRAJ PIERWSZY KONKURS', 224, 78, COLOR.dim, 7)
  }
  view.standings.forEach((row, index) => {
    const y = 74 + index * 12
    if (row.human) {
      context.fillStyle = '#294657'
      context.fillRect(220, y - 9, 236, 11)
    }
    const color = row.human ? COLOR.gold : COLOR.text
    text(context, `${String(row.rank).padStart(2, ' ')}.`, 238, y, color, 7, 'right')
    text(context, fitTableText(row.name, 132, 1), 244, y, color, 7)
    text(context, row.value, 452, y, color, 7, 'right')
  })
  text(context, fitTableText(view.setLine, 228, 1), 224, 238, COLOR.dim, 7)

  footerBar(context, view.message)
}

export function drawCalendarEditor(context: CanvasRenderingContext2D, view: CalendarEditorView): void {
  clear(context)
  header(
    context,
    'WŁASNY KALENDARZ',
    `${view.count}/40 KONKURSÓW • POZYCJA ${view.focusedNumber}${view.dirty ? ' • NIEZAPISANE ZMIANY' : ' • ZAPISANY'}`,
  )

  panel(context, 18, 40, 236, 206)
  view.events.forEach((event, index) => {
    const y = 56 + index * 12
    if (event.focused) {
      context.fillStyle = COLOR.panelAlt
      context.fillRect(24, y - 9, 224, 12)
      context.fillStyle = COLOR.gold
      context.fillRect(24, y - 9, 2, 12)
    }
    const color = event.focused ? COLOR.gold : COLOR.text
    text(context, fitTableText(`${event.focused ? '>' : ' '} ${String(event.number).padStart(2, '0')}. ${event.label}`, 214, 1), 30, y, color, 7)
  })

  panel(context, 260, 40, 202, 206)
  text(context, 'BIBLIOTEKA SKOCZNI', 270, 56, COLOR.gold, 7)
  view.library.forEach((hill, index) => {
    const y = 70 + index * 11
    text(context, fitTableText(`${hill.selected ? '>' : ' '} ${hill.label}`, 184, 1), 270, y, hill.selected ? COLOR.gold : COLOR.dim, 7)
  })
  const keys = [
    '↑/↓  WYBÓR POZYCJI',
    '←/→  ZMIEŃ SKOCZNIĘ',
    'A  DODAJ ZA POZYCJĄ',
    'X  USUŃ POZYCJĘ',
    '[ / ]  PRZESUŃ W GÓRĘ/DÓŁ',
    'ENTER  ZAPISZ',
    'BACKSPACE  WSTECZ',
  ]
  const top = 78 + view.library.length * 11
  keys.forEach((line, index) => text(context, line, 270, top + index * 11, COLOR.text, 7))
  text(context, 'KLUCZ ZESTAWU (PUCHAR):', 270, 226, COLOR.dim, 7)
  text(context, view.setKey, 270, 238, COLOR.gold, 7)

  footerBar(context, view.message, view.message.startsWith('NIE') ? COLOR.red : COLOR.green)
}

/** Przed wynikami (brak kolumny punktów) mieści się też miejsce z kwalifikacji. */
function slotLine(slot: KoPairRow['slots'][number], resolved: boolean): string {
  const number = slot.koStartNumber === null ? '  ' : String(slot.koStartNumber).padStart(2, '0')
  const rank = resolved || slot.qualificationRank === null ? '' : ` (${slot.qualificationRank}.)`
  return `#${number} ${slot.name}${rank}`
}

function slotScore(slot: KoPairRow['slots'][number], resolved: boolean): string {
  if (!resolved) return ''
  if (slot.totalTenths !== null) return points(slot.totalTenths).replace(' pkt', '')
  return slot.participantId ? slot.status.toUpperCase().replace('WITHDRAWN', 'REZ.') : ''
}

export function drawKoBracket(context: CanvasRenderingContext2D, view: KoBracketScreen): void {
  clear(context)
  header(context, view.title, view.subtitle)
  panel(context, 18, 40, 444, 196)
  const { bracket } = view
  const lucky = new Set([...bracket.luckyLosers, ...bracket.longFallAdvancers])
  const maximum = Math.max(0, bracket.pairs.length - view.visibleRows)
  const start = Math.min(maximum, Math.max(0, view.scroll))
  const rowHeight = Math.floor(184 / view.visibleRows)
  bracket.pairs.slice(start, start + view.visibleRows).forEach((pair, index) => {
    const y = 56 + index * rowHeight
    const human = pair.slots.some((slot) => slot.participantId?.startsWith('local-'))
    if (human) {
      context.fillStyle = '#294657'
      context.fillRect(24, y - 9, 432, 12)
    }
    text(context, `P${String(pair.index).padStart(2, '0')}`, 28, y, COLOR.dim, 7)
    pair.slots.forEach((slot, slotIndex) => {
      const x = slotIndex === 0 ? 50 : 256
      const won = bracket.resolved && slot.participantId !== null && slot.participantId === pair.winnerId
      const luckyLoser = bracket.resolved && slot.participantId !== null && lucky.has(slot.participantId)
      const color = !bracket.resolved ? COLOR.text : won ? COLOR.gold : luckyLoser ? COLOR.green : COLOR.border
      const marker = won ? '>' : luckyLoser ? '+' : ' '
      text(context, marker, x, y, color, 7)
      text(context, fitTableText(slotLine(slot, bracket.resolved), bracket.resolved ? 150 : 186, 1), x + 8, y, color, 7)
      text(context, slotScore(slot, bracket.resolved), x + 196, y, color, 7, 'right')
    })
    text(context, ':', 251, y, COLOR.dim, 7, 'center')
  })

  const legend = bracket.resolved
    ? `> ZWYCIĘZCA PARY  + NAJLEPSZY PRZEGRANY (${lucky.size})  • FINAŁ: ${bracket.pairs.filter((pair) => pair.winnerId).length + lucky.size}`
    : 'PARY: MIEJSCE K Z KWALIFIKACJI PRZECIW K+25 • #NR STARTOWY SERII KO'
  text(context, fitTableText(legend, 432, 1), 240, 246, COLOR.gold, 7, 'center')
  footerBar(context, view.footer)
}
