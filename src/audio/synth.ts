/**
 * PKG-016 / P31 — autorska synteza dźwięków gry (brak zewnętrznych próbek).
 *
 * Każdy efekt i pętla muzyczna to deterministycznie wyliczony bufor PCM
 * (mono, float32). Brzmienie nawiązuje do kart dźwiękowych epoki DOS: fala
 * prostokątna i trójkątna, szum, proste obwiednie. Pochodzenie i licencja:
 * `docs/audio/MANIFEST.md` (wszystko wygenerowane przez kod projektu).
 */

export type SfxId =
  | 'select' | 'confirm' | 'back'
  | 'lightRed' | 'lightYellow' | 'lightGreen'
  | 'takeoff' | 'telemark' | 'parallel' | 'contact' | 'fall' | 'brake'
  | 'result' | 'record' | 'podium' | 'cheer'

export type MusicId = 'menu' | 'setup' | 'podium'
export type LoopId = 'slide' | 'wind' | 'crowd'

/** Kategoria suwaka głośności (ART_UI_AUDIO §9: master, efekty, publiczność, muzyka). */
export const SFX_CATEGORY: Readonly<Record<SfxId, 'sfx' | 'crowd'>> = {
  select: 'sfx', confirm: 'sfx', back: 'sfx',
  lightRed: 'sfx', lightYellow: 'sfx', lightGreen: 'sfx',
  takeoff: 'sfx', telemark: 'sfx', parallel: 'sfx', contact: 'sfx', fall: 'sfx', brake: 'sfx',
  result: 'sfx', record: 'sfx', podium: 'sfx', cheer: 'crowd',
}

export const LOOP_CATEGORY: Readonly<Record<LoopId, 'sfx' | 'crowd'>> = { slide: 'sfx', wind: 'sfx', crowd: 'crowd' }

/** Deterministyczny szum (xorshift32) — ten sam bufor przy każdym uruchomieniu. */
function noiseSource(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) / 0xffffffff) * 2 - 1
  }
}

function square(phase: number): number {
  return phase % 1 < 0.5 ? 1 : -1
}

function triangle(phase: number): number {
  const t = phase % 1
  return t < 0.5 ? t * 4 - 1 : 3 - t * 4
}

type Tone = {
  readonly from: number
  readonly to?: number
  readonly start: number
  readonly duration: number
  readonly volume: number
  readonly wave: 'square' | 'triangle' | 'noise'
}

/** Suma tonów z obwiednią atak/zanik; częstotliwość przesuwa się wykładniczo. */
function renderTones(tones: readonly Tone[], sampleRate: number, seed = 1): Float32Array {
  const length = Math.ceil(Math.max(...tones.map((tone) => tone.start + tone.duration)) * sampleRate) + 1
  const out = new Float32Array(length)
  const noise = noiseSource(seed)
  for (const tone of tones) {
    const first = Math.floor(tone.start * sampleRate)
    const count = Math.floor(tone.duration * sampleRate)
    const attack = Math.max(1, Math.floor(0.005 * sampleRate))
    let phase = 0
    let held = 0
    for (let index = 0; index < count; index += 1) {
      const t = index / count
      const frequency = tone.to ? tone.from * (tone.to / tone.from) ** t : tone.from
      phase += frequency / sampleRate
      const envelope = Math.min(1, index / attack) * (1 - t) ** 1.6
      let value: number
      if (tone.wave === 'noise') {
        // Szum próbkowany z częstotliwością tonu: wyższa = jaśniejszy syk.
        if (index % Math.max(1, Math.round(sampleRate / frequency)) === 0) held = noise()
        value = held
      } else {
        value = tone.wave === 'square' ? square(phase) : triangle(phase)
      }
      out[first + index] = (out[first + index] ?? 0) + value * tone.volume * envelope
    }
  }
  return out
}

const NOTE = (semitonesFromA4: number): number => 440 * 2 ** (semitonesFromA4 / 12)

