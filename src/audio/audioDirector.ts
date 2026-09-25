/**
 * PKG-016 / P31 — jeden właściciel dźwięku gry.
 *
 * Graf: źródła → szyna kategorii (efekty / publiczność / muzyka) → master →
 * wyjście. Dźwięk startuje dopiero po działaniu gracza (autoplay); przy
 * odmowie przeglądarki gra działa dalej bez dźwięku. Pętle ślizgu, wiatru
 * i publiczności są uruchamiane raz i tylko strojone (nie restartują się co
 * klatkę); jednorazowe efekty mają limit głosów. Pauza wycisza wszystko.
 */

import {
  LOOP_CATEGORY,
  renderLoop,
  renderMusic,
  renderSfx,
  SFX_CATEGORY,
  type LoopId,
  type MusicId,
  type SfxId,
} from './synth'

export type AudioLevels = {
  /** 0–100 */
  readonly master: number
  readonly sfx: number
  readonly crowd: number
  readonly music: number
}

type Category = 'sfx' | 'crowd' | 'music'

/** Maksymalna liczba jednoczesnych efektów jednorazowych (pętle i muzyka osobno). */
export const MAX_VOICES = 12
const SAMPLE_RATE = 22_050
const RAMP_SECONDS = 0.08

type LoopVoice = {
  readonly source: AudioBufferSourceNode
  readonly filter: BiquadFilterNode
  readonly gain: GainNode
  level: number
  brightness: number
}

/** Poniżej tej zmiany parametr pętli nie jest przestawiany (bez zalewu automatyki co klatkę). */
const LOOP_EPSILON = 0.02

export class AudioDirector {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private buses: Partial<Record<Category, GainNode>> = {}
  private readonly buffers = new Map<string, AudioBuffer>()
  private readonly voices: AudioBufferSourceNode[] = []
  private readonly loops = new Map<LoopId, LoopVoice>()
  private music: { readonly id: MusicId; readonly source: AudioBufferSourceNode } | null = null
  private levels: AudioLevels = { master: 100, sfx: 100, crowd: 70, music: 60 }
  private paused = false
  /** Ile razy odtworzono efekt — diagnostyka testów i snapshotu debug. */
  playedCount = 0

  constructor(private readonly createContext: () => AudioContext | null) {}

  get running(): boolean {
    return this.context?.state === 'running'
  }

  get activeVoices(): number {
    return this.voices.length
  }

  get activeLoops(): readonly LoopId[] {
    return [...this.loops.keys()]
  }

  get musicId(): MusicId | null {
    return this.music?.id ?? null
  }

