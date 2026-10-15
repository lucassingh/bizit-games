"use client";

import { create } from "zustand";

/**
 * Audio de la app (Web Audio, sin dependencias): efectos de interfaz compartidos
 * por los tres juegos, efectos propios de cada juego y música de fondo en loop.
 * Sonidos: Kenney (CC0) en /public/audio. El estado "sonido on/off" se recuerda
 * en el dispositivo. El contexto se crea en el primer gesto del usuario.
 */

export const SFX = {
  // interfaz (todas las pantallas)
  "ui.click": "/audio/ui/click_002.ogg",
  "ui.select": "/audio/ui/select_001.ogg",
  "ui.confirm": "/audio/ui/confirmation_001.ogg",
  "ui.open": "/audio/ui/maximize_001.ogg",
  "ui.close": "/audio/ui/minimize_001.ogg",
  "ui.error": "/audio/ui/error_004.ogg",
  "ui.tick": "/audio/ui/pluck_001.ogg",
  "ui.bong": "/audio/ui/bong_001.ogg",
  "ui.question": "/audio/ui/question_001.ogg",
  "ui.start": "/audio/ui/open_001.ogg",
  // juego (comunes a los tres)
  "g.count": "/audio/j1/tone1.ogg",
  "g.go": "/audio/j1/highUp.ogg",
  "g.coin1": "/audio/j1/pepSound1.ogg",
  "g.coin2": "/audio/j1/pepSound2.ogg",
  "g.coin3": "/audio/j1/pepSound3.ogg",
  "g.coin4": "/audio/j1/pepSound4.ogg",
  "g.jump": "/audio/j1/phaserUp1.ogg",
  "g.down": "/audio/j1/phaserDown1.ogg",
  "g.power": "/audio/j1/powerUp3.ogg",
  "g.power2": "/audio/j1/powerUp8.ogg",
  "g.phase": "/audio/j1/threeTone2.ogg",
  "g.win": "/audio/j1/threeTone1.ogg",
  "g.beam": "/audio/j1/zapThreeToneUp.ogg",
  "g.fail": "/audio/j1/lowDown.ogg",
  "g.hit": "/audio/j1/impactPlank_medium_000.ogg",
  "g.tap": "/audio/j1/impactGeneric_light_001.ogg",
  "g.near": "/audio/j1/impactGlass_light_000.ogg",
  "g.bell": "/audio/j1/impactBell_heavy_000.ogg",
  "g.zap": "/audio/j1/zap1.ogg",
  "g.laser": "/audio/j1/laser4.ogg",
} as const;
export type SfxName = keyof typeof SFX;

export const MUSIC = {
  compania: "/audio/music/compania-loop.mp3",
  deploy: "/audio/music/deploy-loop.mp3",
} as const;
/** Volumen base de la música por juego (Deploy más bajo: los golpes y la goma mandan). */
export const MUSIC_LEVEL: Record<string, number> = { compania: 0.32, deploy: 0.17 };

interface AudioState {
  enabled: boolean;
  toggle: () => void;
}
const KEY = "bgc-sound";
export const useAudio = create<AudioState>((set, get) => ({
  enabled: typeof localStorage === "undefined" ? true : localStorage.getItem(KEY) !== "off",
  toggle: () => {
    const enabled = !get().enabled;
    try {
      localStorage.setItem(KEY, enabled ? "on" : "off");
    } catch {}
    set({ enabled });
    master().gain.value = enabled ? 1 : 0;
    if (enabled) unlock();
  },
}));

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function context() {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return ctx;
}
function master() {
  if (!masterGain) {
    const c = context();
    masterGain = c.createGain();
    masterGain.gain.value = useAudio.getState().enabled ? 1 : 0;
    masterGain.connect(c.destination);
    musicGain = c.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(masterGain);
  }
  return masterGain;
}

/** Reanuda el contexto (los navegadores lo arrancan suspendido hasta un gesto). */
export function unlock() {
  try {
    const c = context();
    if (c.state === "suspended") void c.resume();
    master();
  } catch {}
}

function load(url: string) {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => context().decodeAudioData(ab))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

/** Precarga (para que no haya demora en el primer sonido, y para la caché offline). */
export function preloadAudio(names: readonly SfxName[] = Object.keys(SFX) as SfxName[]) {
  if (typeof window === "undefined") return;
  try {
    for (const n of names) void load(SFX[n]);
  } catch {}
}

/** Efecto corto. `rate` cambia el tono (1 = original). */
export function sfx(name: SfxName, opts: { volume?: number; rate?: number } = {}) {
  if (typeof window === "undefined" || !useAudio.getState().enabled) return;
  try {
    const c = context();
    const out = master();
    void load(SFX[name]).then((buf) => {
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate ?? 1;
      const g = c.createGain();
      g.gain.value = opts.volume ?? 0.8;
      src.connect(g).connect(out);
      src.start();
    });
  } catch {}
}

