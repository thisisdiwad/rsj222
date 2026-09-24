/**
 * PKG-015 / P26–P27 — drużyny czteroosobowe i Super Team.
 *
 * Źródła: F03 (WC Men 2026/27) §2.2.2 (obsady 4 i 2), §3.2.3 (kolejność startu
 * i finał 8 drużyn, przed każdą grupą finału odwrócona bieżąca klasyfikacja),
 * §3.2.4 (Super Team: 3 serie, wszyscy → 12 → 8, suma wszystkich skoków);
 * ICR 453.4 (grupy, jeden zawodnik drużyny w grupie), ICR 433.4 (równa nota →
 * to samo miejsce). Remis na granicy awansu: drużyny z tym samym miejscem
 * mieszczą się w „leading eight/twelve”, więc awansują wszystkie (interpretacja
 * ICR 433.4 + F03 §3.2.3.1, zapisana w GAMEPLAY_SPEC §6).
 *
 * Moduł jest czysty: operuje na stanie konkursu, bez DOM i zapisu.
 */

import type { CompetitionEntrant, CompetitionRound, CompetitionState } from './competition'

export type TeamFormat = 'team' | 'superteam'

export type CompetitionTeam = {
  readonly id: string
  readonly name: string
  /** memberIds[g] skacze w grupie g+1 (ICR 453.4). */
  readonly memberIds: readonly string[]
}

export const TEAM_SIZE: Readonly<Record<TeamFormat, number>> = { team: 4, superteam: 2 }
/** Awans po serii: drużynowy 8, Super Team 12 po I i 8 po II serii. */
export function teamAdvanceLimit(format: TeamFormat, completedRoundId: string): number | null {
  if (completedRoundId === 'final') return null
  if (format === 'team') return 8
  return completedRoundId === 'first' ? 12 : 8
}

export function validateTeams(
  format: TeamFormat,
  teams: readonly CompetitionTeam[],
  entrants: readonly CompetitionEntrant[],
): void {
  const size = TEAM_SIZE[format]
  if (teams.length < 2) throw new Error('Konkurs drużynowy wymaga co najmniej 2 drużyn.')
  const entrantIds = new Set(entrants.map((entrant) => entrant.id))
  const teamIds = new Set<string>()
  const placed = new Set<string>()
  for (const team of teams) {
    if (!team.id || !team.name) throw new Error('Drużyna wymaga identyfikatora i nazwy.')
    if (teamIds.has(team.id)) throw new Error(`Duplikat drużyny: ${team.id}.`)
    teamIds.add(team.id)
    if (team.memberIds.length !== size) {
      throw new Error(`Drużyna ${team.name} wymaga ${size} zawodników, otrzymano ${team.memberIds.length}.`)
    }
    for (const memberId of team.memberIds) {
      if (!entrantIds.has(memberId)) throw new Error(`Drużyna ${team.name} wskazuje nieznanego zawodnika ${memberId}.`)
      if (placed.has(memberId)) throw new Error(`Zawodnik ${memberId} występuje w obsadzie więcej niż raz.`)
      placed.add(memberId)
    }
  }
  if (placed.size !== entrants.length) throw new Error('Każdy zawodnik musi należeć do dokładnie jednej drużyny.')
}

/** Lista startowa serii: grupa po grupie, w grupie drużyny w podanej kolejności. */
export function groupedStartOrder(teams: readonly CompetitionTeam[]): readonly string[] {
  const groups = teams[0]?.memberIds.length ?? 0
  const order: string[] = []
  for (let group = 0; group < groups; group += 1) {
    for (const team of teams) order.push(team.memberIds[group]!)
  }
  return order
}

function scoreOf(round: CompetitionRound, participantId: string): number {
  const attempt = round.attempts[participantId]
  return attempt?.kind === 'score' ? attempt.totalTenths : 0
}

/** Suma zaliczonych skoków drużyny ze wszystkich nieanulowanych serii (DNS/DSQ = 0). */
export function teamTotalTenths(state: CompetitionState, team: CompetitionTeam): number {
  let total = 0
  for (const round of state.rounds) {
    if (round.status === 'cancelled') continue
    for (const memberId of team.memberIds) total += scoreOf(round, memberId)
  }
  return total
}

function teamsInRound(state: CompetitionState, round: CompetitionRound): readonly CompetitionTeam[] {
  const ids = new Set(round.startOrder)
  const teams = state.teams ?? []
  // Kolejność pierwszej grupy serii wyznacza kolejność drużyn w tej serii.
  const firstGroup = round.startOrder.slice(0, teams.filter((team) => team.memberIds.some((id) => ids.has(id))).length)
  return firstGroup
    .map((participantId) => teams.find((team) => team.memberIds.includes(participantId)))
    .filter((team): team is CompetitionTeam => Boolean(team))
}

/**
 * Drużyny awansujące po serii: najlepsze `limit`; drużyny ze wspólnym
 * miejscem granicznym awansują razem (ICR 433.4).
 */
