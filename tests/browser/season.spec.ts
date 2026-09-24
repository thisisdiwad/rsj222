/**
 * PKG-014 — puchar sezonu, własny kalendarz i turniej KO wyłącznie klawiszami.
 * Człowiek rezygnuje (Q + Enter), a konkurs rozgrywają boty; to prawdziwa
 * droga gracza, bez setterów stanu. Zrzuty służą odbiorowi VISUAL użytkownika.
 */
import { expect, test, type Page } from '@playwright/test'

type SeasonDebug = {
  format: string
  hubRow: string
  message: string
  calendarChoice: string
  eventRunning: { seasonId: string; eventIndex: number } | null
  active: {
    id: string
    setKey: string
    status: string
    completedEvents: number
    totalEvents: number
    nextEvent: number | null
    calendar: string[]
    standings: { participantId: string; rank: number; value: number }[]
  } | null
  completedWithSetKey: number
  customCalendar: string[]
  editor: { events: string[]; focus: number; dirty: boolean; setKey: string; message: string }
  bracket: { pairs: number; resolved: boolean; scroll: number } | null
}

type Debug = {
  screen: string
  paused: boolean
  pauseReason: string
  menuSelection: string
  persistence: { ready: boolean }
  competition: {
    view: string
    handoverReady: boolean
    lastCompletedRound: string | null
    roundSummaryScroll: number
    variantLabel: string | null
    ko: { resolved: boolean; pairs: { winnerId: string | null }[]; luckyLosers: string[] } | null
  } | null
  season: SeasonDebug
}

const OVERLOAD_REASON = 'zbyt długa przerwa klatki'

async function snapshot(page: Page): Promise<Debug> {
  return page.evaluate(() => (window as unknown as { __retroDebugSnapshot: () => Debug }).__retroDebugSnapshot())
}

/** Czeka na stan; udokumentowaną pauzę przeciążenia wznawia Enterem jak gracz. */
async function waitFor(page: Page, predicate: (state: Debug) => boolean, description: string, timeoutMs = 60_000): Promise<Debug> {
  const deadline = Date.now() + timeoutMs
  let last: Debug | null = null
  while (Date.now() < deadline) {
    last = await snapshot(page)
    if (last.paused) {
      expect([OVERLOAD_REASON, '']).toContain(last.pauseReason)
      await page.keyboard.press('Enter')
    } else if (predicate(last)) {
      return last
    }
    await page.waitForTimeout(40)
  }
  throw new Error(`Nie osiągnięto stanu: ${description}. Ostatni: ${JSON.stringify(last)}`)
}

/** Klawisz z potwierdzeniem efektu — pauza przeciążenia może zjeść pojedyncze naciśnięcie. */
async function press(page: Page, key: string, predicate: (state: Debug) => boolean, description: string): Promise<Debug> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitFor(page, (state) => !state.paused, 'brak pauzy', 5_000)
    await page.keyboard.press(key)
    try {
      return await waitFor(page, predicate, description, 1_500)
    } catch {
      // ponów prawdziwy klawisz
    }
  }
  return waitFor(page, predicate, description, 2_000)
}

async function openMode(page: Page, target: 'cup' | 'ko'): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.keyboard.press('Enter')
  await waitFor(page, (state) => state.screen === 'menu' && state.persistence.ready, 'menu z bazą')
  // Nowe tryby są na końcu listy: ↑ z „trening” zawija na koniec (PKG-015: KotH, Super Team,
  // drużynowy), potem TURNIEJ KO i PUCHAR.
  for (const step of ['koth', 'superteam', 'team', 'ko']) {
    await press(page, 'ArrowUp', (state) => state.menuSelection === step, `menu → ${step}`)
  }
  if (target === 'cup') await press(page, 'ArrowUp', (state) => state.menuSelection === 'cup', 'menu → puchar')
  await press(page, 'Enter', (state) => state.screen === 'season', 'hub sezonu')
  await waitFor(page, (state) => state.season.format === (target === 'cup' ? 'cup' : 'four-hills'), 'format huba')
}

