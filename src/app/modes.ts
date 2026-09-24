/**
 * PKG-015 / P26–P28 — obsady trybów drużynowych i King of the Hill.
 *
 * Lineup to zwykła tablica slotów [drużyna][grupa]: bot albo profil
 * hotseat. Ten sam profil nie może zająć dwóch miejsc (to byłby ten sam
 * zawodnik dwa razy); każde miejsce ma jawnie opisane sterowanie.
 */

import type { PlayerProfile } from '../player/profiles'
import { createFictionalEntrants } from '../sport/ai'
import type { AiDifficulty, CompetitionEntrant } from '../sport/competition'
import { KOTH_MAX_PARTICIPANTS, KOTH_MIN_PARTICIPANTS } from '../sport/koth'
import { TEAM_SIZE, type CompetitionTeam, type TeamFormat } from '../sport/team'

export type LineupSlot = { readonly kind: 'bot' } | { readonly kind: 'human'; readonly profileId: string }

export type TeamLineup = {
  readonly format: TeamFormat
  /** slots[drużyna][grupa] */
  readonly slots: readonly (readonly LineupSlot[])[]
}

/** Kody drużyn narodowych; zawodnicy botów są fikcyjni. */
export const TEAM_CODES = [
  'AUT', 'GER', 'NOR', 'SLO', 'POL', 'JPN', 'SUI', 'FIN',
  'ITA', 'CZE', 'USA', 'CAN', 'KAZ', 'FRA', 'EST', 'BUL',
] as const

/** Drużynowy: 12 ekip (finał 8); Super Team: 16 ekip (12 → 8). */
export const TEAM_COUNT: Readonly<Record<TeamFormat, number>> = { team: 12, superteam: 16 }

export function defaultLineup(format: TeamFormat, profiles: readonly PlayerProfile[]): TeamLineup {
  const size = TEAM_SIZE[format]
  const slots = Array.from({ length: TEAM_COUNT[format] }, (_, team) =>
    Array.from({ length: size }, (_, group): LineupSlot => {
      const profile = profiles[team * size + group]
      return profile ? { kind: 'human', profileId: profile.id } : { kind: 'bot' }
    }))
  return { format, slots }
}

/**
 * Pula 75 botów to 5 nazwisk × 15 imion (nazwisko jest pętlą zewnętrzną).
 * Kolejne numery zmieniają i imię, i nazwisko (bijekcja na 0…74), żeby
 * drużyna i stawka King of the Hill nie składały się z samych Białowicherów.
 */
function fictionalBot(index: number, difficulty: AiDifficulty): CompetitionEntrant {
  const first = index % 15
  const last = (index + Math.floor(index / 15)) % 5
  return createFictionalEntrants(difficulty)[last * 15 + first]!
}

function botEntrant(format: TeamFormat, team: number, group: number, difficulty: AiDifficulty): CompetitionEntrant {
  const bot = fictionalBot(team * TEAM_SIZE[format] + group, difficulty)
  return { ...bot, startNumber: (team + 1) * 10 + group + 1 }
}

export function slotAthleteName(lineup: TeamLineup, team: number, group: number, profiles: readonly PlayerProfile[]): string {
  const slot = lineup.slots[team]?.[group]
  if (slot?.kind === 'human') return profiles.find((profile) => profile.id === slot.profileId)?.name ?? slot.profileId
  return botEntrant(lineup.format, team, group, 'normal').name
}

/** Problemy blokujące start: duplikat zawodnika, nieznany profil, brak człowieka. */
export function lineupProblems(lineup: TeamLineup, profiles: readonly PlayerProfile[]): readonly string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const known = new Set(profiles.map((profile) => profile.id))
  for (const team of lineup.slots) {
    for (const slot of team) {
      if (slot.kind !== 'human') continue
      if (!known.has(slot.profileId)) problems.push(`nieznany profil ${slot.profileId}`)
      if (seen.has(slot.profileId)) problems.push(`zawodnik ${slot.profileId} w obsadzie dwa razy`)
      seen.add(slot.profileId)
    }
  }
  if (seen.size === 0) problems.push('brak gracza w obsadzie')
  return problems
}

