/**
 * PKG-005 / P16 — mały reducer jednego standardowego konkursu.
 * PKG-014 / P25 — ten sam przebieg w formacie KO (pary i najlepsi przegrani).
 * PKG-015 / P26–P28 — drużyny (grupy, finał 8), Super Team (wszyscy→12→8)
 * i King of the Hill (eliminacje); logika formatów w `team.ts` i `koth.ts`.
 *
 * Moduł nie zna DOM, renderera ani zegara. Każdy slot serii jest rozliczany
 * najwyżej raz, a statusy administracyjne nigdy nie udają wyniku zero.
 */

import {
  createKoBracket,
  koFinalStartOrder,
  koFirstRoundStartOrder,
  koQualificationRanking,
  resolveKoFirstRound,
  type KoBracket,
} from './ko'
import {
  groupedStartOrder,
  regroupsBeforeEachGroup,
  reorderRemainingGroups,
  reverseStandingTeamOrder,
  teamAdvanceLimit,
  teamAdvancers,
  validateTeams,
  type CompetitionTeam,
  type TeamFormat,
} from './team'
import { createKothState, kothRoundId, resolveKothRound, type KothState } from './koth'

export type CompetitionRoundId = 'qualification' | 'first' | 'second' | 'final' | `koth-${number}`
export type CompetitionStatus = 'active' | 'complete' | 'cancelled'
export type RoundStatus = 'active' | 'complete' | 'cancelled'
export type AdministrativeStatus = 'dns' | 'nps' | 'dsq' | 'withdrawn'
export type ScoredStatus = 'landed' | 'fall'
export type AiDifficulty = 'easy' | 'normal' | 'hard'
/**
 * `standard`: 50/40→30; `ko`: dokładnie 50, 25 par + 5 najlepszych przegranych;
 * `team`: 4 w drużynie, finał 8; `superteam`: 2 w drużynie, wszyscy→12→8;
 * `koth`: 2–10 uczestników, najgorszy odpada.
 */
export type CompetitionFormat = 'standard' | 'ko' | TeamFormat | 'koth'

export type EntrantController =
  | { readonly kind: 'ai'; readonly difficulty: AiDifficulty }
  | { readonly kind: 'human'; readonly profileId: string }

export type CompetitionEntrant = {
  readonly id: string
  readonly name: string
  readonly startNumber: number
  readonly controller: EntrantController
}

export type ScoreComponents = {
  readonly distance: number
  readonly style: number
  readonly wind: number
  readonly juryGate: number
  readonly coachGate: number
}

export type ScoredAttempt = {
  readonly kind: 'score'
  readonly resultId: string
  readonly participantId: string
  readonly status: ScoredStatus
  readonly distanceHalfMeters: number
  readonly totalTenths: number
  readonly componentTenths: ScoreComponents
  readonly meterValueTenths: number
}

export type AdministrativeAttempt = {
  readonly kind: 'administrative'
  readonly resultId: string
  readonly participantId: string
  readonly status: AdministrativeStatus
  readonly reason: string
}

export type CompetitionAttempt = ScoredAttempt | AdministrativeAttempt

export type CompetitionRound = {
  readonly id: CompetitionRoundId
  readonly status: RoundStatus
  readonly startOrder: readonly string[]
  readonly attempts: Readonly<Record<string, CompetitionAttempt>>
  readonly discardedAttemptCount: number
}

export type CompetitionEvent = {
  readonly sequence: number
  readonly type:
    | 'competition-created'
    | 'attempt-recorded'
    | 'round-completed'
    | 'round-cancelled'
    | 'jury-gate-changed'
    | 'withdrawal-requested'
    | 'withdrawal-cancelled'
    | 'withdrawal-confirmed'
  readonly detail: string
}