/** Start konkursu z huba, rezygnacja człowieka i boty do końca; zwraca do huba. */
async function playEventAsBots(page: Page, onRoundSummary?: (state: Debug) => Promise<void>): Promise<Debug> {
  await waitFor(page, (state) => state.season.hubRow === 'play', 'fokus na starcie')
  await press(page, 'Enter', (state) => state.screen === 'competition', 'start konkursu')
  await waitFor(page, (state) => state.competition?.view === 'handover' && state.competition.handoverReady, 'przekazanie klawiatury')
  await press(page, 'KeyQ', (state) => state.competition?.view === 'withdraw-confirm', 'rezygnacja')
  await press(page, 'Enter', (state) => state.competition?.view === 'result', 'potwierdzona rezygnacja')
  await press(page, 'Enter', (state) => state.competition?.view !== 'result', 'dalej po rezygnacji')
  for (let round = 0; round < 3; round += 1) {
    const state = await waitFor(
      page,
      (current) => current.competition?.view === 'round-summary' || current.competition?.view === 'finished',
      `koniec serii ${round + 1}`,
      90_000,
    )
    if (state.competition?.view === 'finished') break
    if (onRoundSummary) await onRoundSummary(state)
    await press(page, 'Enter', (current) => current.competition?.view !== 'round-summary', 'zatwierdzenie serii')
  }
  await waitFor(page, (state) => state.competition?.view === 'finished', 'wynik końcowy', 90_000)
  await page.screenshot({ path: test.info().outputPath(`${(await snapshot(page)).season.format}-event-finished-960x540.png`) })
  await press(page, 'Enter', (state) => state.screen === 'season', 'powrót do huba')
  return waitFor(page, (state) => state.season.eventRunning === null && state.season.active !== null, 'hub po konkursie')
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 })
})

test('puchar: punkty za miejsca po konkursie i wznowienie sezonu po reloadzie między konkursami', async ({ page }) => {
  test.setTimeout(240_000)
  await openMode(page, 'cup')
  const fresh = await snapshot(page)
  expect(fresh.season.active).toBeNull()
  await page.screenshot({ path: test.info().outputPath('cup-hub-new-960x540.png') })

  const afterFirst = await playEventAsBots(page)
  expect(afterFirst.season.active).toMatchObject({ completedEvents: 1, totalEvents: 4, nextEvent: 1, status: 'active' })
  // Punkty pucharowe, nie suma punktów skoków: zwycięzca ma dokładnie 100.
  expect(afterFirst.season.active!.standings[0]).toMatchObject({ rank: 1, value: 100 })
  expect(afterFirst.season.active!.standings[1]?.value).toBe(80)
  await page.waitForTimeout(300)
  await page.screenshot({ path: test.info().outputPath('cup-hub-after-event-1-960x540.png') })

  // Restart w połowie sezonu: reload, powrót klawiszami, ten sam sezon i następny konkurs.
  const seasonId = afterFirst.season.active!.id
  await openMode(page, 'cup')
  const resumed = await waitFor(page, (state) => state.season.active?.id === seasonId, 'wczytany sezon')
  expect(resumed.season.active).toMatchObject({ completedEvents: 1, nextEvent: 1 })
  expect(resumed.season.active!.standings).toEqual(afterFirst.season.active!.standings)
})

