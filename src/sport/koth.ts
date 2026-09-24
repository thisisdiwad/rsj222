/**
 * PKG-015 / P28 — King of the Hill: jawnie rozrywkowa eliminacja 2–10
 * uczestników (ludzie i/lub boty) z nowoczesną punktacją skoku.
 *
 * Zasady (ADAPT, GAMEPLAY_SPEC §6):
 * - każda seria eliminacyjna: skaczą wszyscy pozostali, najgorsza nota odpada;
 *   status administracyjny (DNS/NPS/DSQ) jest gorszy od każdej noty;
 * - rezygnacja (withdrawn) to wyjście z gry: odpada od razu i zastępuje
 *   eliminację tej serii;
 * - remis ostatnich → jedna dogrywka tylko tych osób; ponowny remis
 *   ostatnich w dogrywce eliminuje całą remisową grupę;
 * - remis wszystkich pozostałych w serii eliminacyjnej → wspólne zwycięstwo.
 * Każde rozstrzygnięcie usuwa ≥1 osobę albo kończy turniej, a dogrywka
 * zawsze usuwa ≥1 — liczba serii jest ograniczona przez 2·(n−1).
 */

import type { CompetitionRound } from './competition'

export const KOTH_MIN_PARTICIPANTS = 2
export const KOTH_MAX_PARTICIPANTS = 10

export type KothRoundKind = 'elimination' | 'playoff'

export type KothElimination = {
  readonly roundNumber: number
  readonly ids: readonly string[]
  readonly reason: 'worst' | 'playoff' | 'withdrawn'
}

export type KothState = {
  /** Rodzaj każdej rozegranej/aktywnej serii (indeks = numer serii − 1). */
  readonly kinds: readonly KothRoundKind[]
  readonly remaining: readonly string[]
  readonly eliminations: readonly KothElimination[]
  /** Po zakończeniu: zwycięzca albo wspólni zwycięzcy. */
  readonly winners: readonly string[] | null
}

export function kothRoundId(roundNumber: number): `koth-${number}` {
  return `koth-${roundNumber}`
}

export function createKothState(participantIds: readonly string[]): KothState {
  if (participantIds.length < KOTH_MIN_PARTICIPANTS || participantIds.length > KOTH_MAX_PARTICIPANTS) {
    throw new Error(`King of the Hill wymaga ${KOTH_MIN_PARTICIPANTS}–${KOTH_MAX_PARTICIPANTS} uczestników, otrzymano ${participantIds.length}.`)
  }
  return { kinds: ['elimination'], remaining: [...participantIds], eliminations: [], winners: null }
}

/** Nota serii; null = status administracyjny (gorszy od każdej noty). */
function roundValue(round: CompetitionRound, participantId: string): number | null {
  const attempt = round.attempts[participantId]
  return attempt?.kind === 'score' ? attempt.totalTenths : null
}

function worstGroup(round: CompetitionRound, ids: readonly string[]): readonly string[] {
  const values = ids.map((id) => roundValue(round, id))
  const hasAdministrative = values.some((value) => value === null)
  if (hasAdministrative) return ids.filter((_, index) => values[index] === null)
  const minimum = Math.min(...(values as number[]))
  return ids.filter((_, index) => values[index] === minimum)
}

/**
 * Lista startowa następnej serii eliminacyjnej: najsłabsi z ostatniej serii
 * eliminacyjnej skaczą pierwsi, lider ostatni (ADAPT); remis — dawna kolejność.
 */
function nextEliminationOrder(lastElimination: CompetitionRound, remaining: readonly string[]): readonly string[] {
  const index = new Map(lastElimination.startOrder.map((id, position) => [id, position]))
  return [...remaining].sort((left, right) => {
    const a = roundValue(lastElimination, left)
    const b = roundValue(lastElimination, right)
    if (a === null && b !== null) return -1
    if (b === null && a !== null) return 1
    return (a ?? 0) - (b ?? 0) || (index.get(left) ?? 0) - (index.get(right) ?? 0)
  })
}

export type KothResolution = {
  readonly koth: KothState
  /** Lista startowa kolejnej serii albo null, gdy turniej się zakończył. */
  readonly nextStartOrder: readonly string[] | null
}

/** Rozstrzyga zamkniętą serię `rounds[rounds.length − 1]`. */
export function resolveKothRound(koth: KothState, rounds: readonly CompetitionRound[]): KothResolution {
  const round = rounds.at(-1)
  if (!round) throw new Error('Brak serii King of the Hill do rozstrzygnięcia.')
  const roundNumber = rounds.length
  const kind = koth.kinds[roundNumber - 1] ?? 'elimination'
  const jumpers = round.startOrder

  const withdrawn = jumpers.filter((id) => {
    const attempt = round.attempts[id]
    return attempt?.kind === 'administrative' && attempt.status === 'withdrawn'
  })
  let eliminated: readonly string[]
  let reason: KothElimination['reason']
  if (withdrawn.length > 0) {
    eliminated = withdrawn
    reason = 'withdrawn'
  } else {
    const worst = worstGroup(round, jumpers)
    if (kind === 'elimination' && worst.length === koth.remaining.length) {
      // Remis wszystkich pozostałych: wspólne zwycięstwo (ADAPT).
      return { koth: { ...koth, winners: [...koth.remaining] }, nextStartOrder: null }
    }
    if (kind === 'elimination' && worst.length > 1) {
      return { koth: { ...koth, kinds: [...koth.kinds, 'playoff'] }, nextStartOrder: [...worst] }
    }
    eliminated = worst
    reason = kind === 'playoff' ? 'playoff' : 'worst'
  }

  const out = new Set(eliminated)
  const remaining = koth.remaining.filter((id) => !out.has(id))
  const eliminations = [...koth.eliminations, { roundNumber, ids: [...eliminated], reason }]
  if (remaining.length <= 1) {
    return { koth: { ...koth, remaining, eliminations, winners: remaining }, nextStartOrder: null }
  }
  const lastEliminationIndex = koth.kinds.lastIndexOf('elimination')
  const base = rounds[lastEliminationIndex] ?? round
  return {
    koth: { ...koth, remaining, eliminations, kinds: [...koth.kinds, 'elimination'] },
    nextStartOrder: nextEliminationOrder(base, remaining),
  }
}

export type KothStandingRow = {
  readonly participantId: string
  readonly rank: number | null
  readonly state: 'winner' | 'in' | 'out'
  readonly eliminatedInRound: number | null
}

/**
 * Zwycięzcy na 1. miejscu, potem grupy w odwrotnej kolejności odpadania
 * (wspólne miejsce w grupie). W trakcie turnieju pozostali nie mają miejsca.
 */
export function kothStandingRows(koth: KothState): readonly KothStandingRow[] {
  const rows: KothStandingRow[] = []
  let placed = 0
  if (koth.winners) {
    for (const id of koth.winners) rows.push({ participantId: id, rank: 1, state: 'winner', eliminatedInRound: null })
    placed = koth.winners.length
  } else {
    for (const id of koth.remaining) rows.push({ participantId: id, rank: null, state: 'in', eliminatedInRound: null })
    placed = koth.remaining.length
  }
  for (const elimination of [...koth.eliminations].reverse()) {
    const rank = placed + 1
    for (const id of elimination.ids) rows.push({ participantId: id, rank, state: 'out', eliminatedInRound: elimination.roundNumber })
    placed += elimination.ids.length
  }
  return rows
}