export type CompetitionState = {
  readonly id: string
  readonly status: CompetitionStatus
  readonly hillClass: 'normal' | 'large' | 'flying'
  readonly entrants: readonly CompetitionEntrant[]
  readonly rounds: readonly CompetitionRound[]
  readonly currentRoundIndex: number
  readonly nextStartIndex: number
  readonly juryGateNumber: number
  readonly withdrawalRequestParticipantId: string | null
  /**
   * P42 runda 11: ukończona seria czeka na jawne potwierdzenie planszy wyników.
   * Ustawiane przy zamknięciu serii, czyszczone po Enter — dzięki temu reload
   * wznawia grę na planszy wyników serii, a nie na pierwszym skoku następnej.
   */
  readonly pendingRoundSummary: CompetitionRoundId | null
  readonly seed: number
  readonly versions: {
    readonly rules: string
    readonly hill: string
  }
  readonly events: readonly CompetitionEvent[]
  /** Brak pola w starszych zapisach oznacza konkurs standardowy. */
  readonly format?: CompetitionFormat
  /** Drabinka KO: ustalana po kwalifikacjach, rozstrzygana po I serii. */
  readonly ko?: KoBracket | null
  /** Drużyny (team/superteam) w kolejności startu I serii. */
  readonly teams?: readonly CompetitionTeam[]
  /** Stan eliminacji King of the Hill. */
  readonly koth?: KothState
}

export type RankingEntry = {
  readonly participantId: string
  readonly name: string
  readonly rank: number | null
  readonly totalTenths: number | null
  readonly status: ScoredStatus | AdministrativeStatus | 'waiting'
}

export type RecordAttemptResult = {
  readonly state: CompetitionState
  readonly roundCompleted: CompetitionRoundId | null
}

function event(state: CompetitionState, type: CompetitionEvent['type'], detail: string): CompetitionEvent {
  return { sequence: state.events.length, type, detail }
}

function requireEntrants(entrants: readonly CompetitionEntrant[], expectedCount: number | null = 75): void {
  if (expectedCount !== null && entrants.length !== expectedCount) {
    throw new Error(`Standardowy konkurs wymaga ${expectedCount} miejsc, otrzymano ${entrants.length}.`)
  }
  const ids = new Set<string>()
  const numbers = new Set<number>()
  for (const entrant of entrants) {
    if (!entrant.id || !entrant.name) throw new Error('Każdy uczestnik wymaga identyfikatora i nazwy.')
    if (ids.has(entrant.id)) throw new Error(`Duplikat identyfikatora uczestnika: ${entrant.id}.`)
    if (!Number.isInteger(entrant.startNumber) || entrant.startNumber < 1 || numbers.has(entrant.startNumber)) {
      throw new Error(`Nieprawidłowy lub powtórzony numer startowy: ${entrant.startNumber}.`)
    }
    ids.add(entrant.id)
    numbers.add(entrant.startNumber)
  }
}

function activeRound(state: CompetitionState): CompetitionRound {
  const round = state.rounds[state.currentRoundIndex]
  if (!round) throw new Error('Konkurs nie ma aktywnej serii.')
  return round
}

export function currentRound(state: CompetitionState): CompetitionRound {
  return activeRound(state)
}

export function currentParticipantId(state: CompetitionState): string | null {
  if (state.status !== 'active') return null
  return activeRound(state).startOrder[state.nextStartIndex] ?? null
}

