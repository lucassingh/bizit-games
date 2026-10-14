/**
 * Traducción del puntaje a "negocio" (docs/02 §4).
 * Funciones puras: se testean en scoring.test.ts.
 */

export type Level = "Drive" | "Foundation" | "Evolution";

export const LEVEL_COPY: Record<Level, { title: string; phrase: string }> = {
  Drive: { title: "Drive", phrase: "Tu empresa está lista para su primer agente." },
  Foundation: { title: "Foundation", phrase: "Tenés madera de equipo multi-agente." },
  Evolution: { title: "Evolution", phrase: "Nivel corporativo: IA a escala en toda tu operación." },
};

/** Divisor puntaje → horas ahorradas/mes. Ajustable para que el rango quede entre ~40 y ~300 h. */
export const HOURS_DIVISOR = 40;

export function hoursSaved(score: number): number {
  return Math.max(8, Math.round(score / HOURS_DIVISOR));
}

/**
 * Combo: resolver otro dentro de la ventana multiplica x2, x3, x4 (máximo).
 * Devuelve el nuevo combo dado el tiempo desde el último acierto.
 */
export const COMBO_WINDOW = 1.5;
export const COMBO_MAX = 4;
export function nextCombo(current: number, sinceLastHit: number): number {
  if (sinceLastHit <= COMBO_WINDOW) return Math.min(COMBO_MAX, current + 1);
  return 1;
}

/**
 * Nivel de madurez por percentil del día (tercios). Con pocos datos del día
 * usa umbrales fijos de respaldo para que el resultado siempre tenga sentido.
 */
export function levelFor(score: number, todayScores: number[], fallback = { foundation: 2500, evolution: 5000 }): Level {
  const others = todayScores.filter((s) => Number.isFinite(s));
  if (others.length < 6) {
    if (score >= fallback.evolution) return "Evolution";
    if (score >= fallback.foundation) return "Foundation";
    return "Drive";
  }
  const below = others.filter((s) => s < score).length;
  const pct = below / others.length;
  if (pct >= 2 / 3) return "Evolution";
  if (pct >= 1 / 3) return "Foundation";
  return "Drive";
}

/** Posición (1-based) del puntaje entre los del día. */
export function rankOf(score: number, todayScores: number[]): number {
  return todayScores.filter((s) => s > score).length + 1;
}
