/** PKG-014 — konkurs KO w sesji z botami, wznowienie sezonu i migracja IndexedDB v2→v3. */
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { CompetitionSession } from '../src/app/competitionSession'
import { buildHillById, PLAYABLE_HILL_SPECS } from '../src/app/hills'
import { competitionStandings } from '../src/sport/competition'
import { createSeason, eventSeed, recordSeasonEvent, seasonCompetitionId, type CalendarEvent } from '../src/sport/season'
import {
  commitAttempt,
  loadCalendar,
  loadGameSettings,
  loadSeasons,
  loadSession,
  openGameDatabase,
  saveCalendar,
  saveGameSettings,
  saveSeason,
} from '../src/storage/db'
import { DB_NAME, SEASON_SCHEMA_VERSION, STORE, type StoredSeason } from '../src/storage/schema'
import { DEFAULT_SETTINGS } from '../src/settings/settings'

const LIBRARY: readonly CalendarEvent[] = PLAYABLE_HILL_SPECS.map((spec) => ({ hillId: spec.id, hillVersion: spec.hillVersion }))
const H03 = LIBRARY.find((event) => event.hillId === 'h03-oberstdorf-large')!

function koSeason(): StoredSeason {
  const season = createSeason({
    id: 'four-hills-test', format: 'four-hills',
    calendar: { id: 'ko-test', name: 'TURNIEJ TESTOWY', events: [H03, H03] },
    setup: { profileCount: 1, difficulty: 'easy' },
    versions: { rules: 'r', physics: ['p'] }, library: LIBRARY, nowMs: 5,
  })
  return { ...season, schemaVersion: SEASON_SCHEMA_VERSION, revision: 0, savedAtMs: 5 }
}

function runBots(session: CompetitionSession, stopAt: CompetitionSession['view']): void {
  for (let guard = 0; guard < 2000 && session.view !== stopAt; guard += 1) {
    if (session.view === 'bots') session.advanceBotChunk()
    else break
  }
}

describe('P25 — konkurs KO w sesji (boty, prawdziwa fizyka)', () => {
  it('kwalifikacje → drabinka 25 par → najlepsi przegrani → finał; wznowienie po reloadzie', () => {
    const season = koSeason()
    const hill = buildHillById(H03.hillId)
    const sessionId = seasonCompetitionId(season, 0)
    const variant = { format: 'ko' as const, seed: eventSeed(season.setKey, 0), label: 'KO 1/2' }
    const session = new CompetitionSession(hill, 1, 'easy', false, null, sessionId, variant)
    expect(session.acceptHandover(false)).toBe(true)
    session.requestHumanWithdrawal()
    session.confirmHumanWithdrawal()
    session.continueAfterResult(false)
    runBots(session, 'round-summary')

    const afterQualification = session.snapshot()
    expect(afterQualification.lastCompletedRound).toBe('qualification')
    expect(afterQualification.ko?.resolved).toBe(false)
    expect(afterQualification.ko?.pairs).toHaveLength(25)
    expect(session.state.ko?.qualified).toHaveLength(50)
    // Reload na planszy drabinki wraca do tej samej planszy i tych samych par.
    const reloaded = new CompetitionSession(hill, 1, 'easy', false, session.toStoredSession(1), sessionId, variant)
    expect(reloaded.snapshot().ko?.pairs).toEqual(afterQualification.ko?.pairs)
    expect(() => new CompetitionSession(hill, 1, 'easy', false, session.toStoredSession(1))).toThrow(/innej sesji/)

    session.continueAfterResult(false)
    runBots(session, 'round-summary')
    const afterFirst = session.snapshot()
    expect(afterFirst.lastCompletedRound).toBe('first')
    expect(afterFirst.ko?.resolved).toBe(true)
    const winners = afterFirst.ko!.pairs.filter((pair) => pair.winnerId !== null)
    expect(winners).toHaveLength(25)
    expect(afterFirst.ko!.luckyLosers.length).toBeGreaterThanOrEqual(5)
    for (const pair of afterFirst.ko!.pairs) {
      const [first, second] = pair.slots
      const winner = pair.slots.find((slot) => slot.participantId === pair.winnerId)!
      const loser = pair.slots.find((slot) => slot.participantId !== pair.winnerId)!
      expect(winner.totalTenths!).toBeGreaterThanOrEqual(loser.totalTenths ?? 0)
      expect(first!.qualificationRank! - second!.qualificationRank!).toBe(25)
    }

    session.continueAfterResult(false)
    runBots(session, 'finished')
    expect(session.state.status).toBe('complete')
    const finalists = session.state.rounds.find((round) => round.id === 'final')!.startOrder
    expect(finalists.length).toBeGreaterThanOrEqual(30)

    const updated = recordSeasonEvent(season, 0, 'complete', competitionStandings(session.state))
    expect(updated.results).toHaveLength(1)
    expect(updated.status).toBe('active')
  })

  it('ten sam zestaw daje te same warunki, inny konkurs sezonu — inne', () => {
    const season = koSeason()
    const hill = buildHillById(H03.hillId)
    const make = (index: number) => new CompetitionSession(hill, 1, 'easy', false, null, seasonCompetitionId(season, index), {
      format: 'ko', seed: eventSeed(season.setKey, index),
    })
    expect(make(0).toStoredSession(0).seeds).toEqual(make(0).toStoredSession(0).seeds)
    expect(make(0).toStoredSession(0).seeds).not.toEqual(make(1).toStoredSession(0).seeds)
  })
})

