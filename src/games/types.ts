import type { PhaseIndex } from "@/lib/games";

/** Expresiones de BGen (docs/08 §3). */
export type Expr = "reposo" | "curioso" | "concentrado" | "procesando" | "logro" | "mareado";

/** Eventos que un juego le manda a la app (HUD, BGen, final). */
export interface GameHooks {
  score(total: number, combo: number): void;
  phase(i: PhaseIndex): void;
  time(left: number): void;
  metric(value: string, pct: number): void;
  bgen(expr: Expr, say?: string): void;
  /** Cartel grande de "level up" (1,5 s). */
  banner(title: string, subtitle: string): void;
  /** Pista corta para el jugador ("¡Tocá rápido!"). */
  hint(text: string): void;
  end(outcome: GameOutcome): void;
}

export interface GameOutcome {
  score: number;
  metricValue: string;
  /** 0..1 de la métrica estrella, para el gráfico del resultado. */
  metricPct: number;
}

export interface GameOptions {
  durationSec: number;
  reducedMotion: boolean;
  /** "tv" agranda la cámara/UI interna del juego. */
  layout: "tv" | "tablet";
}

export interface GameInstance {
  destroy(): void;
  /** Para pruebas y para la pantalla de configuración. */
  pause?(paused: boolean): void;
}

export type CreateGame = (host: HTMLElement, hooks: GameHooks, opts: GameOptions) => GameInstance;