export function createStandardCompetition(input: {
  readonly id: string
  readonly entrants: readonly CompetitionEntrant[]
  readonly hillClass: CompetitionState['hillClass']
  readonly juryGateNumber: number
  readonly seed: number
  readonly rulesVersion: string
  readonly hillVersion: string
  readonly format?: CompetitionFormat
}): CompetitionState {
  requireEntrants(input.entrants)
  if (!input.id) throw new Error('Konkurs wymaga identyfikatora.')
  if (!Number.isInteger(input.juryGateNumber) || input.juryGateNumber < 1) {
    throw new Error('Numer belki jury musi być dodatnią liczbą całkowitą.')
  }
  const ordered = [...input.entrants].sort((left, right) => left.startNumber - right.startNumber)
  const initial: CompetitionState = {
    id: input.id,
    status: 'active',
    hillClass: input.hillClass,
    entrants: ordered,
    rounds: [{
      id: 'qualification',
      status: 'active',
      startOrder: ordered.map((entrant) => entrant.id),
      attempts: {},
      discardedAttemptCount: 0,
    }],
    currentRoundIndex: 0,
    nextStartIndex: 0,
    juryGateNumber: input.juryGateNumber,
    withdrawalRequestParticipantId: null,
    pendingRoundSummary: null,
    seed: input.seed >>> 0,
    versions: { rules: input.rulesVersion, hill: input.hillVersion },
    events: [],
    ...(input.format === 'ko' ? { format: 'ko' as const, ko: null } : {}),
  }
  const formatLabel = input.format === 'ko' ? ', system KO' : ''
  return {
    ...initial,
    events: [event(initial, 'competition-created', `75 miejsc${formatLabel}, belka jury ${input.juryGateNumber}`)],
  }
}

type BaseCompetitionInput = {
  readonly id: string
  readonly hillClass: CompetitionState['hillClass']
  readonly juryGateNumber: number
  readonly seed: number
  readonly rulesVersion: string
  readonly hillVersion: string
}

function baseState(
  input: BaseCompetitionInput,
  entrants: readonly CompetitionEntrant[],
  firstRound: { readonly id: CompetitionRoundId; readonly startOrder: readonly string[] },
  extra: Partial<CompetitionState>,
  description: string,
): CompetitionState {
  if (!input.id) throw new Error('Konkurs wymaga identyfikatora.')
  if (!Number.isInteger(input.juryGateNumber) || input.juryGateNumber < 1) {
    throw new Error('Numer belki jury musi być dodatnią liczbą całkowitą.')
  }
  const initial: CompetitionState = {
    id: input.id,
    status: 'active',
    hillClass: input.hillClass,
    entrants: [...entrants].sort((left, right) => left.startNumber - right.startNumber),
    rounds: [{ id: firstRound.id, status: 'active', startOrder: firstRound.startOrder, attempts: {}, discardedAttemptCount: 0 }],
    currentRoundIndex: 0,
    nextStartIndex: 0,
    juryGateNumber: input.juryGateNumber,
    withdrawalRequestParticipantId: null,
    pendingRoundSummary: null,
    seed: input.seed >>> 0,
    versions: { rules: input.rulesVersion, hill: input.hillVersion },
    events: [],
    ...extra,
  }
  return { ...initial, events: [event(initial, 'competition-created', `${description}, belka jury ${input.juryGateNumber}`)] }
}

/**
 * P26/P27 — konkurs drużynowy albo Super Team. Kolejność drużyn w I serii
 * to kolejność listy `teams` (ADAPT F03 §3.2.3: bez rankingu narodów gra
 * przyjmuje stałą, jawną kolejność konfiguracji).
 */
export function createTeamCompetition(input: BaseCompetitionInput & {
  readonly format: TeamFormat
  readonly entrants: readonly CompetitionEntrant[]
  readonly teams: readonly CompetitionTeam[]
}): CompetitionState {
  requireEntrants(input.entrants, null)
  validateTeams(input.format, input.teams, input.entrants)
  const label = input.format === 'team' ? 'drużynowy' : 'Super Team'
  return baseState(
    input,
    input.entrants,
    { id: 'first', startOrder: groupedStartOrder(input.teams) },
    { format: input.format, teams: input.teams },
    `${label}: ${input.teams.length} drużyn`,
  )
}

