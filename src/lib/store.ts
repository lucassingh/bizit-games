"use client";

import { create } from "zustand";
import type { GameId, PhaseIndex } from "./games";
import type { LeadPayload } from "./leads/types";
import type { Level } from "./scoring";
import type { Expr } from "@/games/types";

export type Screen = "attract" | "register" | "select" | "briefing" | "play" | "result";

export interface GameResult {
  game: GameId;
  score: number;
  metricLabel: string;
  metricValue: string;
  level: Level;
  stars: 1 | 2 | 3;
  hours: number;
  rank: number;
  total: number;
}

interface SessionState {
  screen: Screen;
  player?: LeadPayload;
  game?: GameId;
  result?: GameResult;
  /** Momento en que terminó la última partida (para "Jugar de nuevo" sin recargar datos). */
  lastPlayedAt?: number;
  go: (s: Screen) => void;
  setPlayer: (p: LeadPayload) => void;
  chooseGame: (g: GameId) => void;
  setResult: (r: GameResult) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set) => ({
  screen: "attract",
  go: (screen) => set({ screen }),
  setPlayer: (player) => set({ player }),
  chooseGame: (game) => set({ game }),
  setResult: (result) => set({ result, lastPlayedAt: Date.now() }),
  reset: () => set({ screen: "attract", player: undefined, game: undefined, result: undefined, lastPlayedAt: undefined }),
}));

/** Estado del HUD, alimentado por el motor del juego activo. */
interface HudState {
  score: number;
  combo: number;
  phase: PhaseIndex;
  timeLeft: number;
  duration: number;
  metricValue: string;
  /** 0..1 para la barra de la métrica estrella. */
  metricPct: number;
  /** Vidas (null = el juego no usa vidas). */
  lives: number | null;
  expr: Expr;
  say?: { text: string; id: number };
  levelUp?: { title: string; subtitle: string; id: number };
  hint?: { text: string; id: number };
  reset: (duration: number) => void;
  patch: (p: Partial<Omit<HudState, "reset" | "patch">>) => void;
}

export const useHud = create<HudState>((set) => ({
  score: 0,
  combo: 1,
  phase: 0,
  timeLeft: 90,
  duration: 90,
  metricValue: "0%",
  metricPct: 0,
  lives: null,
  expr: "reposo",
  reset: (duration) =>
    set({ score: 0, combo: 1, phase: 0, timeLeft: duration, duration, metricValue: "0%", metricPct: 0, lives: null, expr: "curioso", say: undefined, levelUp: undefined, hint: undefined }),
  // solo actualiza si algo cambió: los juegos reportan cada frame y no queremos re-render a 60 fps
  patch: (p) =>
    set((st) => {
      for (const k of Object.keys(p) as (keyof typeof p)[]) if (st[k] !== p[k]) return p;
      return st;
    }),
}));
