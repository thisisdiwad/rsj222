/**
 * PKG-016 / P29 — statystyki skoków i sezonów liczone z zapisanych danych.
 *
 * Źródłem są wyniki konkursów (`results`) i sezony (`seasons`); nic nie jest
 * liczone „na zapas” w osobnym magazynie, więc statystyka nie rozjedzie się
 * z zapisem. Moduł jest czysty.
 */

import type { CompetitionJumpResult } from './jumpResult'
import { seasonStandings, type SeasonState } from './season'

export type JumpStatsRow = {
  readonly participantId: string
  readonly jumps: number
  readonly landed: number
  readonly falls: number
  readonly bestDistanceHalfMeters: number
  readonly bestTotalTenths: number
  /** Średnia nota ustanych skoków, dziesiąte punktu (zaokrąglona). */
  readonly averageTotalTenths: number
}

/** Statystyki skoków konkursowych graczy (participantId z prefiksem `local-`). */
export function humanJumpStats(results: readonly CompetitionJumpResult[]): readonly JumpStatsRow[] {
  const byParticipant = new Map<string, CompetitionJumpResult[]>()
  for (const result of results) {
    if (!result.participantId.startsWith('local-')) continue
    byParticipant.set(result.participantId, [...(byParticipant.get(result.participantId) ?? []), result])
  }
  return [...byParticipant.entries()]
    .map(([participantId, list]) => {
      const landed = list.filter((result) => result.status === 'landed')
      return {
        participantId,
        jumps: list.length,
        landed: landed.length,
        falls: list.length - landed.length,
        bestDistanceHalfMeters: Math.max(0, ...landed.map((result) => result.distanceHalfMeters)),
        bestTotalTenths: Math.max(0, ...list.map((result) => result.totalTenths)),
        averageTotalTenths: landed.length === 0
          ? 0
          : Math.round(landed.reduce((sum, result) => sum + result.totalTenths, 0) / landed.length),
      }
    })
    .sort((left, right) => left.participantId.localeCompare(right.participantId))
}

export type SeasonStatsRow = {
  readonly format: SeasonState['format']
  readonly started: number
  readonly completed: number
  readonly abandoned: number
  /** Zakończone sezony wygrane przez gracza (wspólne 1. miejsce też się liczy). */
  readonly humanWins: number
  /** Zakończone sezony z graczem na podium. */
  readonly humanPodiums: number
}

export function seasonStats(seasons: readonly SeasonState[]): readonly SeasonStatsRow[] {
  const formats: SeasonState['format'][] = ['cup', 'four-hills']
  return formats.map((format) => {
    const list = seasons.filter((season) => season.format === format)
    const completed = list.filter((season) => season.status === 'complete')
    const humanRanks = completed.map((season) =>
      Math.min(Infinity, ...seasonStandings(season).filter((row) => row.participantId.startsWith('local-')).map((row) => row.rank)))
    return {
      format,
      started: list.length,
      completed: completed.length,
      abandoned: list.filter((season) => season.status === 'abandoned').length,
      humanWins: humanRanks.filter((rank) => rank === 1).length,
      humanPodiums: humanRanks.filter((rank) => rank <= 3).length,
    }
  })
}
