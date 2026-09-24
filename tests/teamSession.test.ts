/** PKG-015 — Super Team i King of the Hill w sesji (boty, prawdziwa fizyka) oraz zapis w DB v3. */
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { CompetitionSession } from '../src/app/competitionSession'
import { buildHillById } from '../src/app/hills'
import { buildKothEntrants, buildTeamRoster, defaultLineup } from '../src/app/modes'
import { LOCAL_PROFILES } from '../src/player/profiles'
import {
  commitAttempt,
  loadCalendar,
  loadGameSettings,
  loadSession,
  openGameDatabase,
  saveCalendar,
  saveGameSettings,
} from '../src/storage/db'
import { DEFAULT_SETTINGS } from '../src/settings/settings'
import { validateStoredSession } from '../src/storage/schema'

const HILL_ID = 'h01-lillehammer-normal'

/** Boty skaczą; człowiek rezygnuje ze swojego skoku (szybki, deterministyczny przebieg). */
function drive(session: CompetitionSession, stop: (session: CompetitionSession) => boolean): void {
  for (let guard = 0; guard < 5000 && !stop(session); guard += 1) {
    if (session.view === 'bots') session.advanceBotChunk()
    else if (session.view === 'handover') {
      session.requestHumanWithdrawal()
      session.confirmHumanWithdrawal()
    } else if (session.view === 'result') session.continueAfterResult(false)
    else if (session.view === 'round-summary') session.continueAfterResult(false)
    else break
  }
}

describe('P27 — Super Team w sesji: wszyscy → 12 → 8, wznowienie z IndexedDB', () => {
  it('pełny konkurs 16 zespołów z zapisem na planszy po I serii', async () => {
    const hill = buildHillById(HILL_ID)
    const profiles = LOCAL_PROFILES.slice(0, 1)
    const roster = buildTeamRoster(defaultLineup('superteam', profiles), profiles, 'easy')
    const variant = { format: 'superteam' as const, seed: 77, label: 'SUPER TEAM', roster }
    const session = new CompetitionSession(hill, 1, 'easy', false, null, 'superteam-test', variant)
    expect(session.view).toBe('handover')
    expect(session.snapshot().teams?.rows).toHaveLength(16)

    drive(session, (current) => current.view === 'round-summary')
    const afterFirst = session.snapshot()
    expect(afterFirst.lastCompletedRound).toBe('first')
    expect(afterFirst.teams?.advanceLimit).toBe(12)
    expect(afterFirst.roundLabel).toBe('DRUGA SERIA')
    expect(session.state.rounds[1]!.startOrder.length).toBeGreaterThanOrEqual(24)

    // Zapis w DB v3 obok ustawień i kalendarza; nic z nich nie znika.
    const db = await openGameDatabase(new IDBFactory())
    const custom = { ...DEFAULT_SETTINGS, volume: 41 }
    await saveGameSettings(db, custom)
    const calendar = { schemaVersion: 1, id: 'custom', name: 'WŁASNY', events: [{ hillId: HILL_ID, hillVersion: hill.spec.hillVersion }], savedAtMs: 1 }
    await saveCalendar(db, calendar)
    const outcome = await commitAttempt(db, {
      session: session.toStoredSession(5), result: null, recordCandidate: null, replay: null, ownerId: 'tab', nowMs: 5,
    })
    expect(outcome.ok).toBe(true)
    expect(db.version).toBe(3)
    expect(await loadGameSettings(db)).toEqual(custom)
    expect(await loadCalendar(db, 'custom')).toEqual({ kind: 'ok', calendar })
    const loaded = await loadSession(db, 'superteam-test')
    expect(loaded.kind).toBe('ok')
    if (loaded.kind !== 'ok') return

    const resumed = new CompetitionSession(hill, 1, 'easy', false, loaded.session, 'superteam-test', variant)
    expect(resumed.view).toBe('round-summary')
    expect(resumed.snapshot().teams).toEqual(afterFirst.teams)

    drive(resumed, (current) => current.view === 'finished')
    drive(session, (current) => current.view === 'finished')
    expect(resumed.state.status).toBe('complete')
    expect(resumed.state.rounds.map((round) => round.id)).toEqual(['first', 'second', 'final'])
    expect(new Set(resumed.state.rounds[2]!.startOrder.map((id) => resumed.state.teams!.find((team) => team.memberIds.includes(id))!.id)).size)
      .toBeGreaterThanOrEqual(8)
    // Wznowienie nie zmienia przebiegu: ten sam wynik co sesja bez przerwy.
    expect(resumed.snapshot().teams?.rows).toEqual(session.snapshot().teams?.rows)
    const rows = resumed.snapshot().teams!.rows
    expect(rows.slice(0, 8).every((row) => row.roundTenths.every((value) => value !== null))).toBe(true)
    for (const row of rows) {
      expect(row.totalTenths).toBe(row.roundTenths.reduce<number>((sum, value) => sum + (value ?? 0), 0))
    }
  }, 60_000)
})