  /** Wywoływane z gestu gracza. Zwraca `false` przy braku Web Audio lub odmowie. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.context) {
        const created = this.createContext()
        if (!created) return false
        this.context = created
      }
      // Najpierw zgoda przeglądarki (autoplay), potem graf — odmowa nie zostawia połowy grafu.
      await this.context.resume()
      if (!this.master) {
        const context = this.context
        this.master = context.createGain()
        this.master.connect(context.destination)
        for (const category of ['sfx', 'crowd', 'music'] as const) {
          const bus = context.createGain()
          bus.connect(this.master)
          this.buses[category] = bus
        }
        this.applyLevels()
      }
      return this.running
    } catch {
      return false
    }
  }

  setLevels(levels: AudioLevels): void {
    const same = levels.master === this.levels.master && levels.sfx === this.levels.sfx
      && levels.crowd === this.levels.crowd && levels.music === this.levels.music
    if (same) return
    this.levels = levels
    this.applyLevels()
  }

  /** Pauza gry: płynne wyciszenie całości; wznowienie przywraca poziomy. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return
    this.paused = paused
    this.applyLevels()
  }

  private applyLevels(): void {
    const context = this.context
    if (!context || !this.master) return
    const now = context.currentTime
    const target = this.paused ? 0 : this.levels.master / 100
    this.master.gain.setTargetAtTime(target, now, RAMP_SECONDS / 3)
    for (const category of ['sfx', 'crowd', 'music'] as const) {
      this.buses[category]?.gain.setTargetAtTime(this.levels[category] / 100, now, RAMP_SECONDS / 3)
    }
  }

  private buffer(key: string, render: () => Float32Array): AudioBuffer | null {
    const context = this.context
    if (!context) return null
    const cached = this.buffers.get(key)
    if (cached) return cached
    const samples = render()
    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE)
    buffer.getChannelData(0).set(samples)
    this.buffers.set(key, buffer)
    return buffer
  }

  play(id: SfxId): void {
    const context = this.context
    const bus = this.buses[SFX_CATEGORY[id]]
    if (!context || !bus || !this.running || this.paused) return
    try {
      const buffer = this.buffer(`sfx:${id}`, () => renderSfx(id, SAMPLE_RATE))
      if (!buffer) return
      // Limit głosów: najstarszy efekt ustępuje nowemu.
      while (this.voices.length >= MAX_VOICES) this.stopVoice(this.voices[0]!)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(bus)
      source.onended = () => this.forgetVoice(source)
      this.voices.push(source)
      source.start()
      this.playedCount += 1
    } catch {
      // Dźwięk jest dodatkiem; błąd Web Audio nie przerywa gry.
    }
  }

  private stopVoice(source: AudioBufferSourceNode): void {
    try {
      source.stop()
    } catch {
      /* już zatrzymany */
    }
    this.forgetVoice(source)
  }

  private forgetVoice(source: AudioBufferSourceNode): void {
    const index = this.voices.indexOf(source)
    if (index >= 0) this.voices.splice(index, 1)
    source.disconnect()
  }

  /**
   * Pętle ciągłe: `level` 0–1 (0 = cisza i zatrzymanie), `brightness` 0–1
   * przestawia filtr. Wołane co klatkę — strojenie bez restartu źródła.
   */
  setLoop(id: LoopId, level: number, brightness = 0.5): void {
    const context = this.context
    const existing = this.loops.get(id)
    if (level <= 0.001) {
      if (existing) {
        existing.gain.gain.setTargetAtTime(0, context?.currentTime ?? 0, RAMP_SECONDS / 3)
        try {
          existing.source.stop((context?.currentTime ?? 0) + RAMP_SECONDS)
        } catch {
          /* już zatrzymana */
        }
        this.loops.delete(id)
      }
      return
    }
    const bus = this.buses[LOOP_CATEGORY[id]]
    if (!context || !bus || !this.running) return
    let voice = existing
    if (!voice) {
      const buffer = this.buffer(`loop:${id}`, () => renderLoop(id, SAMPLE_RATE))
      if (!buffer) return
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      const filter = context.createBiquadFilter()
      filter.type = id === 'crowd' ? 'lowpass' : 'bandpass'
      const gain = context.createGain()
      gain.gain.value = 0
      source.connect(filter).connect(gain).connect(bus)
      source.start()
      voice = { source, filter, gain, level: -1, brightness: -1 }
      this.loops.set(id, voice)
    }
    if (Math.abs(voice.level - level) < LOOP_EPSILON && Math.abs(voice.brightness - brightness) < LOOP_EPSILON) return
    voice.level = level
    voice.brightness = brightness
    const now = context.currentTime
    const base = id === 'slide' ? 500 : id === 'wind' ? 350 : 900
    const span = id === 'slide' ? 2600 : id === 'wind' ? 1800 : 600
    voice.filter.frequency.setTargetAtTime(base + span * Math.max(0, Math.min(1, brightness)), now, RAMP_SECONDS)
    voice.gain.gain.setTargetAtTime(Math.min(1, level) * 0.6, now, RAMP_SECONDS)
  }

  stopLoops(): void {
    for (const id of [...this.loops.keys()]) this.setLoop(id, 0)
  }

  /** Muzyka ekranu; ta sama wartość co klatkę nic nie robi, `null` wycisza. */
  setMusic(id: MusicId | null): void {
    if (this.music?.id === id) return
    const context = this.context
    if (this.music) {
      try {
        this.music.source.stop()
      } catch {
        /* już zatrzymana */
      }
      this.music.source.disconnect()
      this.music = null
    }
    const bus = this.buses.music
    if (!id || !context || !bus || !this.running) return
    const buffer = this.buffer(`music:${id}`, () => renderMusic(id, SAMPLE_RATE))
    if (!buffer) return
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(bus)
    source.start()
    this.music = { id, source }
  }
}
