/**
 * PKG-014 / P23–P25 — puchar sezonowy, własny kalendarz i turniej KO.
 *
 * Jeden mały, czysty model dla dwóch formatów wielu konkursów:
 * - `cup`: punkty pucharowe za miejsca 1–30 (F03 §3.1), nie suma metrów;
 * - `four-hills`: suma punktów skoków wszystkich konkursów KO.
 * Moduł nie zna IndexedDB ani renderera. Wynik konkursu dopisuje się raz,
 * pod numerem konkursu, więc powtórzony zapis po wznowieniu niczego nie dubluje.
 */

import type { AiDifficulty, RankingEntry } from './competition'

export type SeasonFormat = 'cup' | 'four-hills'

/** F03 §3.1 — punkty za miejsca 1–30. */
export const CUP_POINTS: readonly number[] = [
  100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16,
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
]

export const CALENDAR_MIN_EVENTS = 1
export const CALENDAR_MAX_EVENTS = 40

export type CalendarEvent = {
  readonly hillId: string
  readonly hillVersion: string
}

export type SeasonCalendar = {
  readonly id: string
  readonly name: string
  readonly events: readonly CalendarEvent[]
}

export type SeasonSetup = {
  readonly profileCount: number
  readonly difficulty: AiDifficulty
}

/** Wersje, od których zależy porównywalność wyniku zestawu. */
export type SetVersions = {
  readonly rules: string
  readonly physics: readonly string[]
}

export type EventPlacement = {
  readonly participantId: string
  readonly name: string
  readonly rank: number | null
  readonly totalTenths: number | null
}

export type SeasonEventResult = {
  readonly eventIndex: number
  readonly status: 'complete' | 'cancelled'
  readonly placements: readonly EventPlacement[]
}

export type SeasonState = {
  readonly id: string
  readonly format: SeasonFormat
  readonly calendar: SeasonCalendar
  readonly setKey: string
  readonly setup: SeasonSetup
  readonly results: readonly SeasonEventResult[]
  readonly status: 'active' | 'complete' | 'abandoned'
  readonly createdAtMs: number
}

export type SeasonStanding = {
  readonly participantId: string
  readonly name: string
  readonly rank: number
  /** Cup: punkty pucharowe; four-hills: suma punktów skoków w dziesiątych. */
  readonly value: number
  readonly wins: number
}

export function cupPointsForRank(rank: number | null): number {
  if (rank === null || !Number.isInteger(rank) || rank < 1) return 0
  return CUP_POINTS[rank - 1] ?? 0
}

// --- Kalendarz i klucz zestawu --------------------------------------------------

/** Brak odwołań do nieistniejących lub nieaktualnych skoczni; 1–40 pozycji. */
export function calendarProblems(
  calendar: SeasonCalendar,
  library: readonly CalendarEvent[],
): readonly string[] {
  const problems: string[] = []
  if (calendar.events.length < CALENDAR_MIN_EVENTS || calendar.events.length > CALENDAR_MAX_EVENTS) {
    problems.push(`kalendarz ma ${calendar.events.length} konkursów (dozwolone 1–40)`)
  }
  calendar.events.forEach((event, index) => {
    const known = library.find((candidate) => candidate.hillId === event.hillId)
    if (!known) problems.push(`konkurs ${index + 1}: nieznana skocznia ${event.hillId}`)
    else if (known.hillVersion !== event.hillVersion) {
      problems.push(`konkurs ${index + 1}: nieaktualna wersja ${event.hillId}`)
    }
  })
  return problems
}

/** FNV-1a 32-bit — krótki, stabilny skrót kanonicznego opisu zestawu. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Klucz zestawu: format, kolejność konkursów z wersjami skoczni, wersje zasad
 * i fizyki oraz ustawienia obsady. Zmiana dowolnego z nich daje inny klucz.
 */
export function seasonSetKey(
  format: SeasonFormat,
  calendar: SeasonCalendar,
  setup: SeasonSetup,
  versions: SetVersions,
): string {
  const canonical = JSON.stringify({
    format,
    events: calendar.events.map((event) => `${event.hillId}@${event.hillVersion}`),
    rules: versions.rules,
    physics: [...new Set(versions.physics)].sort(),
    profiles: setup.profileCount,
    difficulty: setup.difficulty,
  })
  return `${format === 'cup' ? 'PUCHAR' : 'KO'}-${calendar.events.length}-${fnv1a(canonical).toUpperCase()}`
}

/** Deterministyczny seed konkursu: ten sam zestaw daje te same warunki. */
export function eventSeed(setKey: string, eventIndex: number): number {
  return Number.parseInt(fnv1a(`${setKey}#${eventIndex}`), 16) >>> 0
}

export function insertCalendarEvent(
  events: readonly CalendarEvent[],
  index: number,
  event: CalendarEvent,
): readonly CalendarEvent[] {
  if (events.length >= CALENDAR_MAX_EVENTS) return events
  const at = Math.max(0, Math.min(events.length, index))
  return [...events.slice(0, at), event, ...events.slice(at)]
}

export function removeCalendarEvent(events: readonly CalendarEvent[], index: number): readonly CalendarEvent[] {
  if (events.length <= CALENDAR_MIN_EVENTS || index < 0 || index >= events.length) return events
  return events.filter((_, candidate) => candidate !== index)
}

export function moveCalendarEvent(
  events: readonly CalendarEvent[],
  index: number,
  delta: -1 | 1,
): readonly CalendarEvent[] {
  const target = index + delta
  if (index < 0 || index >= events.length || target < 0 || target >= events.length) return events
  const next = [...events]
  const [moved] = next.splice(index, 1)
  if (moved) next.splice(target, 0, moved)
  return next
}