/**
 * ←/→ na miejscu: BOT → kolejne wolne profile → BOT. Profil zajęty
 * w innym miejscu jest pomijany, więc interfejs nie tworzy duplikatu.
 */
export function cycleLineupSlot(
  lineup: TeamLineup,
  team: number,
  group: number,
  direction: -1 | 1,
  profiles: readonly PlayerProfile[],
): TeamLineup {
  const current = lineup.slots[team]?.[group]
  if (!current) return lineup
  const used = new Set(lineup.slots.flat().flatMap((slot) => (slot.kind === 'human' ? [slot.profileId] : [])))
  const options: LineupSlot[] = [
    { kind: 'bot' },
    ...profiles
      .filter((profile) => !used.has(profile.id) || (current.kind === 'human' && current.profileId === profile.id))
      .map((profile): LineupSlot => ({ kind: 'human', profileId: profile.id })),
  ]
  const index = options.findIndex((option) =>
    option.kind === current.kind && (option.kind === 'bot' || (current.kind === 'human' && option.profileId === current.profileId)))
  const next = options[(index + direction + options.length) % options.length]!
  return {
    ...lineup,
    slots: lineup.slots.map((slots, teamIndex) =>
      teamIndex === team ? slots.map((slot, groupIndex) => (groupIndex === group ? next : slot)) : slots),
  }
}

export function buildTeamRoster(
  lineup: TeamLineup,
  profiles: readonly PlayerProfile[],
  difficulty: AiDifficulty,
): { readonly entrants: readonly CompetitionEntrant[]; readonly teams: readonly CompetitionTeam[] } {
  const problems = lineupProblems(lineup, profiles)
  if (problems.length > 0) throw new Error(`Nieprawidłowa obsada: ${problems.join(', ')}.`)
  const entrants: CompetitionEntrant[] = []
  const teams = lineup.slots.map((slots, team): CompetitionTeam => {
    const memberIds = slots.map((slot, group) => {
      const startNumber = (team + 1) * 10 + group + 1
      const profile = slot.kind === 'human' ? profiles.find((candidate) => candidate.id === slot.profileId) : undefined
      const entrant: CompetitionEntrant = profile
        ? { id: profile.id, name: profile.name, startNumber, controller: { kind: 'human', profileId: profile.id } }
        : botEntrant(lineup.format, team, group, difficulty)
      entrants.push(entrant)
      return entrant.id
    })
    return { id: `team-${TEAM_CODES[team]!.toLowerCase()}`, name: TEAM_CODES[team]!, memberIds }
  })
  return { entrants, teams }
}

/** King of the Hill: najpierw gracze hotseat, potem boty (numery 1…n). */
export function buildKothEntrants(
  profiles: readonly PlayerProfile[],
  botCount: number,
  difficulty: AiDifficulty,
): readonly CompetitionEntrant[] {
  const total = profiles.length + botCount
  if (!Number.isInteger(botCount) || botCount < 0 || total < KOTH_MIN_PARTICIPANTS || total > KOTH_MAX_PARTICIPANTS) {
    throw new Error(`King of the Hill wymaga ${KOTH_MIN_PARTICIPANTS}–${KOTH_MAX_PARTICIPANTS} uczestników.`)
  }
  const humans = profiles.map((profile, index): CompetitionEntrant => ({
    id: profile.id,
    name: profile.name,
    startNumber: index + 1,
    controller: { kind: 'human', profileId: profile.id },
  }))
  const bots = Array.from({ length: botCount }, (_, index) => ({
    ...fictionalBot(index, difficulty),
    startNumber: profiles.length + index + 1,
  }))
  return [...humans, ...bots]
}
