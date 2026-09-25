/**
 * PKG-015 / P26–P28 — ekrany DOS: obsada drużyn, tabela drużynowa,
 * konfiguracja i eliminacje King of the Hill. Bufor 480×270, font
 * bitmapowy i prostokątne ramki — ten sam styl co ekrany sezonu (PKG-014).
 */

import type { KothView, TeamTableView } from '../app/competitionSession'
import { COLOR, clear, fitTableText, header, panel, points, text } from './competitionView'
import { drawPixelText } from './pixelFont'

export type SetupRow = {
  readonly label: string
  readonly focused: boolean
  readonly adjustable?: boolean
}

export type TeamSetupView = {
  readonly title: string
  readonly subtitle: string
  readonly settingRows: readonly SetupRow[]
  readonly teams: readonly { readonly code: string; readonly humans: number; readonly focused: boolean }[]
  readonly focusedTeam: {
    readonly code: string
    readonly slots: readonly {
      readonly group: string
      readonly controller: string
      readonly athlete: string
      readonly human: boolean
      readonly focused: boolean
    }[]
  }
  /** „kto steruje którym miejscem”: jedna linia na gracza. */
  readonly controllers: readonly string[]
  readonly resumeLine: string | null
  readonly message: string
  readonly error: boolean
}

export type KothSetupView = {
  readonly subtitle: string
  readonly settingRows: readonly SetupRow[]
  readonly participants: readonly { readonly number: number; readonly name: string; readonly controller: string; readonly human: boolean }[]
  readonly resumeLine: string | null
  readonly message: string
  readonly error: boolean
}

function footerBar(context: CanvasRenderingContext2D, value: string, color: string = COLOR.green): void {
  context.fillStyle = color
  context.fillRect(18, 250, 444, 14)
  text(context, fitTableText(value, 432, 1), 24, 260, COLOR.ink, 7)
}

function focusBar(context: CanvasRenderingContext2D, x: number, y: number, width: number, height = 12): void {
  context.fillStyle = COLOR.panelAlt
  context.fillRect(x, y - 9, width, height)
  context.fillStyle = COLOR.gold
  context.fillRect(x, y - 9, 2, height)
}

function humanBar(context: CanvasRenderingContext2D, x: number, y: number, width: number): void {
  context.fillStyle = '#294657'
  context.fillRect(x, y - 9, width, 11)
}

function drawSettingRows(context: CanvasRenderingContext2D, rows: readonly SetupRow[], x: number, y: number, width: number): void {
  rows.forEach((row, index) => {
    const rowY = y + index * 13
    if (row.focused) focusBar(context, x - 6, rowY, width)
    const arrows = row.adjustable ? ['← ', ' →'] : ['', '']
    text(context, fitTableText(`${row.focused ? '>' : ' '} ${arrows[0]}${row.label}${arrows[1]}`, width - 10, 1), x, rowY, row.focused ? COLOR.gold : COLOR.text, 7)
  })
}

