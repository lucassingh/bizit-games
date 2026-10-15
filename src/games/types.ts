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
  /** Momentos especiales que la app acompaña con interfaz: "charge" (desafío final: tocar rápido) y "outro" (cierre con mensaje). */
  stage(s: "charge" | "outro" | null, detail?: { title: string; text: string }): void;
  /** Vidas que quedan (los juegos que no usan vidas no lo llaman). */
  lives(n: number): void;
  /** Se acabaron las vidas: la app muestra "game over" con la opción de reintentar o ver el resultado. */
  gameOver(outcome: GameOutcome): void;
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
  /** Modo desarrollo: salta al comienzo de una fase (si el juego lo permite). */
  skipTo?(phase: PhaseIndex): void;
}

export type CreateGame = (host: HTMLElement, hooks: GameHooks, opts: GameOptions) => GameInstance;