/** P28 — King of the Hill: I seria w kolejności numerów startowych. */
export function createKothCompetition(input: BaseCompetitionInput & {
  readonly entrants: readonly CompetitionEntrant[]
}): CompetitionState {
  requireEntrants(input.entrants, null)
  const ordered = [...input.entrants].sort((left, right) => left.startNumber - right.startNumber).map((entrant) => entrant.id)
  return baseState(
    input,
    input.entrants,
    { id: kothRoundId(1), startOrder: ordered },
    { format: 'koth', koth: createKothState(ordered) },
    `King of the Hill: ${ordered.length} uczestników`,
  )
}

function validateAttempt(attempt: CompetitionAttempt): void {
  if (!attempt.resultId || !attempt.participantId) throw new Error('Próba wymaga resultId i participantId.')
  if (attempt.kind === 'administrative') {
    if (!attempt.reason) throw new Error('Status administracyjny wymaga przyczyny.')
    return
  }
  if (!Number.isInteger(attempt.distanceHalfMeters) || attempt.distanceHalfMeters < 0) {
    throw new Error('Odległość musi być nieujemną liczbą połówek metra.')
  }
  if (!Number.isInteger(attempt.totalTenths) || attempt.totalTenths < 0) {
    throw new Error('Wynik musi być nieujemną liczbą dziesiątych punktu.')
  }
  if (!Number.isInteger(attempt.meterValueTenths) || attempt.meterValueTenths <= 0) {
    throw new Error('Współczynnik punktów za metr musi być dodatnią liczbą całkowitą.')
  }
  for (const value of Object.values(attempt.componentTenths)) {
    if (!Number.isInteger(value)) throw new Error('Składowe wyniku muszą być zapisane w dziesiątych punktu.')
  }
}

function entrantName(state: CompetitionState, participantId: string): string {
  return state.entrants.find((entrant) => entrant.id === participantId)?.name ?? participantId
}

function scoredAttempts(round: CompetitionRound): ScoredAttempt[] {
  return Object.values(round.attempts).filter((attempt): attempt is ScoredAttempt => attempt.kind === 'score')
}

function roundScoreOrder(round: CompetitionRound): ScoredAttempt[] {
  const startIndex = new Map(round.startOrder.map((participantId, index) => [participantId, index]))
  return scoredAttempts(round).sort((left, right) =>
    right.totalTenths - left.totalTenths
      || (startIndex.get(left.participantId) ?? 0) - (startIndex.get(right.participantId) ?? 0),
  )
}

/**
 * Odległość skompensowana jako dokładny licznik wspólnego ułamka:
 *
 *   numerator / (2 * meterValueTenths)
 *   = distanceHalfMeters / 2 + compensationTenths / meterValueTenths
 *
 * Dzięki temu próg 95% porównujemy przez mnożenie całkowite i nie
 * wprowadzamy nieudokumentowanego zaokrąglenia do 0,5 m ani tekstu HUD.
 */
export function compensatedDistanceNumerator(attempt: ScoredAttempt): number {
  const compensationTenths = attempt.componentTenths.wind
    + attempt.componentTenths.juryGate
    + attempt.componentTenths.coachGate
  return attempt.distanceHalfMeters * attempt.meterValueTenths + compensationTenths * 2
}

/** ICR 422.14 / WC Men 2026/27 4.3.1: dokładnie ≥95%, w grupie awansującej. */
export function qualifiesByLongFall(
  candidate: ScoredAttempt,
  attempts: readonly ScoredAttempt[],
  qualifyingGroupParticipantIds: ReadonlySet<string>,
): boolean {
  if (candidate.status !== 'fall' || !qualifyingGroupParticipantIds.has(candidate.participantId)) return false
  const group = attempts.filter((attempt) => qualifyingGroupParticipantIds.has(attempt.participantId))
  if (group.length === 0) return false
  const longest = Math.max(...group.map(compensatedDistanceNumerator))
  return compensatedDistanceNumerator(candidate) * 100 >= longest * 95
}