/* ---------- música ---------- */
let musicSrc: AudioBufferSourceNode | null = null;
let musicUrl = "";
let MUSIC_VOL = 0.32;

export const music = {
  /** Arranca (o reanuda) el loop con fundido de entrada. */
  play(url: string, fadeIn = 1.2, level = 0.32) {
    if (typeof window === "undefined") return;
    try {
      MUSIC_VOL = level;
      unlock();
      const c = context();
      master();
      if (musicSrc && musicUrl === url) {
        musicGain!.gain.cancelScheduledValues(c.currentTime);
        musicGain!.gain.linearRampToValueAtTime(MUSIC_VOL, c.currentTime + fadeIn);
        return;
      }
      music.stop(0.3);
      musicUrl = url;
      void load(url).then((buf) => {
        if (!buf || musicUrl !== url) return;
        const src = c.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(musicGain!);
        src.start();
        musicSrc = src;
        musicGain!.gain.cancelScheduledValues(c.currentTime);
        musicGain!.gain.setValueAtTime(0, c.currentTime);
        musicGain!.gain.linearRampToValueAtTime(MUSIC_VOL, c.currentTime + fadeIn);
      });
    } catch {}
  },
  /** Baja el volumen (0..1 del nivel normal) sin cortar: p. ej. en la pantalla de resultado. */
  duck(k: number, secs = 0.6) {
    if (!musicGain || !ctx) return;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(MUSIC_VOL * k, ctx.currentTime + secs);
  },
  stop(fade = 0.8) {
    if (!musicSrc || !musicGain || !ctx) return;
    const src = musicSrc;
    musicSrc = null;
    musicUrl = "";
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    window.setTimeout(() => {
      try {
        src.stop();
      } catch {}
    }, fade * 1000 + 50);
  },
};

/* ---------- goma de la gomera (sintetizada: estirar sube el tono, soltar chasquea) ---------- */
let rub: { osc: OscillatorNode; osc2: OscillatorNode; lfo: OscillatorNode; lfoG: GainNode; g: GainNode; f: BiquadFilterNode } | null = null;
export const rubber = {
  start() {
    if (typeof window === "undefined" || !useAudio.getState().enabled) return;
    try {
      rubber.release(0);
      const c = context();
      const out = master();
      const osc = c.createOscillator();
      osc.type = "triangle";
      const osc2 = c.createOscillator();
      osc2.type = "sine";
      osc2.detune.value = 7;
      const lfo = c.createOscillator();
      lfo.frequency.value = 22;
      const lfoG = c.createGain();
      lfoG.gain.value = 0.35;
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 600;
      f.Q.value = 2;
      const g = c.createGain();
      g.gain.value = 0;
      lfo.connect(lfoG).connect(g.gain);
      osc.connect(f);
      osc2.connect(f);
      f.connect(g).connect(out);
      osc.start();
      osc2.start();
      lfo.start();
      rub = { osc, osc2, lfo, lfoG, g, f };
    } catch {}
  },
  /** k = 0..1 cuánto está estirada. */
  set(k: number) {
    if (!rub || !ctx) return;
    const now = ctx.currentTime;
    const fr = 70 + k * 160;
    rub.osc.frequency.setTargetAtTime(fr, now, 0.03);
    rub.osc2.frequency.setTargetAtTime(fr * 2, now, 0.03);
    rub.f.frequency.setTargetAtTime(350 + k * 700, now, 0.03);
    rub.lfo.frequency.setTargetAtTime(10 + k * 14, now, 0.05);
    rub.g.gain.setTargetAtTime(0.008 + k * 0.03, now, 0.04);
  },
  release(snap = 1) {
    if (!rub || !ctx) return;
    const r = rub;
    rub = null;
    const now = ctx.currentTime;
    r.g.gain.cancelScheduledValues(now);
    r.g.gain.setTargetAtTime(0, now, 0.02);
    window.setTimeout(() => {
      try {
        r.osc.stop();
        r.osc2.stop();
        r.lfo.stop();
      } catch {}
    }, 150);
    if (snap > 0) {
      // chasquido: ráfaga de ruido filtrada
      try {
        const c = ctx;
        const len = Math.floor(c.sampleRate * 0.12);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 700 + snap * 600;
        f.Q.value = 1.2;
        const g = c.createGain();
        g.gain.value = 0.5 + snap * 0.4;
        src.connect(f).connect(g).connect(master());
        src.start();
      } catch {}
    }
  },
};