test('własny kalendarz: edycja klawiszami, klucz zależy od kolejności, zapis i powtórzenie zestawu', async ({ page }) => {
  test.setTimeout(300_000)
  await openMode(page, 'cup')
  await press(page, 'ArrowUp', (state) => state.season.hubRow === 'abandon', 'fokus: porzuć (nieaktywny)')
  await press(page, 'ArrowUp', (state) => state.season.hubRow === 'edit', 'fokus: edycja kalendarza')
  await press(page, 'Enter', (state) => state.screen === 'calendar-editor', 'edytor kalendarza')
  const initial = await snapshot(page)
  expect(initial.season.editor.events).toHaveLength(4)
  const baseKey = initial.season.editor.setKey

  const moved = await press(page, 'BracketRight', (state) => state.season.editor.focus === 1, 'przesunięcie w dół')
  expect(moved.season.editor.setKey).not.toBe(baseKey)
  expect(moved.season.editor.events.slice(0, 2)).toEqual([initial.season.editor.events[1], initial.season.editor.events[0]])
  const restored = await press(page, 'BracketLeft', (state) => state.season.editor.focus === 0, 'przesunięcie w górę')
  expect(restored.season.editor.setKey).toBe(baseKey)

  // Kalendarz jednego konkursu: X×3, potem zmiana skoczni strzałką.
  for (let count = 3; count >= 1; count -= 1) {
    await press(page, 'KeyX', (state) => state.season.editor.events.length === count, `usunięcie → ${count}`)
  }
  const oneEvent = await press(page, 'ArrowRight', (state) => state.season.editor.message.startsWith('POZYCJA 1'), 'zmiana skoczni')
  const chosen = oneEvent.season.editor.events[0]
  await page.screenshot({ path: test.info().outputPath('calendar-editor-960x540.png') })
  await press(page, 'Enter', (state) => !state.season.editor.dirty && state.season.editor.message.startsWith('ZAPISANO'), 'zapis kalendarza')
  await press(page, 'Backspace', (state) => state.screen === 'season', 'powrót do huba')
  expect((await snapshot(page)).season).toMatchObject({ calendarChoice: 'custom', customCalendar: [chosen] })

  // Zapis przeżywa reload.
  await openMode(page, 'cup')
  await waitFor(page, (state) => state.season.customCalendar.length === 1 && state.season.customCalendar[0] === chosen, 'wczytany kalendarz')

  // Powtórzenie tego samego zestawu: dwa sezony jednego konkursu, ten sam klucz i ta sama tabela.
  await press(page, 'ArrowDown', (state) => state.season.hubRow === 'calendar', 'fokus: kalendarz')
  await press(page, 'ArrowRight', (state) => state.season.calendarChoice === 'custom', 'wybór: własny')
  await press(page, 'ArrowUp', (state) => state.season.hubRow === 'play', 'fokus: start')
  const first = await playEventAsBots(page)
  expect(first.season.active).toMatchObject({ status: 'complete', completedEvents: 1, totalEvents: 1, calendar: [chosen] })
  expect(first.season.completedWithSetKey).toBe(1)
  const second = await playEventAsBots(page)
  expect(second.season.active!.id).not.toBe(first.season.active!.id)
  expect(second.season.active!.setKey).toBe(first.season.active!.setKey)
  expect(second.season.completedWithSetKey).toBe(2)
  expect(second.season.active!.standings).toEqual(first.season.active!.standings)
  await page.waitForTimeout(300)
  await page.screenshot({ path: test.info().outputPath('cup-hub-set-repeated-960x540.png') })
})

test('turniej KO: drabinka po kwalifikacjach i I serii, suma punktów skoków i ekran drabinki z huba', async ({ page }) => {
  test.setTimeout(240_000)
  await openMode(page, 'ko')
  await page.screenshot({ path: test.info().outputPath('ko-hub-new-960x540.png') })
  const hub = await playEventAsBots(page, async (state) => {
    const ko = state.competition?.ko
    expect(ko?.pairs).toHaveLength(25)
    if (state.competition?.lastCompletedRound === 'qualification') {
      expect(ko?.resolved).toBe(false)
      await page.screenshot({ path: test.info().outputPath('ko-bracket-pairs-960x540.png') })
      await press(page, 'ArrowDown', (current) => (current.competition?.roundSummaryScroll ?? 0) > 0, 'przewinięcie par')
    } else {
      expect(ko?.resolved).toBe(true)
      expect(ko?.pairs.filter((pair) => pair.winnerId !== null)).toHaveLength(25)
      expect(ko?.luckyLosers.length).toBeGreaterThanOrEqual(5)
      await page.screenshot({ path: test.info().outputPath('ko-bracket-results-960x540.png') })
    }
  })
  expect(hub.season.active).toMatchObject({ completedEvents: 1, totalEvents: 4, status: 'active' })
  // Suma punktów skoków (dziesiąte punktu), nie punkty pucharowe.
  expect(hub.season.active!.standings[0]!.value).toBeGreaterThan(1000)
  await page.waitForTimeout(300)
  await page.screenshot({ path: test.info().outputPath('ko-hub-after-event-1-960x540.png') })

  await waitFor(page, (state) => state.season.hubRow === 'play', 'fokus na starcie')
  await press(page, 'ArrowDown', (state) => state.season.hubRow === 'profiles', 'fokus: gracze')
  await press(page, 'ArrowDown', (state) => state.season.hubRow === 'difficulty', 'fokus: AI')
  await press(page, 'ArrowDown', (state) => state.season.hubRow === 'bracket', 'fokus: drabinka')
  await press(page, 'Enter', (state) => state.screen === 'ko-bracket', 'ekran drabinki')
  expect((await snapshot(page)).season.bracket).toMatchObject({ pairs: 25, resolved: true })
  await page.screenshot({ path: test.info().outputPath('ko-bracket-from-hub-960x540.png') })
  await press(page, 'Backspace', (state) => state.screen === 'season', 'wstecz do huba')
})