export function drawTeamSetup(context: CanvasRenderingContext2D, view: TeamSetupView): void {
  clear(context)
  header(context, view.title, view.subtitle)

  // Lewa kolumna: lista drużyn w kolejności startu I serii.
  panel(context, 18, 40, 150, 206)
  text(context, 'KOLEJNOŚĆ STARTU', 28, 55, COLOR.gold, 7)
  const rowHeight = view.teams.length > 12 ? 11 : 13
  view.teams.forEach((team, index) => {
    const y = 69 + index * rowHeight
    if (team.focused) focusBar(context, 24, y, 138, rowHeight)
    else if (team.humans > 0) humanBar(context, 24, y, 138)
    const color = team.focused ? COLOR.gold : team.humans > 0 ? COLOR.gold : COLOR.text
    text(context, `${String(index + 1).padStart(2, ' ')}. ${team.code}`, 30, y, color, 7)
    text(context, team.humans > 0 ? `GRACZE: ${team.humans}` : 'BOTY', 156, y, team.humans > 0 ? COLOR.gold : COLOR.dim, 7, 'right')
  })

  // Prawa kolumna: ustawienia, obsada wybranej drużyny, kto steruje.
  panel(context, 174, 40, 288, 206)
  drawSettingRows(context, view.settingRows, 186, 56, 270)
  const slotsTop = 56 + view.settingRows.length * 13 + 12
  text(context, `OBSADA ${view.focusedTeam.code}`, 186, slotsTop, COLOR.gold, 7)
  context.fillStyle = COLOR.blue
  context.fillRect(186, slotsTop + 4, 264, 1)
  view.focusedTeam.slots.forEach((slot, index) => {
    const y = slotsTop + 17 + index * 13
    if (slot.focused) focusBar(context, 180, y, 276)
    else if (slot.human) humanBar(context, 180, y, 276)
    const color = slot.focused || slot.human ? COLOR.gold : COLOR.text
    text(context, `${slot.focused ? '>' : ' '} ${slot.group}`, 186, y, color, 7)
    text(context, fitTableText(`${slot.controller}: ${slot.athlete}`, 196, 1), 252, y, color, 7)
  })
  const controllersTop = slotsTop + 17 + view.focusedTeam.slots.length * 13 + 8
  text(context, 'KTO STERUJE KTÓRYM MIEJSCEM', 186, controllersTop, COLOR.gold, 7)
  const column = Math.ceil(view.controllers.length / 2)
  view.controllers.forEach((line, index) => {
    const x = index < column ? 186 : 324
    const y = controllersTop + 12 + (index % column) * 10
    text(context, fitTableText(line, 132, 1), x, y, COLOR.dim, 7)
  })
  if (view.resumeLine) text(context, fitTableText(view.resumeLine, 264, 1), 186, 238, COLOR.green, 7)

  footerBar(context, view.message, view.error ? COLOR.red : COLOR.green)
}

export function drawKothSetup(context: CanvasRenderingContext2D, view: KothSetupView): void {
  clear(context)
  header(context, 'KING OF THE HILL', view.subtitle)

  panel(context, 18, 40, 190, 206)
  drawSettingRows(context, view.settingRows, 30, 56, 176)
  const rules = [
    'TRYB ROZRYWKOWY:',
    'W KAŻDEJ RUNDZIE SKACZĄ',
    'WSZYSCY POZOSTALI,',
    'NAJGORSZA NOTA ODPADA.',
    'REMIS OSTATNICH:',
    'JEDNA DOGRYWKA TYCH OSÓB,',
    'PONOWNY REMIS - ODPADAJĄ.',
    'REMIS WSZYSTKICH:',
    'WSPÓLNE ZWYCIĘSTWO.',
    'REZYGNACJA (Q) — WYJŚCIE.',
  ]
  rules.forEach((line, index) => text(context, line, 30, 112 + index * 11, index === 0 ? COLOR.gold : COLOR.dim, 7))

  panel(context, 214, 40, 248, 206)
  text(context, `UCZESTNICY (${view.participants.length}/10)`, 224, 56, COLOR.gold, 7)
  context.fillStyle = COLOR.blue
  context.fillRect(224, 61, 228, 1)
  view.participants.forEach((row, index) => {
    const y = 76 + index * 14
    if (row.human) humanBar(context, 220, y, 236)
    const color = row.human ? COLOR.gold : COLOR.text
    text(context, `${String(row.number).padStart(2, ' ')}.`, 238, y, color, 7, 'right')
    text(context, fitTableText(row.name, 120, 1), 244, y, color, 7)
    text(context, row.controller, 452, y, row.human ? COLOR.gold : COLOR.dim, 7, 'right')
  })
  if (view.resumeLine) text(context, fitTableText(view.resumeLine, 228, 1), 224, 238, COLOR.green, 7)

  footerBar(context, view.message, view.error ? COLOR.red : COLOR.green)
}

const ROUND_SHORT: Readonly<Record<string, string>> = {
  'PIERWSZA SERIA': 'I SERIA',
  'DRUGA SERIA': 'II SERIA',
  'FINAŁ': 'FINAŁ',
}

function tenths(value: number | null): string {
  return value === null ? '—' : points(value).replace(' pkt', '')
}

export type TeamTableScreen = {
  readonly title: string
  readonly subtitle: string
  readonly table: TeamTableView
  readonly scroll: number
  readonly visibleRows: number
  readonly footer: string
  /** P30: duży tekst — miejsce, drużyna i suma w skali 2×, bez kolumny składu. */
  readonly largeText?: boolean
}