/** Reguła 95% liczona wobec całej bieżącej serii (ICR 422.14): grupa to pełny startOrder. */
export function advancersFromRound(round: CompetitionRound, limit: number): readonly string[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Limit awansu musi być dodatni.')
  const ordered = roundScoreOrder(round)
  if (ordered.length === 0) return []
  const boundary = ordered[Math.min(limit, ordered.length) - 1]
  if (!boundary) return []
  const selected = new Set(
    ordered.filter((attempt) => attempt.totalTenths >= boundary.totalTenths).map((attempt) => attempt.participantId),
  )
  const group = new Set(round.startOrder)
  for (const attempt of ordered) {
    if (qualifiesByLongFall(attempt, ordered, group)) selected.add(attempt.participantId)
  }
  return ordered.filter((attempt) => selected.has(attempt.participantId)).map((attempt) => attempt.participantId)
}

/** Najsłabszy wynik rusza pierwszy; przy remisie wyższy poprzedni numer rusza wcześniej. */
export function reverseResultStartOrder(round: CompetitionRound, selectedIds: readonly string[]): readonly string[] {
  const selected = new Set(selectedIds)
  const startIndex = new Map(round.startOrder.map((participantId, index) => [participantId, index]))
  return scoredAttempts(round)
    .filter((attempt) => selected.has(attempt.participantId))
    .sort((left, right) =>
      left.totalTenths - right.totalTenths
        || (startIndex.get(right.participantId) ?? 0) - (startIndex.get(left.participantId) ?? 0),
    )
    .map((attempt) => attempt.participantId)
}

function replaceRound(state: CompetitionState, round: CompetitionRound): CompetitionState {
  const rounds = [...state.rounds]
  rounds[state.currentRoundIndex] = round
  return { ...state, rounds }
}

function finishRound(state: CompetitionState): RecordAttemptResult {
  const round = activeRound(state)
  const completed: CompetitionRound = { ...round, status: 'complete' }
  let nextState = replaceRound(state, completed)
  nextState = {
    ...nextState,
    pendingRoundSummary: round.id,
    events: [...nextState.events, event(nextState, 'round-completed', round.id)],
  }

  if (round.id === 'final') {
    return { state: { ...nextState, status: 'complete' }, roundCompleted: round.id }
  }
  if (state.format === 'ko') return openNextKoRound(nextState, completed)
  if (state.format === 'team' || state.format === 'superteam') return openNextTeamRound(nextState, completed, state.format)
  if (state.format === 'koth') return openNextKothRound(nextState)

  const limit = round.id === 'qualification'
    ? (state.hillClass === 'flying' ? 40 : 50)
    : 30
  const selected = advancersFromRound(completed, limit)
  const startOrder = reverseResultStartOrder(completed, selected)
  // Brak awansujących (np. same statusy administracyjne): nie tworzymy pustej
  // aktywnej serii — event kończy się terminalnie na ukończonej rundzie.
  if (startOrder.length === 0) {
    return { state: { ...nextState, status: 'complete' }, roundCompleted: round.id }
  }
  const nextId: CompetitionRoundId = round.id === 'qualification' ? 'first' : 'final'
  const nextRound: CompetitionRound = {
    id: nextId,
    status: 'active',
    startOrder,
    attempts: {},
    discardedAttemptCount: 0,
  }
  return {
    state: {
      ...nextState,
      rounds: [...nextState.rounds, nextRound],
      currentRoundIndex: nextState.currentRoundIndex + 1,
      nextStartIndex: 0,
    },
    roundCompleted: round.id,
  }
}

function openNextRound(
  state: CompetitionState,
  completed: CompetitionRound,
  startOrder: readonly string[],
  ko: KoBracket | null,
  nextId: CompetitionRoundId = completed.id === 'qualification' ? 'first' : 'final',
): RecordAttemptResult {
  const withBracket = ko ? { ...state, ko } : state
  if (startOrder.length === 0) {
    return { state: { ...withBracket, status: 'complete' }, roundCompleted: completed.id }
  }
  const nextRound: CompetitionRound = {
    id: nextId,
    status: 'active',
    startOrder,
    attempts: {},
    discardedAttemptCount: 0,
  }
  return {
    state: {
      ...withBracket,
      rounds: [...withBracket.rounds, nextRound],
      currentRoundIndex: withBracket.currentRoundIndex + 1,
      nextStartIndex: 0,
    },
    roundCompleted: completed.id,
  }
}

