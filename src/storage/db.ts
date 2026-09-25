/**
 * PKG-006 / P19 — mały moduł IndexedDB z jedną jawną transakcją wyniku.
 *
 * Nie jest ogólnym repozytorium ani ORM: zna dokładnie magazyny potrzebne
 * obecnemu produktowi i wykonuje jedną operację zatwierdzenia skoku.
 * Każda obietnica rozwiązuje się w mikrozadaniu zdarzenia `success`, więc
 * transakcja pozostaje aktywna przez cały ciąg zapisów.
 */

import {
  ALL_STORES,
  DB_NAME,
  DB_VERSION,
  REPLAY_LIMITS,
  STORE,
  isRecordEligible,
  nextRecord,
  recordTargets,
  validateStoredCalendar,
  validateStoredReplay,
  validateStoredSeason,
  validateStoredSession,
  type RecordCandidate,
  type RecordCategory,
  type StoredCalendar,
  type StoredSeason,
  type SessionLeaseRecord,
  type StoredRecord,
  type StoredReplay,
  type StoredResult,
  type StoredSession,
} from './schema'
import type { CompetitionJumpResult } from '../sport/jumpResult'
import { normalizeSettings, type GameSettings } from '../settings/settings'

export const LEASE_TTL_MS = 20_000

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.onsuccess = () => resolve(source.result)
    source.onerror = () => reject(source.error ?? new Error('Nieznany błąd IndexedDB.'))
  })
}

export function openGameDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      const db = open.result
      // Older stores remain untouched on upgrade; v2 adds global settings,
      // v3 adds seasons and custom calendars (PKG-014).
      if (!db.objectStoreNames.contains(STORE.sessions)) db.createObjectStore(STORE.sessions, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE.results)) db.createObjectStore(STORE.results, { keyPath: 'resultId' })
      if (!db.objectStoreNames.contains(STORE.records)) db.createObjectStore(STORE.records, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(STORE.replays)) db.createObjectStore(STORE.replays, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE.leases)) db.createObjectStore(STORE.leases, { keyPath: 'sessionId' })
      if (!db.objectStoreNames.contains(STORE.settings)) db.createObjectStore(STORE.settings, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(STORE.seasons)) db.createObjectStore(STORE.seasons, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE.calendars)) db.createObjectStore(STORE.calendars, { keyPath: 'id' })
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error ?? new Error('Nie udało się otworzyć bazy.'))
    open.onblocked = () => reject(new Error('Baza jest zablokowana przez inną kartę.'))
  })
}

/** Missing or corrupt settings do not modify the database or any other store. */
export async function loadGameSettings(db: IDBDatabase): Promise<GameSettings> {
  const transaction = db.transaction([STORE.settings], 'readonly')
  const row = (await request(transaction.objectStore(STORE.settings).get('global'))) as unknown
  if (typeof row !== 'object' || row === null || !('value' in row)) return normalizeSettings(undefined)
  return normalizeSettings(row.value)
}

/** Resolve only after commit, so the UI can surface a failed settings write. */
export function saveGameSettings(db: IDBDatabase, settings: GameSettings): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORE.settings], 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Nie zapisano ustawień.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Nie zapisano ustawień.'))
    transaction.objectStore(STORE.settings).put({ key: 'global', value: normalizeSettings(settings) })
  })
}

export type CommitInput = {
  readonly session: StoredSession
  readonly result: CompetitionJumpResult | null
  readonly recordCandidate: RecordCandidate | null
  readonly replay: StoredReplay | null
  /** Konkurs sezonu: stan sezonu zapisywany w tej samej transakcji co skok. */
  readonly season?: StoredSeason | null
  readonly ownerId: string
  readonly nowMs: number
  readonly leaseTtlMs?: number
}

/** Punkt wstrzyknięcia awarii; produkcja go nie używa, testy sprawdzają atomowość. */
export type CommitHooks = {
  readonly afterResultWrite?: () => void
}

export type CommitOutcome =
  | {
      readonly ok: true
      /** `false` oznacza idempotentne powtórzenie tego samego `resultId`. */
      readonly applied: boolean
      readonly revision: number
      /** Zmieniono oficjalny (konkursowy) rekord. */
      readonly recordUpdated: boolean
      /** P29: wszystkie zmienione kategorie rekordów tego skoku. */
      readonly recordChanges: readonly RecordChange[]
    }
  | {
      readonly ok: false
      readonly error: 'lease-denied' | 'write-failed'
      readonly reason: string
    }