export function teamAdvancers(state: CompetitionState, round: CompetitionRound, limit: number): readonly CompetitionTeam[] {
  const teams = teamsInRound(state, round)
  const totals = new Map(teams.map((team) => [team.id, teamTotalTenths(state, team)]))
  const ordered = [...teams].sort((left, right) => totals.get(right.id)! - totals.get(left.id)!)
  const boundary = ordered[Math.min(limit, ordered.length) - 1]
  if (!boundary) return []
  const cut = totals.get(boundary.id)!
  const advancing = new Set(ordered.filter((team) => totals.get(team.id)! >= cut).map((team) => team.id))
  // Zachowujemy kolejność drużyn z poprzedniej serii (bazę następnej listy).
  return teams.filter((team) => advancing.has(team.id))
}

/**
 * F03 §3.2.3.1 / §3.2.4: przed grupą finału kolejność drużyn to odwrócona
 * bieżąca klasyfikacja (najsłabsza skacze pierwsza). Remis: zachowana
 * kolejność z poprzedniej grupy (ADAPT — przepisy nie precyzują).
 */
export function reverseStandingTeamOrder(state: CompetitionState, teams: readonly CompetitionTeam[]): readonly CompetitionTeam[] {
  const totals = new Map(teams.map((team) => [team.id, teamTotalTenths(state, team)]))
  return teams
    .map((team, index) => ({ team, index }))
    .sort((left, right) => totals.get(left.team.id)! - totals.get(right.team.id)! || left.index - right.index)
    .map((entry) => entry.team)
}

/** Czy seria ustala kolejność przed każdą grupą (finał obu formatów). */
export function regroupsBeforeEachGroup(roundId: string): boolean {
  return roundId === 'final'
}

/**
 * Po zamknięciu grupy w finale przestawia pozostałe grupy według bieżącej
 * klasyfikacji. Skoki już oddane nie zmieniają miejsca na liście.
 */
export function reorderRemainingGroups(state: CompetitionState, round: CompetitionRound, nextStartIndex: number): readonly string[] {
  const teams = teamsInRound(state, round)
  const perGroup = teams.length
  if (perGroup === 0 || nextStartIndex % perGroup !== 0 || nextStartIndex >= round.startOrder.length) return round.startOrder
  const done = round.startOrder.slice(0, nextStartIndex)
  const previousGroup = round.startOrder.slice(nextStartIndex - perGroup, nextStartIndex)
  const previousOrder = previousGroup
    .map((participantId) => teams.find((team) => team.memberIds.includes(participantId)))
    .filter((team): team is CompetitionTeam => Boolean(team))
  const order = reverseStandingTeamOrder(state, previousOrder)
  const groups = teams[0]?.memberIds.length ?? 0
  const rest: string[] = []
  for (let group = nextStartIndex / perGroup; group < groups; group += 1) {
    for (const team of order) rest.push(team.memberIds[group]!)
  }
  return [...done, ...rest]
}

export type TeamMemberRow = {
  readonly participantId: string
  readonly name: string
  readonly human: boolean
  /** Nota w kolejnych seriach (dziesiąte pkt), status administracyjny albo brak skoku. */
  readonly rounds: readonly (number | string | null)[]
}

export type TeamStanding = {
  readonly teamId: string
  readonly name: string
  readonly rank: number
  readonly totalTenths: number
  /** Liczba serii, w których drużyna startowała (finaliści przed resztą). */
  readonly roundsReached: number
  readonly human: boolean
  readonly members: readonly TeamMemberRow[]
}

/**
 * Tabela drużynowa: najpierw drużyny, które doszły dalej, potem suma.
 * Równa suma na tym samym etapie → to samo miejsce (ICR 433.4); w liście
 * remisowe drużyny w odwrotnej kolejności startu (wyższy numer wyżej).
 */
export function teamStandings(state: CompetitionState): readonly TeamStanding[] {
  const teams = state.teams ?? []
  const humanIds = new Set(state.entrants.filter((entrant) => entrant.controller.kind === 'human').map((entrant) => entrant.id))
  const names = new Map(state.entrants.map((entrant) => [entrant.id, entrant.name]))
  const rows = teams.map((team, index) => {
    const reached = state.rounds.filter((round) => round.status !== 'cancelled' && team.memberIds.some((id) => round.startOrder.includes(id))).length
    return {
      index,
      row: {
        teamId: team.id,
        name: team.name,
        totalTenths: teamTotalTenths(state, team),
        roundsReached: reached,
        human: team.memberIds.some((id) => humanIds.has(id)),
        members: team.memberIds.map((participantId) => ({
          participantId,
          name: names.get(participantId) ?? participantId,
          human: humanIds.has(participantId),
          rounds: state.rounds.map((round) => {
            const attempt = round.attempts[participantId]
            if (!attempt) return null
            return attempt.kind === 'score' ? attempt.totalTenths : attempt.status
          }),
        })),
      },
    }
  })
  rows.sort((left, right) =>
    right.row.roundsReached - left.row.roundsReached
      || right.row.totalTenths - left.row.totalTenths
      || right.index - left.index,
  )
  let previous: { reached: number; total: number; rank: number } | null = null
  return rows.map(({ row }, position) => {
    const tied = previous && previous.reached === row.roundsReached && previous.total === row.totalTenths
    const rank = tied ? previous!.rank : position + 1
    previous = { reached: row.roundsReached, total: row.totalTenths, rank }
    return { ...row, rank }
  })
}

export function teamOfParticipant(state: CompetitionState, participantId: string): CompetitionTeam | null {
  return state.teams?.find((team) => team.memberIds.includes(participantId)) ?? null
}
