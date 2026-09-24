/** PKG-014 / P23–P24 — Q-FIS-13: puchar (punkty za miejsca) kontra suma skoków; kalendarz i klucz zestawu. */
import { describe, expect, it } from 'vitest'
import type { RankingEntry } from '../src/sport/competition'
import {
  CUP_POINTS,
  calendarProblems,
  createSeason,
  cupPointsForRank,
  eventSeed,
  insertCalendarEvent,
  moveCalendarEvent,
  nextEventIndex,
  recordSeasonEvent,
  removeCalendarEvent,
  seasonSetKey,
  seasonStandings,
  type CalendarEvent,
  type SeasonCalendar,
  type SeasonFormat,
  type SeasonState,
} from '../src/sport/season'

const LIBRARY: readonly CalendarEvent[] = [
  { hillId: 'h01', hillVersion: 'v1' },
  { hillId: 'h02', hillVersion: 'v2' },
  { hillId: 'h03', hillVersion: 'v3' },
  { hillId: 'h04', hillVersion: 'v4' },
]
const TEST_CALENDAR: SeasonCalendar = { id: 'test-4', name: 'TESTOWY 4', events: LIBRARY }
const VERSIONS = { rules: 'modern-2026.1', physics: ['phys-a', 'phys-b'] }
const SETUP = { profileCount: 1, difficulty: 'normal' as const }

function season(format: SeasonFormat = 'cup', calendar = TEST_CALENDAR): SeasonState {
  return createSeason({ id: 's1', format, calendar, setup: SETUP, versions: VERSIONS, library: LIBRARY, nowMs: 0 })
}

/** Tabela konkursu z jawnych wierszy [id, miejsce, suma w dziesiątych]. */
function table(rows: ReadonlyArray<readonly [string, number | null, number | null]>): RankingEntry[] {
  return rows.map(([participantId, rank, totalTenths]) => ({
    participantId, name: participantId.toUpperCase(), rank, totalTenths, status: rank === null ? 'dns' : 'landed',
  }))
}

/** Kontrolny sezon 4 konkursów — zdefiniowana tabela wyników. */
const EVENTS: readonly RankingEntry[][] = [
  table([['a', 1, 2800], ['b', 2, 2700], ['c', 3, 2600], ['d', 4, 2500]]),
  table([['b', 1, 2900], ['a', 2, 2600], ['c', 2, 2600], ['d', 4, 2000]]), // remis na 2. miejscu, 3. pominięte
  table([['c', 1, 3000], ['d', 2, 2950], ['a', 3, 1500], ['b', null, null]]), // b: DNS
  table([['d', 1, 2100], ['a', 2, 2050], ['b', 3, 2040], ['c', 31, 900]]), // c poza punktami
]

function play(state: SeasonState, from: number, to: number): SeasonState {
  let next = state
  for (let index = from; index < to; index += 1) next = recordSeasonEvent(next, index, 'complete', EVENTS[index]!)
  return next
}

describe('P23 — puchar sezonowy: punkty za miejsca, nie suma metrów/punktów', () => {
  it('tabela punktów F03 §3.1 i remis konkursu', () => {
    expect(CUP_POINTS).toHaveLength(30)
    expect([1, 2, 3, 10, 30, 31].map(cupPointsForRank)).toEqual([100, 80, 60, 26, 1, 0])
    expect(cupPointsForRank(null)).toBe(0)
  })

  it('kontrolny sezon z restartem w połowie daje tę samą tabelę co sezon bez przerwy', () => {
    const uninterrupted = play(season(), 0, 4)
    const half = play(season(), 0, 2)
    expect(nextEventIndex(half)).toBe(2)
    // Restart: stan przechodzi przez JSON jak zapis IndexedDB, potem kontynuacja.
    const restored = JSON.parse(JSON.stringify(half)) as SeasonState
    const resumed = play(restored, 2, 4)
    expect(resumed).toEqual(uninterrupted)
    expect(resumed.status).toBe('complete')
    expect(nextEventIndex(resumed)).toBeNull()

    // a: 100+80+60+80=320; d: 50+50+80+100=280; b: 80+100+0+60=240; c: 60+80+100+0=240.
    // b i c mają po jednym 1., 2. i 3. miejscu → pełna równość, wspólne 3. miejsce (ADAPT).
    expect(seasonStandings(resumed).map((row) => [row.participantId, row.rank, row.value])).toEqual([
      ['a', 1, 320], ['d', 2, 280], ['b', 3, 240], ['c', 3, 240],
    ])
  })

  it('remis punktów rozstrzygają kolejno zwycięstwa, drugie miejsca itd.', () => {
    let state = season('cup', { ...TEST_CALENDAR, events: LIBRARY.slice(0, 2) })
    state = recordSeasonEvent(state, 0, 'complete', table([['x', 1, 1], ['y', 2, 1], ['z', 3, 1]]))
    state = recordSeasonEvent(state, 1, 'complete', table([['z', 1, 1], ['y', 2, 1], ['x', 5, 1]]))
    // x: 100+45=145, y: 80+80=160, z: 60+100=160 → y i z remis 160; z ma zwycięstwo → wyżej.
    const rows = seasonStandings(state)
    expect(rows.map((row) => [row.participantId, row.rank, row.value])).toEqual([['z', 1, 160], ['y', 2, 160], ['x', 3, 145]])
  })

  it('konkurs anulowany nie daje punktów; powtórzony zapis tego samego konkursu nic nie dubluje', () => {
    let state = season()
    state = recordSeasonEvent(state, 0, 'cancelled', EVENTS[0]!)
    expect(seasonStandings(state)).toEqual([])
    state = recordSeasonEvent(state, 1, 'complete', EVENTS[1]!)
    expect(recordSeasonEvent(state, 1, 'complete', EVENTS[0]!)).toBe(state)
    expect(() => recordSeasonEvent(state, 3, 'complete', EVENTS[3]!)).toThrow()
  })
})