export type RecordChange = {
  readonly category: RecordCategory
  readonly key: string
  readonly change: 'new' | 'co-holder'
  readonly record: StoredRecord
}

/** Kopia replaya rekordu: jedna na klucz, nie podlega rotacji ostatnich skoków. */
export function recordReplayId(key: string): string {
  return `record:${key}`
}

/**
 * P29 — jedna polityka dla wszystkich kategorii, w transakcji wywołującego.
 * Nowy rekord z nagranym skokiem zapisuje kopię replaya (`kind: 'record'`).
 */
async function applyRecords(
  transaction: IDBTransaction,
  candidate: RecordCandidate,
  result: { readonly resultId: string; readonly participantId: string; readonly totalTenths: number },
  replay: StoredReplay | null,
  nowMs: number,
): Promise<RecordChange[]> {
  if (!isRecordEligible(candidate)) return []
  const records = transaction.objectStore(STORE.records)
  const changes: RecordChange[] = []
  for (const target of recordTargets(candidate)) {
    const previous = (await request(records.get(target.key))) as StoredRecord | undefined
    const next = nextRecord(previous, {
      key: target.key,
      distanceHalfMeters: candidate.distanceHalfMeters,
      totalTenths: result.totalTenths,
      participantId: result.participantId,
      participantName: candidate.participantName ?? result.participantId,
      resultId: result.resultId,
      establishedAtMs: nowMs,
      versions: candidate.versions,
      category: target.category,
      scope: target.scope,
      ...(candidate.hillId ? { hillId: candidate.hillId } : {}),
    })
    if (!next) continue
    let record = next.record
    if (next.change === 'new' && replay) {
      const replayId = recordReplayId(target.key)
      transaction.objectStore(STORE.replays).put({ ...replay, id: replayId, kind: 'record' } satisfies StoredReplay)
      record = { ...record, replayId }
    }
    records.put(record)
    changes.push({ category: target.category, key: target.key, change: next.change, record })
  }
  return changes
}

export type TrainingCommitInput = {
  readonly candidate: RecordCandidate
  readonly result: { readonly resultId: string; readonly participantId: string; readonly totalTenths: number }
  readonly replay: StoredReplay | null
  readonly nowMs: number
}

/**
 * P29 — skok treningowy nie tworzy sesji ani wyniku konkursu; zapisuje tylko
 * rekord treningowy (i kopię replaya rekordu) w jednej transakcji.
 */
export async function commitTrainingJump(db: IDBDatabase, input: TrainingCommitInput): Promise<readonly RecordChange[]> {
  const transaction = db.transaction([STORE.records, STORE.replays], 'readwrite')
  const settled = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Transakcja przerwana.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Błąd transakcji.'))
  })
  const changes = await applyRecords(transaction, { ...input.candidate, context: 'training' }, input.result, input.replay, input.nowMs)
  await settled
  return changes
}

/** Wszystkie rekordy (także archiwalnych wersji); uszkodzone wpisy są pomijane, nie kasowane. */
export async function loadRecords(db: IDBDatabase): Promise<readonly StoredRecord[]> {
  const transaction = db.transaction([STORE.records], 'readonly')
  const all = (await request(transaction.objectStore(STORE.records).getAll())) as unknown[]
  return all.filter((entry): entry is StoredRecord => {
    if (typeof entry !== 'object' || entry === null) return false
    const record = entry as Partial<StoredRecord>
    return typeof record.key === 'string' && Number.isInteger(record.distanceHalfMeters)
      && typeof record.versions === 'object' && record.versions !== null
  })
}

/** Wyniki konkursowe do statystyk (P29); wpisy bez wyniku są pomijane. */
export async function loadResults(db: IDBDatabase): Promise<readonly StoredResult[]> {
  const transaction = db.transaction([STORE.results], 'readonly')
  const all = (await request(transaction.objectStore(STORE.results).getAll())) as unknown[]
  return all.filter((entry): entry is StoredResult => {
    const result = (entry as Partial<StoredResult> | null)?.result
    return typeof result === 'object' && result !== null && typeof result.participantId === 'string'
  })
}

export async function loadReplay(db: IDBDatabase, id: string): Promise<StoredReplay | null> {
  const transaction = db.transaction([STORE.replays], 'readonly')
  const raw = await request(transaction.objectStore(STORE.replays).get(id))
  const validated = validateStoredReplay(raw)
  return validated.ok ? validated.value : null
}