/** P25 — kwalifikacje tworzą pary, I seria wyłania 25 zwycięzców + najlepszych przegranych. */
function openNextKoRound(state: CompetitionState, completed: CompetitionRound): RecordAttemptResult {
  if (completed.id === 'qualification') {
    const startNumbers = new Map(state.entrants.map((entrant) => [entrant.id, entrant.startNumber]))
    const bracket = createKoBracket(
      koQualificationRanking(completed.attempts, (participantId) => startNumbers.get(participantId) ?? 0),
    )
    return openNextRound(state, completed, koFirstRoundStartOrder(bracket), bracket)
  }
  if (!state.ko) throw new Error('Seria KO bez drabinki z kwalifikacji.')
  const ordered = roundScoreOrder(completed)
  const group = new Set(completed.startOrder)
  const longFall = new Set(
    ordered.filter((attempt) => qualifiesByLongFall(attempt, ordered, group)).map((attempt) => attempt.participantId),
  )
  const resolved = resolveKoFirstRound(state.ko, completed.attempts, longFall)
  return openNextRound(state, completed, koFinalStartOrder(resolved, completed.attempts), resolved)
}

/** P26/P27 — awans 8 (drużyny) albo 12→8 (Super Team); finał ustawia grupy wg klasyfikacji. */
function openNextTeamRound(state: CompetitionState, completed: CompetitionRound, format: TeamFormat): RecordAttemptResult {
  const limit = teamAdvanceLimit(format, completed.id)
  if (limit === null) return { state: { ...state, status: 'complete' }, roundCompleted: completed.id }
  const advancing = teamAdvancers(state, completed, limit)
  const nextId: CompetitionRoundId = format === 'superteam' && completed.id === 'first' ? 'second' : 'final'
  const order = regroupsBeforeEachGroup(nextId) ? reverseStandingTeamOrder(state, advancing) : advancing
  return openNextRound(state, completed, groupedStartOrder(order), null, nextId)
}

/** P28 — rozstrzygnięcie serii King of the Hill i ewentualna następna seria/dogrywka. */
function openNextKothRound(state: CompetitionState): RecordAttemptResult {
  if (!state.koth) throw new Error('King of the Hill bez stanu eliminacji.')
  const completed = activeRound(state)
  const resolution = resolveKothRound(state.koth, state.rounds)
  const withKoth = { ...state, koth: resolution.koth }
  if (!resolution.nextStartOrder) {
    return { state: { ...withKoth, status: 'complete' }, roundCompleted: completed.id }
  }
  return openNextRound(withKoth, completed, resolution.nextStartOrder, null, kothRoundId(state.rounds.length + 1))
}