export function renderSfx(id: SfxId, sampleRate: number): Float32Array {
  const tones: Record<SfxId, readonly Tone[]> = {
    select: [{ from: 660, start: 0, duration: 0.035, volume: 0.18, wave: 'square' }],
    confirm: [
      { from: 523, start: 0, duration: 0.05, volume: 0.18, wave: 'square' },
      { from: 784, start: 0.05, duration: 0.07, volume: 0.18, wave: 'square' },
    ],
    back: [
      { from: 523, start: 0, duration: 0.05, volume: 0.16, wave: 'square' },
      { from: 392, start: 0.05, duration: 0.07, volume: 0.16, wave: 'square' },
    ],
    lightRed: [{ from: 330, start: 0, duration: 0.18, volume: 0.2, wave: 'square' }],
    lightYellow: [{ from: 440, start: 0, duration: 0.18, volume: 0.2, wave: 'square' }],
    lightGreen: [{ from: 880, start: 0, duration: 0.32, volume: 0.22, wave: 'square' }],
    takeoff: [
      { from: 180, to: 520, start: 0, duration: 0.12, volume: 0.25, wave: 'square' },
      { from: 2000, to: 800, start: 0, duration: 0.18, volume: 0.12, wave: 'noise' },
    ],
    telemark: [
      { from: 900, to: 300, start: 0, duration: 0.16, volume: 0.28, wave: 'noise' },
      { from: 110, to: 70, start: 0, duration: 0.14, volume: 0.3, wave: 'triangle' },
    ],
    parallel: [
      { from: 700, to: 250, start: 0, duration: 0.2, volume: 0.3, wave: 'noise' },
      { from: 95, to: 60, start: 0, duration: 0.16, volume: 0.34, wave: 'triangle' },
    ],
    contact: [{ from: 140, to: 80, start: 0, duration: 0.12, volume: 0.3, wave: 'triangle' }],
    fall: [
      { from: 1200, to: 120, start: 0, duration: 0.55, volume: 0.3, wave: 'noise' },
      { from: 90, to: 40, start: 0.02, duration: 0.3, volume: 0.35, wave: 'triangle' },
    ],
    brake: [{ from: 3000, to: 900, start: 0, duration: 0.7, volume: 0.18, wave: 'noise' }],
    result: [
      { from: 392, start: 0, duration: 0.09, volume: 0.16, wave: 'square' },
      { from: 523, start: 0.09, duration: 0.14, volume: 0.16, wave: 'square' },
    ],
    record: [0, 4, 7, 12, 7, 12].map((step, index) => ({
      from: NOTE(3 + step), start: index * 0.09, duration: index === 5 ? 0.35 : 0.1, volume: 0.18, wave: 'square' as const,
    })),
    podium: [0, 0, 4, 7, 5, 9, 12].map((step, index) => ({
      from: NOTE(-2 + step), start: index * 0.12, duration: index === 6 ? 0.6 : 0.13, volume: 0.17, wave: 'square' as const,
    })),
    cheer: [
      { from: 2600, start: 0, duration: 1.6, volume: 0.22, wave: 'noise' },
      { from: 1400, start: 0.1, duration: 1.4, volume: 0.18, wave: 'noise' },
    ],
  }
  return renderTones(tones[id], sampleRate, id.length * 7919)
}

/** Pętle ciągłe: 2 s szumu; barwę i głośność ustawia filtr i wzmocnienie w locie. */
export function renderLoop(id: LoopId, sampleRate: number): Float32Array {
  const length = Math.floor(sampleRate * 2)
  const out = new Float32Array(length)
  const noise = noiseSource(id === 'slide' ? 11 : id === 'wind' ? 23 : 37)
  let low = 0
  for (let index = 0; index < length; index += 1) {
    const value = noise()
    // Publiczność: wolno falujący, przytłumiony szum; ślizg i wiatr: surowy szum pod filtr.
    low += (value - low) * (id === 'crowd' ? 0.08 : 0.5)
    const swell = id === 'crowd' ? 0.7 + 0.3 * Math.sin((index / length) * Math.PI * 4) : 1
    out[index] = low * swell * 0.5
  }
  // Płynne sklejenie końca z początkiem (bez trzasku przy zapętleniu).
  const fade = Math.floor(sampleRate * 0.05)
  for (let index = 0; index < fade; index += 1) {
    const mix = index / fade
    out[length - fade + index] = out[length - fade + index]! * (1 - mix) + out[index]! * mix
  }
  return out
}

/** Trzy krótkie, zapętlone motywy: menu, konfiguracja, podium (tempo i skala się różnią). */
export function renderMusic(id: MusicId, sampleRate: number): Float32Array {
  const spec = {
    // [kroki melodii względem A4, basu, długość kroku w s]
    menu: { melody: [0, 3, 7, 10, 7, 3, 5, 8, 12, 8, 5, 3, 2, 5, 7, 3], bass: [-24, -24, -19, -19, -21, -21, -17, -17], step: 0.2 },
    setup: { melody: [0, 0, 7, 5, 3, 3, 10, 7, 5, 5, 3, 2, 0, 2, 3, 7], bass: [-24, -21, -19, -17, -24, -21, -19, -14], step: 0.24 },
    podium: { melody: [0, 4, 7, 12, 11, 7, 4, 7, 5, 9, 12, 17, 16, 12, 9, 12], bass: [-24, -24, -20, -20, -19, -19, -17, -12], step: 0.18 },
  }[id]
  const bar = spec.melody.length * spec.step
  const tones: Tone[] = []
  for (let repeat = 0; repeat < 2; repeat += 1) {
    spec.melody.forEach((step, index) => tones.push({
      from: NOTE(step + 3), start: repeat * bar + index * spec.step, duration: spec.step * 0.9, volume: 0.09, wave: 'square',
    }))
    spec.bass.forEach((step, index) => tones.push({
      from: NOTE(step + 3), start: repeat * bar + index * spec.step * 2, duration: spec.step * 1.9, volume: 0.14, wave: 'triangle',
    }))
  }
  const rendered = renderTones(tones, sampleRate)
  // Dokładna długość dwóch taktów (dopełniona ciszą): pętla wraca bez przesunięcia rytmu.
  const loop = new Float32Array(Math.floor(bar * 2 * sampleRate))
  loop.set(rendered.subarray(0, loop.length))
  return loop
}