/**
 * Jedna transakcja: lease, wynik, sesja, statystyki, ewentualny rekord i replay.
 * Wszystko albo nic — przerwanie w środku nie zostawia połowy zapisu.
 */
export async function commitAttempt(
  db: IDBDatabase,
  input: CommitInput,
  hooks: CommitHooks = {},
): Promise<CommitOutcome> {
  const ttlMs = input.leaseTtlMs ?? LEASE_TTL_MS
  let applied = false
  let recordUpdated = false
  let recordChanges: RecordChange[] = []
  let leaseDeniedBy: string | null = null
  let failure: unknown = null

  try {
    const transaction = db.transaction(ALL_STORES as string[], 'readwrite')
    const settled = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('Transakcja przerwana.'))
      transaction.onerror = () => reject(transaction.error ?? new Error('Błąd transakcji.'))
    })

    const work = (async () => {
      const leases = transaction.objectStore(STORE.leases)
      const existingLease = (await request(leases.get(input.session.id))) as SessionLeaseRecord | undefined
      if (existingLease && existingLease.ownerId !== input.ownerId && existingLease.expiresAtMs > input.nowMs) {
        leaseDeniedBy = existingLease.ownerId
        transaction.abort()
        return
      }
      leases.put({
        sessionId: input.session.id,
        ownerId: input.ownerId,
        acquiredAtMs: existingLease?.ownerId === input.ownerId ? existingLease.acquiredAtMs : input.nowMs,
        expiresAtMs: input.nowMs + ttlMs,
      } satisfies SessionLeaseRecord)

      const sessions = transaction.objectStore(STORE.sessions)
      const results = transaction.objectStore(STORE.results)
      const stored = (await request(sessions.get(input.session.id))) as StoredSession | undefined
      // Ponowienie starszej transakcji uzupełnia brakujący wynik, ale nigdy
      // nie cofa postępu sesji zapisanego przez nowszą rewizję.
      const sessionIsCurrent = !stored || stored.revision <= input.session.revision

      if (input.result) {
        const duplicate = (await request(results.get(input.result.resultId))) as StoredResult | undefined
        if (duplicate) {
          // Powtórzenie tej samej operacji: wynik, rekord i statystyka pozostają jedne.
          if (sessionIsCurrent) sessions.put(input.session)
          return
        }
        results.put({
          resultId: input.result.resultId,
          sessionId: input.session.id,
          savedAtMs: input.nowMs,
          result: input.result,
        } satisfies StoredResult)
        hooks.afterResultWrite?.()

        if (input.recordCandidate) {
          const changes = await applyRecords(transaction, input.recordCandidate, input.result, input.replay, input.nowMs)
          recordUpdated = changes.some((change) => change.category === 'competition')
          recordChanges = changes
        }

        const replay = input.replay
        if (replay) {
          const replays = transaction.objectStore(STORE.replays)
          replays.put(replay)
          const all = (await request(replays.getAll())) as StoredReplay[]
          const automatic = all
            .filter((entry) => entry.kind === 'auto' && entry.id !== replay.id)
            .sort((left, right) => right.createdAtMs - left.createdAtMs)
          for (const stale of automatic.slice(REPLAY_LIMITS.automaticKeep - 1)) replays.delete(stale.id)
        }
        applied = true
      }

      if (sessionIsCurrent) sessions.put(input.session)
      if (input.season) {
        const seasons = transaction.objectStore(STORE.seasons)
        const storedSeason = (await request(seasons.get(input.season.id))) as StoredSeason | undefined
        if (!storedSeason || storedSeason.revision <= input.season.revision) seasons.put(input.season)
      }
    })().catch((cause: unknown) => {
      // Każda awaria w środku przerywa całość; połowa transakcji nigdy nie trafia na dysk.
      failure = cause
      try {
        transaction.abort()
      } catch {
        /* transakcja już zamknięta */
      }
    })

    await work
    await settled.catch((cause: unknown) => {
      failure ??= cause
    })
    if (leaseDeniedBy) {
      return { ok: false, error: 'lease-denied', reason: `sesję zapisuje karta ${leaseDeniedBy}` }
    }
    if (failure) return { ok: false, error: 'write-failed', reason: describe(failure) }
    return { ok: true, applied, revision: input.session.revision, recordUpdated, recordChanges }
  } catch (cause) {
    if (leaseDeniedBy) {
      return { ok: false, error: 'lease-denied', reason: `sesję zapisuje karta ${leaseDeniedBy}` }
    }
    return { ok: false, error: 'write-failed', reason: describe(cause) }
  }
}