describe('Q-FIS-13 — puchar kontra turniej czterech skoczni', () => {
  it('ten sam zestaw wyników daje inną kolejność: miejsca vs suma punktów skoków', () => {
    const cup = play(season('cup'), 0, 4)
    const tournament = play(season('four-hills'), 0, 4)
    expect(seasonStandings(cup)[0]?.participantId).toBe('a')
    // Sumy: a 2800+2600+1500+2050=8950; b 2700+2900+0+2040=7640; c 2600+2600+3000+900=9100; d 2500+2000+2950+2100=9550
    expect(seasonStandings(tournament).map((row) => [row.participantId, row.value])).toEqual([
      ['d', 9550], ['c', 9100], ['a', 8950], ['b', 7640],
    ])
  })
})

describe('P24 — własny kalendarz i klucz zestawu', () => {
  it('waliduje 1–40 konkursów i odrzuca nieistniejące lub nieaktualne skocznie', () => {
    expect(calendarProblems(TEST_CALENDAR, LIBRARY)).toEqual([])
    expect(calendarProblems({ ...TEST_CALENDAR, events: [] }, LIBRARY)).toHaveLength(1)
    const ghost = { ...TEST_CALENDAR, events: [{ hillId: 'h06-innsbruck', hillVersion: 'x' }, { hillId: 'h01', hillVersion: 'old' }] }
    expect(calendarProblems(ghost, LIBRARY)).toEqual([
      'konkurs 1: nieznana skocznia h06-innsbruck',
      'konkurs 2: nieaktualna wersja h01',
    ])
    expect(() => season('cup', ghost)).toThrow(/Kalendarz odrzucony/)
    const forty = Array.from({ length: 40 }, (_, index) => LIBRARY[index % 4]!)
    expect(calendarProblems({ ...TEST_CALENDAR, events: forty }, LIBRARY)).toEqual([])
    expect(calendarProblems({ ...TEST_CALENDAR, events: [...forty, LIBRARY[0]!] }, LIBRARY)).toHaveLength(1)
  })

  it('edycja: wstawianie do 40, usuwanie do 1, przesuwanie w granicach', () => {
    let events: readonly CalendarEvent[] = [LIBRARY[0]!]
    expect(removeCalendarEvent(events, 0)).toBe(events)
    for (let index = 0; index < 45; index += 1) events = insertCalendarEvent(events, events.length, LIBRARY[index % 4]!)
    expect(events).toHaveLength(40)
    const moved = moveCalendarEvent(LIBRARY, 0, 1)
    expect(moved.map((event) => event.hillId)).toEqual(['h02', 'h01', 'h03', 'h04'])
    expect(moveCalendarEvent(LIBRARY, 0, -1)).toBe(LIBRARY)
    expect(moveCalendarEvent(LIBRARY, 3, 1)).toBe(LIBRARY)
  })

  it('klucz rozróżnia kolejność, wersje, format i ustawienia; ten sam zestaw daje ten sam klucz', () => {
    const base = seasonSetKey('cup', TEST_CALENDAR, SETUP, VERSIONS)
    expect(seasonSetKey('cup', { ...TEST_CALENDAR, id: 'inna-nazwa', name: 'X' }, SETUP, VERSIONS)).toBe(base)
    expect(seasonSetKey('cup', TEST_CALENDAR, SETUP, { ...VERSIONS, physics: ['phys-b', 'phys-a'] })).toBe(base)
    const variants = [
      seasonSetKey('cup', { ...TEST_CALENDAR, events: moveCalendarEvent(LIBRARY, 0, 1) }, SETUP, VERSIONS),
      seasonSetKey('cup', { ...TEST_CALENDAR, events: [{ hillId: 'h01', hillVersion: 'v1-new' }, ...LIBRARY.slice(1)] }, SETUP, VERSIONS),
      seasonSetKey('cup', TEST_CALENDAR, SETUP, { ...VERSIONS, rules: 'modern-2027' }),
      seasonSetKey('cup', TEST_CALENDAR, SETUP, { ...VERSIONS, physics: ['phys-c'] }),
      seasonSetKey('cup', TEST_CALENDAR, { ...SETUP, profileCount: 2 }, VERSIONS),
      seasonSetKey('cup', TEST_CALENDAR, { ...SETUP, difficulty: 'hard' }, VERSIONS),
      seasonSetKey('four-hills', TEST_CALENDAR, SETUP, VERSIONS),
    ]
    expect(new Set([base, ...variants]).size).toBe(variants.length + 1)
    expect(base).toMatch(/^PUCHAR-4-[0-9A-F]{8}$/)
    // Deterministyczne warunki konkursu dla powtórzenia zestawu.
    expect(eventSeed(base, 2)).toBe(eventSeed(base, 2))
    expect(eventSeed(base, 2)).not.toBe(eventSeed(base, 3))
  })
})