function drawLargeTeamRows(context: CanvasRenderingContext2D, view: TeamTableScreen): void {
  const { table } = view
  const maximum = Math.max(0, table.rows.length - view.visibleRows)
  const start = Math.min(maximum, Math.max(0, view.scroll))
  table.rows.slice(start, start + view.visibleRows).forEach((row, offset) => {
    const top = 62 + offset * 16
    if (row.human) {
      context.fillStyle = '#294657'
      context.fillRect(24, top - 1, 432, 15)
    }
    const out = table.advanceLimit !== null && row.rank > table.advanceLimit
    const color = row.human ? COLOR.gold : out ? COLOR.border : COLOR.text
    drawPixelText(context, `${row.rank}.`, 64, top, color, 2, 'right')
    drawPixelText(context, row.name, 74, top, color, 2)
    drawPixelText(context, tenths(row.totalTenths), 450, top, color, 2, 'right')
  })
}

export function drawTeamTable(context: CanvasRenderingContext2D, view: TeamTableScreen): void {
  clear(context)
  header(context, view.title, view.subtitle)
  const { table } = view
  if (view.largeText) {
    panel(context, 18, 40, 444, 142)
    drawLargeTeamRows(context, view)
  }
  if (!view.largeText) panel(context, 18, 40, 444, 142)
  const columns = view.largeText ? [] : [262, 322, 382].slice(0, table.roundLabels.length)
  if (!view.largeText) {
    text(context, 'DRUŻYNA', 48, 54, COLOR.dim, 7)
    table.roundLabels.forEach((label, index) => text(context, ROUND_SHORT[label] ?? label, columns[index]!, 54, COLOR.dim, 7, 'right'))
    text(context, 'SUMA', 452, 54, COLOR.gold, 7, 'right')
    context.fillStyle = COLOR.blue
    context.fillRect(24, 58, 432, 1)
  }

  const maximum = Math.max(0, table.rows.length - view.visibleRows)
  const start = Math.min(maximum, Math.max(0, view.scroll))
  const rowHeight = Math.floor(118 / view.visibleRows)
  if (!view.largeText) table.rows.slice(start, start + view.visibleRows).forEach((row, offset) => {
    const index = start + offset
    const y = 70 + offset * rowHeight
    if (row.human) humanBar(context, 24, y, 432)
    const out = table.advanceLimit !== null && row.rank > table.advanceLimit
    const color = row.human ? COLOR.gold : out ? COLOR.border : COLOR.text
    text(context, `${row.rank}.`, 42, y, color, 7, 'right')
    text(context, row.name, 48, y, color, 7)
    const lineup = row.members.map((member) => member.name.split(' ').at(-1) ?? member.name).join(', ')
    // Kolumna składu kończy się przed pierwszą kolumną not (prawy brzeg 262).
    text(context, fitTableText(lineup, 146, 1), 76, y, row.human ? COLOR.gold : COLOR.dim, 7)
    row.roundTenths.forEach((value, round) => {
      if (columns[round] !== undefined) text(context, tenths(value), columns[round]!, y, color, 7, 'right')
    })
    text(context, tenths(row.totalTenths), 452, y, row.human ? COLOR.gold : COLOR.text, 7, 'right')
    // Linia awansu pod ostatnią awansującą drużyną.
    const next = table.rows[index + 1]
    if (table.advanceLimit !== null && row.rank <= table.advanceLimit && next && next.rank > table.advanceLimit) {
      context.fillStyle = COLOR.green
      for (let x = 24; x < 456; x += 4) context.fillRect(x, y + 3, 2, 1)
    }
  })

  // Skład: pierwsza drużyna z graczem albo lider.
  const spotlight = table.rows.find((row) => row.human) ?? table.rows[0]
  panel(context, 18, 186, 444, 60)
  if (spotlight) {
    text(context, `SKŁAD ${spotlight.name} • ${spotlight.rank}. MIEJSCE`, 28, 200, COLOR.gold, 7)
    const perColumn = 2
    spotlight.members.forEach((member, index) => {
      const x = index < perColumn ? 28 : 246
      const y = 213 + (index % perColumn) * 12
      const notes = member.rounds.map((value) => (typeof value === 'number' ? tenths(value) : value === null ? '—' : value.toUpperCase().replace('WITHDRAWN', 'REZ.'))).join(' / ')
      text(context, fitTableText(`G${index + 1} ${member.name}`, 110, 1), x, y, member.human ? COLOR.gold : COLOR.text, 7)
      text(context, fitTableText(notes, 96, 1), x + 206, y, member.human ? COLOR.gold : COLOR.dim, 7, 'right')
    })
  }
  footerBar(context, view.footer)
}