describe('P23/P24 — zapis sezonu i kalendarza (DB v3)', () => {
  it('migracja v2→v3 zachowuje ustawienia i sesje, dodaje seasons/calendars', async () => {
    const factory = new IDBFactory()
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = factory.open(DB_NAME, 2)
      open.onupgradeneeded = () => {
        const old = open.result
        for (const [store, keyPath] of [
          [STORE.sessions, 'id'], [STORE.results, 'resultId'], [STORE.records, 'key'],
          [STORE.replays, 'id'], [STORE.leases, 'sessionId'], [STORE.settings, 'key'],
        ] as const) old.createObjectStore(store, { keyPath })
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const custom = { ...DEFAULT_SETTINGS, volume: 33 }
    await saveGameSettings(legacy, custom)
    await new Promise<void>((resolve) => {
      const tx = legacy.transaction([STORE.sessions, STORE.results], 'readwrite')
      tx.objectStore(STORE.sessions).put({ id: 'p22-session', marker: 'kept' })
      tx.objectStore(STORE.results).put({ resultId: 'p19-result', marker: 'kept' })
      tx.oncomplete = () => resolve()
    })
    legacy.close()

    const db = await openGameDatabase(factory)
    expect(db.version).toBe(3)
    expect(await loadGameSettings(db)).toEqual(custom)
    const kept = await new Promise<unknown>((resolve) => {
      const get = db.transaction(STORE.results, 'readonly').objectStore(STORE.results).get('p19-result')
      get.onsuccess = () => resolve(get.result)
    })
    expect(kept).toMatchObject({ marker: 'kept' })
    expect(await loadSeasons(db)).toEqual({ seasons: [], rejected: 0 })
    expect(await loadCalendar(db, 'custom')).toEqual({ kind: 'none' })
  })

  it('wynik konkursu i stan sezonu zapisują się w jednej transakcji; starsza rewizja nie cofa sezonu', async () => {
    const db = await openGameDatabase(new IDBFactory())
    const season = koSeason()
    await saveSeason(db, season)
    const hill = buildHillById(H03.hillId)
    const session = new CompetitionSession(hill, 1, 'easy', false, null, seasonCompetitionId(season, 0), { format: 'ko' })
    const stored = session.toStoredSession(10)
    const advanced: StoredSeason = { ...season, revision: 2, results: [{ eventIndex: 0, status: 'cancelled', placements: [] }] }
    const outcome = await commitAttempt(db, {
      session: stored, result: null, recordCandidate: null, replay: null, season: advanced, ownerId: 'tab', nowMs: 10,
    })
    expect(outcome.ok).toBe(true)
    expect((await loadSession(db, stored.id)).kind).toBe('ok')
    expect((await loadSeasons(db)).seasons[0]?.results).toHaveLength(1)

    await commitAttempt(db, {
      session: stored, result: null, recordCandidate: null, replay: null, season: { ...season, revision: 1 }, ownerId: 'tab', nowMs: 11,
    })
    expect((await loadSeasons(db)).seasons[0]?.revision).toBe(2)
  })

  it('uszkodzony sezon jest pomijany, nie kasowany; kalendarz wraca po zapisie', async () => {
    const db = await openGameDatabase(new IDBFactory())
    await saveSeason(db, koSeason())
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE.seasons, 'readwrite')
      tx.objectStore(STORE.seasons).put({ id: 'broken', schemaVersion: SEASON_SCHEMA_VERSION })
      tx.oncomplete = () => resolve()
    })
    const loaded = await loadSeasons(db)
    expect(loaded.seasons.map((season) => season.id)).toEqual(['four-hills-test'])
    expect(loaded.rejected).toBe(1)

    const calendar = { schemaVersion: 1, id: 'custom', name: 'WŁASNY', events: [H03, LIBRARY[1]!], savedAtMs: 1 }
    await saveCalendar(db, calendar)
    expect(await loadCalendar(db, 'custom')).toEqual({ kind: 'ok', calendar })
    await saveCalendar(db, { ...calendar, events: [] })
    expect((await loadCalendar(db, 'custom')).kind).toBe('rejected')
  })
})