describe('P28 — King of the Hill w sesji', () => {
  it('wyjście ostatniego człowieka: boty kończą bez zatrzymań, jest zwycięzca', () => {
    const hill = buildHillById(HILL_ID)
    const profiles = LOCAL_PROFILES.slice(0, 1)
    const variant = { format: 'koth' as const, seed: 9, label: 'KING OF THE HILL', roster: { entrants: buildKothEntrants(profiles, 3, 'normal') } }
    const session = new CompetitionSession(hill, 1, 'normal', false, null, 'koth-test', variant)
    expect(session.snapshot().roundLabel).toBe('RUNDA 1')
    expect(session.view).toBe('handover')
    session.requestHumanWithdrawal()
    session.confirmHumanWithdrawal()
    session.continueAfterResult(false)
    let summaries = 0
    for (let guard = 0; guard < 2000 && session.view !== 'finished'; guard += 1) {
      if (session.view === 'round-summary') {
        summaries += 1
        session.continueAfterResult(false)
      } else session.advanceBotChunk()
    }
    expect(summaries).toBe(0)
    expect(session.state.status).toBe('complete')
    const koth = session.snapshot().koth!
    expect(koth.rows.find((row) => row.participantId === profiles[0]!.id)).toMatchObject({ state: 'out', eliminatedInRound: 1 })
    expect(koth.rows.filter((row) => row.state === 'winner').length).toBeGreaterThanOrEqual(1)
    expect(session.state.rounds.length).toBeLessThanOrEqual(6)
  })

  it('dwie rezygnacje w jednej serii: obaj odpadają razem, bot wygrywa, werdykt na planszy', () => {
    const hill = buildHillById(HILL_ID)
    const profiles = LOCAL_PROFILES.slice(0, 2)
    const variant = { format: 'koth' as const, seed: 11, roster: { entrants: buildKothEntrants(profiles, 1, 'normal') } }
    const session = new CompetitionSession(hill, 2, 'normal', false, null, 'koth-test-2', variant)
    // Gracz 1 rezygnuje; gracz 2 wciąż dostaje swój skok w tej serii.
    session.requestHumanWithdrawal()
    session.confirmHumanWithdrawal()
    session.continueAfterResult(false)
    expect(session.snapshot().currentParticipantId).toBe(profiles[1]!.id)
    session.requestHumanWithdrawal()
    session.confirmHumanWithdrawal()
    session.continueAfterResult(false)
    drive(session, (current) => current.view === 'round-summary' || current.view === 'finished')
    const view = session.snapshot().koth!
    expect(view.verdict).toMatch(/REZYGNACJA — ODPADA/)
    expect(view.roundResults).toHaveLength(3)
    expect(session.state.status).toBe('complete')
  })
})

describe('PKG-015 — walidacja zapisu drużyn i King of the Hill', () => {
  it('odrzuca drużynę z nieznanym zawodnikiem i KotH bez stanu; poprawny zapis przechodzi', () => {
    const hill = buildHillById(HILL_ID)
    const profiles = LOCAL_PROFILES.slice(0, 1)
    const team = new CompetitionSession(hill, 1, 'easy', false, null, 'team-v', {
      format: 'team', roster: buildTeamRoster(defaultLineup('team', profiles), profiles, 'easy'),
    }).toStoredSession(1)
    expect(validateStoredSession(JSON.parse(JSON.stringify(team))).ok).toBe(true)
    const broken = { ...team, competition: { ...team.competition, teams: [{ id: 'x', name: 'X', memberIds: ['ghost'] }, team.competition.teams![1]] } }
    expect(validateStoredSession(broken)).toEqual({ ok: false, reason: 'drużyna bez nazwy lub z nieznanym zawodnikiem' })

    const koth = new CompetitionSession(hill, 1, 'easy', false, null, 'koth-v', {
      format: 'koth', roster: { entrants: buildKothEntrants(profiles, 2, 'easy') },
    }).toStoredSession(1)
    expect(validateStoredSession(JSON.parse(JSON.stringify(koth))).ok).toBe(true)
    const { koth: _state, ...withoutState } = koth.competition
    expect(validateStoredSession({ ...koth, competition: withoutState })).toEqual({ ok: false, reason: 'King of the Hill bez stanu eliminacji' })
  })
})