export function replaceCalendarEvent(
  events: readonly CalendarEvent[],
  index: number,
  event: CalendarEvent,
): readonly CalendarEvent[] {
  if (index < 0 || index >= events.length) return events
  return events.map((current, candidate) => (candidate === index ? event : current))
}

// --- Sezon -------------------------------------------------------------------------

export function createSeason(input: {
  readonly id: string
  readonly format: SeasonFormat
  readonly calendar: SeasonCalendar
  readonly setup: SeasonSetup
  readonly versions: SetVersions
  readonly library: readonly CalendarEvent[]
  readonly nowMs: number
}): SeasonState {
  const problems = calendarProblems(input.calendar, input.library)
  if (problems.length > 0) throw new Error(`Kalendarz odrzucony: ${problems.join('; ')}.`)
  return {
    id: input.id,
    format: input.format,
    calendar: input.calendar,
    setKey: seasonSetKey(input.format, input.calendar, input.setup, input.versions),
    setup: input.setup,
    results: [],
    status: 'active',
    createdAtMs: input.nowMs,
  }
}

/** Numer następnego konkursu do rozegrania albo `null` po zakończeniu sezonu. */
export function nextEventIndex(season: SeasonState): number | null {
  if (season.status !== 'active') return null
  return season.results.length < season.calendar.events.length ? season.results.length : null
}

export function seasonCompetitionId(season: SeasonState, eventIndex: number): string {
  return `${season.id}-e${eventIndex + 1}`
}

/**
 * Dopisuje wynik konkursu `eventIndex`. Powtórzenie tego samego numeru
 * (np. ponowiony zapis) zwraca stan bez zmian; inny numer niż następny jest błędem.
 */
export function recordSeasonEvent(
  season: SeasonState,
  eventIndex: number,
  status: SeasonEventResult['status'],
  standings: readonly RankingEntry[],
): SeasonState {
  if (season.results.some((result) => result.eventIndex === eventIndex)) return season
  if (nextEventIndex(season) !== eventIndex) {
    throw new Error(`Oczekiwano konkursu ${String(nextEventIndex(season))}, otrzymano ${eventIndex}.`)
  }
  const placements: EventPlacement[] = status === 'cancelled'
    ? []
    : standings.map((entry) => ({
        participantId: entry.participantId,
        name: entry.name,
        rank: entry.rank,
        totalTenths: entry.totalTenths,
      }))
  const results = [...season.results, { eventIndex, status, placements }]
  return {
    ...season,
    results,
    status: results.length === season.calendar.events.length ? 'complete' : 'active',
  }
}

type Tally = { participantId: string; name: string; value: number; placeCounts: number[] }

function tallies(season: SeasonState): Tally[] {
  const byId = new Map<string, Tally>()
  for (const result of season.results) {
    for (const placement of result.placements) {
      const tally = byId.get(placement.participantId)
        ?? { participantId: placement.participantId, name: placement.name, value: 0, placeCounts: [] }
      byId.set(placement.participantId, tally)
      if (season.format === 'cup') {
        tally.value += cupPointsForRank(placement.rank)
        // Liczymy wyłącznie miejsca punktowane — to one rozstrzygają remis pucharu.
        if (placement.rank !== null && placement.rank <= CUP_POINTS.length) {
          tally.placeCounts[placement.rank - 1] = (tally.placeCounts[placement.rank - 1] ?? 0) + 1
        }
      } else {
        tally.value += placement.totalTenths ?? 0
      }
    }
  }
  return [...byId.values()]
}

/**
 * Cup: F03 §3.1.3 — remis punktów rozstrzygają kolejno liczby zwycięstw,
 * drugich miejsc itd.; przy pełnej równości zawodnicy dzielą miejsce (ADAPT).
 * Four-hills: suma punktów skoków; równe sumy dzielą miejsce.
 * Tylko zawodnicy z dodatnim wynikiem trafiają do tabeli.
 */
export function seasonStandings(season: SeasonState): readonly SeasonStanding[] {
  const compareCounts = (left: Tally, right: Tally): number => {
    if (season.format !== 'cup') return 0
    for (let place = 0; place < CUP_POINTS.length; place += 1) {
      const difference = (right.placeCounts[place] ?? 0) - (left.placeCounts[place] ?? 0)
      if (difference !== 0) return difference
    }
    return 0
  }
  const ordered = tallies(season)
    .filter((tally) => tally.value > 0)
    .sort((left, right) =>
      right.value - left.value || compareCounts(left, right) || left.name.localeCompare(right.name, 'pl'),
    )
  const standings: SeasonStanding[] = []
  ordered.forEach((tally, index) => {
    const previous = ordered[index - 1]
    const sharesPlace = previous !== undefined && previous.value === tally.value && compareCounts(previous, tally) === 0
    standings.push({
      participantId: tally.participantId,
      name: tally.name,
      rank: sharesPlace ? standings[index - 1]!.rank : index + 1,
      value: tally.value,
      wins: tally.placeCounts[0] ?? 0,
    })
  })
  return standings
}

/** Punkty/suma jednego konkursu dla wiersza tabeli (np. „ostatni konkurs”). */
export function eventValue(season: SeasonState, placement: EventPlacement): number {
  return season.format === 'cup' ? cupPointsForRank(placement.rank) : placement.totalTenths ?? 0
}