export function recordAttempt(state: CompetitionState, attempt: CompetitionAttempt): RecordAttemptResult {
  if (state.status !== 'active') throw new Error('Nie można dopisać próby do zakończonego konkursu.')
  validateAttempt(attempt)
  const round = activeRound(state)
  const expected = currentParticipantId(state)
  if (attempt.participantId !== expected) {
    throw new Error(`Oczekiwano uczestnika ${expected ?? '—'}, otrzymano ${attempt.participantId}.`)
  }
  if (round.attempts[attempt.participantId]) throw new Error(`Slot ${attempt.participantId} jest już rozliczony.`)
  if (state.rounds.some((candidate) => Object.values(candidate.attempts).some((item) => item.resultId === attempt.resultId))) {
    throw new Error(`Duplikat resultId: ${attempt.resultId}.`)
  }

  const updatedRound: CompetitionRound = {
    ...round,
    attempts: { ...round.attempts, [attempt.participantId]: attempt },
  }
  let nextState = replaceRound(state, updatedRound)
  nextState = {
    ...nextState,
    nextStartIndex: state.nextStartIndex + 1,
    withdrawalRequestParticipantId: null,
    events: [
      ...nextState.events,
      event(nextState, 'attempt-recorded', `${round.id}: ${entrantName(state, attempt.participantId)} — ${attempt.status}`),
    ],
  }
  if (nextState.nextStartIndex < updatedRound.startOrder.length) {
    if ((state.format === 'team' || state.format === 'superteam') && regroupsBeforeEachGroup(round.id)) {
      const startOrder = reorderRemainingGroups(nextState, updatedRound, nextState.nextStartIndex)
      if (startOrder !== updatedRound.startOrder) nextState = replaceRound(nextState, { ...updatedRound, startOrder })
    }
    return { state: nextState, roundCompleted: null }
  }
  return finishRound(nextState)
}

function scoreFor(round: CompetitionRound | undefined, participantId: string): number | null {
  const attempt = round?.attempts[participantId]
  return attempt?.kind === 'score' ? attempt.totalTenths : null
}

function statusFor(round: CompetitionRound | undefined, participantId: string): RankingEntry['status'] {
  const attempt = round?.attempts[participantId]
  return attempt?.status ?? 'waiting'
}

function rankedEntries(entries: Omit<RankingEntry, 'rank'>[]): RankingEntry[] {
  const ordered = [...entries].sort((left, right) => {
    if (left.totalTenths === null && right.totalTenths === null) return left.name.localeCompare(right.name, 'pl')
    if (left.totalTenths === null) return 1
    if (right.totalTenths === null) return -1
    return right.totalTenths - left.totalTenths || left.name.localeCompare(right.name, 'pl')
  })
  let previousTotal: number | null = null
  let previousRank = 0
  return ordered.map((entry, index) => {
    const rank = entry.totalTenths === null
      ? null
      : entry.totalTenths === previousTotal
        ? previousRank
        : index + 1
    if (entry.totalTenths !== null && entry.totalTenths !== previousTotal) {
      previousTotal = entry.totalTenths
      previousRank = rank ?? 0
    }
    return { ...entry, rank }
  })
}

/** Tabela bieżącej serii; statusy administracyjne pozostają null, nigdy 0 pkt. */
export function roundRanking(state: CompetitionState): readonly RankingEntry[] {
  return roundRankingOf(state, activeRound(state).id)
}

/**
 * P42 runda 11: ranking KONKRETNEJ serii — plansza wyników po zamknięciu
 * kwalifikacji musi pokazać noty tej serii, a nie pustą listę następnej.
 */
export function roundRankingOf(state: CompetitionState, roundId: CompetitionRoundId): readonly RankingEntry[] {
  const round = state.rounds.find((candidate) => candidate.id === roundId)
  if (!round) return []
  return rankedEntries(round.startOrder.map((participantId) => ({
    participantId,
    name: entrantName(state, participantId),
    totalTenths: scoreFor(round, participantId),
    status: statusFor(round, participantId),
  })))
}

/** Potwierdzenie planszy wyników serii — czyści oczekujące podsumowanie. */
export function clearPendingRoundSummary(state: CompetitionState): CompetitionState {
  if (!state.pendingRoundSummary) return state
  return { ...state, pendingRoundSummary: null }
}