export type KothBoardScreen = {
  readonly title: string
  readonly subtitle: string
  readonly koth: KothView
  readonly footer: string
  /** P30: duży tekst — nazwiska i noty w skali 2×. */
  readonly largeText?: boolean
}

export function drawKothBoard(context: CanvasRenderingContext2D, view: KothBoardScreen): void {
  clear(context)
  header(context, view.title, view.subtitle)
  const { koth } = view

  panel(context, 18, 40, 206, 188)
  text(context, 'UCZESTNICY', 28, 55, COLOR.gold, 7)
  koth.rows.forEach((row, index) => {
    const y = 70 + index * 15
    if (view.largeText) {
      const top = 60 + index * 16
      if (row.human) humanBar(context, 24, top + 10, 194)
      const color = row.state === 'winner' ? COLOR.gold : row.state === 'out' ? COLOR.red : row.human ? COLOR.gold : COLOR.text
      const surname = row.name.split(' ').at(-1) ?? row.name
      drawPixelText(context, fitTableText(`${row.rank ?? ' '} ${surname}`, 136, 2), 28, top, color, 2)
      drawPixelText(context, row.state === 'winner' ? 'WYGR' : row.state === 'in' ? 'GRA' : `R${row.eliminatedInRound}`, 216, top, color, 2, 'right')
      return
    }
    if (row.human) humanBar(context, 24, y, 194)
    const color = row.state === 'winner' ? COLOR.gold : row.state === 'out' ? COLOR.border : row.human ? COLOR.gold : COLOR.text
    const rank = row.rank === null ? ' ' : `${row.rank}.`
    text(context, rank, 44, y, color, 7, 'right')
    text(context, fitTableText(row.name, 100, 1), 50, y, color, 7)
    const state = row.state === 'winner' ? 'ZWYCIĘZCA' : row.state === 'in' ? 'W GRZE' : `ODPADŁ R${row.eliminatedInRound}`
    text(context, state, 214, y, row.state === 'out' ? COLOR.red : row.state === 'winner' ? COLOR.gold : COLOR.green, 7, 'right')
  })

  panel(context, 230, 40, 232, 188)
  text(context, `${koth.roundLabel} • NOTY`, 240, 55, COLOR.gold, 7)
  context.fillStyle = COLOR.blue
  context.fillRect(240, 60, 212, 1)
  koth.roundResults.forEach((row, index) => {
    const y = 74 + index * 15
    if (view.largeText) {
      const top = 64 + index * 16
      const color = row.eliminated ? COLOR.red : row.human ? COLOR.gold : COLOR.text
      const value = row.totalTenths !== null ? tenths(row.totalTenths) : row.status === 'waiting' ? '—' : row.status.toUpperCase().slice(0, 3)
      drawPixelText(context, fitTableText(row.name.split(' ').at(-1) ?? row.name, 120, 2), 240, top, color, 2)
      drawPixelText(context, value, 452, top, color, 2, 'right')
      return
    }
    if (row.human) humanBar(context, 236, y, 220)
    const color = row.eliminated ? COLOR.red : row.human ? COLOR.gold : COLOR.text
    text(context, row.eliminated ? 'X' : ' ', 244, y, COLOR.red, 7)
    text(context, fitTableText(row.name, 120, 1), 254, y, color, 7)
    const value = row.totalTenths !== null
      ? tenths(row.totalTenths)
      : row.status === 'waiting' ? '—' : row.status.toUpperCase().replace('WITHDRAWN', 'REZ.')
    text(context, value, 452, y, color, 7, 'right')
  })

  context.fillStyle = COLOR.panelAlt
  context.fillRect(18, 232, 444, 14)
  text(context, fitTableText(koth.verdict, 432, 1), 24, 242, COLOR.gold, 7)
  footerBar(context, view.footer)
}