function describe(cause: unknown): string {
  if (cause instanceof DOMException) return `${cause.name}: ${cause.message}`
  if (cause instanceof Error) return cause.message
  return String(cause)
}

export type LoadedSession =
  | { readonly kind: 'none' }
  | { readonly kind: 'ok'; readonly session: StoredSession }
  | { readonly kind: 'rejected'; readonly reason: string }

/** Uszkodzony lub nieznany format jest odrzucony; poprawne dane pozostają na dysku. */
export async function loadSession(db: IDBDatabase, sessionId: string): Promise<LoadedSession> {
  const transaction = db.transaction([STORE.sessions], 'readonly')
  const raw = await request(transaction.objectStore(STORE.sessions).get(sessionId))
  if (raw === undefined) return { kind: 'none' }
  const validated = validateStoredSession(raw)
  return validated.ok ? { kind: 'ok', session: validated.value } : { kind: 'rejected', reason: validated.reason }
}

export async function loadLatestReplay(db: IDBDatabase): Promise<
  { readonly kind: 'none' } | { readonly kind: 'ok'; readonly replay: StoredReplay } | { readonly kind: 'rejected'; readonly reason: string }
> {
  const transaction = db.transaction([STORE.replays], 'readonly')
  const all = (await request(transaction.objectStore(STORE.replays).getAll())) as unknown[]
  if (all.length === 0) return { kind: 'none' }
  const ordered = [...all].sort(
    (left, right) => Number((right as StoredReplay).createdAtMs ?? 0) - Number((left as StoredReplay).createdAtMs ?? 0),
  )
  let lastReason = 'brak poprawnego replaya'
  for (const candidate of ordered) {
    const validated = validateStoredReplay(candidate)
    if (validated.ok) return { kind: 'ok', replay: validated.value }
    lastReason = validated.reason
  }
  return { kind: 'rejected', reason: lastReason }
}

/** Poza konkursem (start/porzucenie sezonu) zapis sezonu jest osobną transakcją. */
export function saveSeason(db: IDBDatabase, season: StoredSeason): Promise<void> {
  return putOne(db, STORE.seasons, season, 'Nie zapisano sezonu.')
}

export function saveCalendar(db: IDBDatabase, calendar: StoredCalendar): Promise<void> {
  return putOne(db, STORE.calendars, calendar, 'Nie zapisano kalendarza.')
}

function putOne(db: IDBDatabase, store: string, value: unknown, failure: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([store], 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error(failure))
    transaction.onerror = () => reject(transaction.error ?? new Error(failure))
    transaction.objectStore(store).put(value)
  })
}

/** Wszystkie poprawne sezony; uszkodzone rekordy są pomijane, nie kasowane. */
export async function loadSeasons(db: IDBDatabase): Promise<{ readonly seasons: readonly StoredSeason[]; readonly rejected: number }> {
  const transaction = db.transaction([STORE.seasons], 'readonly')
  const all = (await request(transaction.objectStore(STORE.seasons).getAll())) as unknown[]
  const seasons: StoredSeason[] = []
  let rejected = 0
  for (const raw of all) {
    const validated = validateStoredSeason(raw)
    if (validated.ok) seasons.push(validated.value)
    else rejected += 1
  }
  return { seasons, rejected }
}

export async function loadCalendar(db: IDBDatabase, id: string): Promise<LoadedCalendar> {
  const transaction = db.transaction([STORE.calendars], 'readonly')
  const raw = await request(transaction.objectStore(STORE.calendars).get(id))
  if (raw === undefined) return { kind: 'none' }
  const validated = validateStoredCalendar(raw)
  return validated.ok ? { kind: 'ok', calendar: validated.value } : { kind: 'rejected', reason: validated.reason }
}

export type LoadedCalendar =
  | { readonly kind: 'none' }
  | { readonly kind: 'ok'; readonly calendar: StoredCalendar }
  | { readonly kind: 'rejected'; readonly reason: string }

export async function loadOfficialRecord(db: IDBDatabase, key: string): Promise<StoredRecord | undefined> {
  const transaction = db.transaction([STORE.records], 'readonly')
  return (await request(transaction.objectStore(STORE.records).get(key))) as StoredRecord | undefined
}

export async function countStore(db: IDBDatabase, store: string): Promise<number> {
  const transaction = db.transaction([store], 'readonly')
  return request(transaction.objectStore(store).count())
}