/** Oficjalna tabela konkursu: kwalifikacje nie wchodzą do sumy. */
export function competitionStandings(state: CompetitionState): readonly RankingEntry[] {
  const first = state.rounds.find((round) => round.id === 'first' && round.status === 'complete')
  const final = state.rounds.find((round) => round.id === 'final' && round.status !== 'cancelled')
  if (!first) return roundRanking(state)

  return rankedEntries(first.startOrder.map((participantId) => {
    const firstScore = scoreFor(first, participantId)
    const finalScore = scoreFor(final, participantId)
    const totalTenths = firstScore === null ? null : firstScore + (finalScore ?? 0)
    const status = final?.attempts[participantId]
      ? statusFor(final, participantId)
      : statusFor(first, participantId)
    return { participantId, name: entrantName(state, participantId), totalTenths, status }
  }))
}

export function leaderTotalTenths(state: CompetitionState): number {
  return competitionStandings(state).find((entry) => entry.totalTenths !== null)?.totalTenths ?? 0
}

export function previousCompetitionTenths(state: CompetitionState, participantId: string): number {
  const first = state.rounds.find((round) => round.id === 'first')
  return activeRound(state).id === 'final' ? scoreFor(first, participantId) ?? 0 : 0
}

export function setJuryGate(state: CompetitionState, gateNumber: number, reason: string): CompetitionState {
  if (state.status !== 'active') throw new Error('Belkę można zmienić tylko w aktywnym konkursie.')
  if (!Number.isInteger(gateNumber) || gateNumber < 1) throw new Error('Nieprawidłowy numer belki jury.')
  if (gateNumber === state.juryGateNumber) return state
  const updated = { ...state, juryGateNumber: gateNumber }
  return {
    ...updated,
    events: [...updated.events, event(updated, 'jury-gate-changed', `${state.juryGateNumber}→${gateNumber}: ${reason}`)],
  }
}

export function requestWithdrawal(state: CompetitionState, participantId: string): CompetitionState {
  if (participantId !== currentParticipantId(state)) throw new Error('Wycofać można tylko aktualnego uczestnika.')
  const updated = { ...state, withdrawalRequestParticipantId: participantId }
  return {
    ...updated,
    events: [...updated.events, event(updated, 'withdrawal-requested', participantId)],
  }
}

export function cancelWithdrawal(state: CompetitionState): CompetitionState {
  if (!state.withdrawalRequestParticipantId) return state
  const updated = { ...state, withdrawalRequestParticipantId: null }
  return {
    ...updated,
    events: [...updated.events, event(updated, 'withdrawal-cancelled', 'rezygnacja odrzucona przez gracza')],
  }
}

export function confirmWithdrawal(state: CompetitionState): RecordAttemptResult {
  const participantId = state.withdrawalRequestParticipantId
  if (!participantId) throw new Error('Brak rezygnacji oczekującej na potwierdzenie.')
  const prepared = {
    ...state,
    events: [...state.events, event(state, 'withdrawal-confirmed', participantId)],
  }
  return recordAttempt(prepared, {
    kind: 'administrative',
    resultId: `${state.id}-${activeRound(state).id}-${participantId}-withdrawn`,
    participantId,
    status: 'withdrawn',
    reason: 'potwierdzona rezygnacja z konkursu',
  })
}

export function cancelCurrentRound(state: CompetitionState, reason: string): CompetitionState {
  if (state.status !== 'active') throw new Error('Anulować można tylko aktywną serię.')
  if (!reason.trim()) throw new Error('Anulowanie serii wymaga przyczyny.')
  const round = activeRound(state)
  if (round.status !== 'active') throw new Error('Seria nie jest aktywna.')
  const cancelled: CompetitionRound = {
    ...round,
    status: 'cancelled',
    discardedAttemptCount: Object.keys(round.attempts).length,
  }
  let updated = replaceRound(state, cancelled)
  updated = {
    ...updated,
    // Odwołana dalsza seria: obowiązują wyniki serii ukończonych (II seria Super Team jak finał).
    status: round.id === 'final' || round.id === 'second' ? 'complete' : 'cancelled',
    withdrawalRequestParticipantId: null,
  }
  return {
    ...updated,
    events: [...updated.events, event(updated, 'round-cancelled', `${round.id}: ${reason}`)],
  }
}
