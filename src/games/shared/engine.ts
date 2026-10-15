import { PHASES, phaseAt, phaseStart, type PhaseIndex } from "@/lib/games";
import { nextCombo } from "@/lib/scoring";
import type { GameHooks } from "../types";

/**
 * Reloj común: 90 s divididos en Drive / Foundation / Evolution / Caos.
 * Emite el tiempo al HUD ~8 veces por segundo y avisa cada cambio de fase.
 */
export class PhaseClock {
  elapsed = 0;
  phase: PhaseIndex = 0;
  paused = false;
  done = false;
  private lastEmit = -1;

  constructor(
    private hooks: GameHooks,
    readonly duration: number,
    private onPhase?: (p: PhaseIndex) => void,
    /** true: la fase la decide el juego (setPhase), no el reloj. */
    private manual = false,
  ) {
    hooks.phase(0);
    hooks.time(duration);
  }

  get left() {
    return Math.max(0, this.duration - this.elapsed);
  }

  /** Fracción 0..1 dentro de la fase actual. */
  phaseProgress() {
    const start = this.phase === 0 ? 0 : PHASES[this.phase - 1].until * this.duration;
    const end = PHASES[this.phase].until * this.duration;
    return Math.min(1, (this.elapsed - start) / (end - start));
  }

  setPhase(p: PhaseIndex) {
    if (p === this.phase) return;
    this.phase = p;
    this.hooks.phase(p);
    this.hooks.banner(PHASES[p].title, p < 3 ? `Plan ${PHASES[p].name}` : "Último desafío");
    this.onPhase?.(p);
  }

  /** Modo desarrollo: salta al comienzo de la fase `p`, pasando por las intermedias (sus efectos se aplican). */
  jumpTo(p: PhaseIndex) {
    this.elapsed = phaseStart(p, this.duration);
    this.lastEmit = -1;
    for (let i = (this.phase + 1) as PhaseIndex; i <= p; i++) this.setPhase(i as PhaseIndex);
    this.hooks.time(this.left);
  }

  /** Termina antes de tiempo (por ejemplo, si se derrotó al jefe). */
  finish() {
    this.done = true;
    this.hooks.time(this.left);
  }

  step(dt: number): boolean {
    if (this.paused || this.done) return false;
    this.elapsed += dt;
    if (this.elapsed - this.lastEmit > 0.12) {
      this.lastEmit = this.elapsed;
      this.hooks.time(this.left);
    }
    if (!this.manual) {
      const p = phaseAt(this.elapsed, this.duration);
      if (p !== this.phase) this.setPhase(p);
    }
    if (this.elapsed >= this.duration) {
      this.done = true;
      this.hooks.time(0);
    }
    return true;
  }
}

/** Puntaje con combos (x2, x3, x4 si se acierta dentro de 1,5 s). */
export class Scorer {
  score = 0;
  combo = 1;
  private lastHit = -99;

  constructor(private hooks: GameHooks) {
    hooks.score(0, 1);
  }

  hit(points: number, t: number, comboable = true) {
    if (comboable) {
      this.combo = nextCombo(this.combo, t - this.lastHit);
      this.lastHit = t;
    }
    const gained = Math.round(points * (comboable ? this.combo : 1));
    this.score += gained;
    this.hooks.score(this.score, this.combo);
    return gained;
  }

  miss() {
    this.combo = 1;
    this.lastHit = -99;
    this.hooks.score(this.score, 1);
  }
}

export interface GestureHandlers {
  onSwipe?(dir: "left" | "right" | "up" | "down"): void;
  onTap?(x: number, y: number): void;
  onDragStart?(x: number, y: number): boolean | void;
  onDragMove?(x: number, y: number): void;
  onDragEnd?(x: number, y: number): void;
  /** Mantener apretado y deslizar hacia arriba (turbo); false al soltar. Teclado: flecha arriba sostenida. */
  onHold?(on: boolean): void;
}

/**
 * Gestos táctiles y de mouse sobre un elemento (coordenadas relativas al
 * elemento, en px CSS). Teclado: flechas = swipe, espacio = tap (útil en TV).
 */
export function bindGestures(el: HTMLElement, h: GestureHandlers) {
  let sx = 0, sy = 0, st = 0, id = -1, dragging = false, holding = false, keyHold = false;
  const rel = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const down = (e: PointerEvent) => {
    if (id !== -1) return;
    id = e.pointerId;
    [sx, sy] = rel(e);
    st = performance.now();
    dragging = !!h.onDragStart?.(sx, sy);
    el.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const [x, y] = rel(e);
    if (dragging) h.onDragMove?.(x, y);
    else if (!holding && h.onHold && sy - y > 30 && Math.abs(x - sx) < sy - y) {
      holding = true;
      h.onHold(true);
    }
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    const [x, y] = rel(e);
    if (dragging) {
      dragging = false;
      h.onDragEnd?.(x, y);
      return;
    }
    if (holding) {
      holding = false;
      h.onHold?.(false);
      return;
    }
    const dx = x - sx, dy = y - sy, dt = performance.now() - st;
    const dist = Math.hypot(dx, dy);
    if (dist > 30 && dt < 700) {
      if (Math.abs(dx) > Math.abs(dy)) h.onSwipe?.(dx > 0 ? "right" : "left");
      else h.onSwipe?.(dy > 0 ? "down" : "up");
    } else if (dist < 24) h.onTap?.(x, y);
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId === id) {
      id = -1;
      if (dragging) {
        dragging = false;
        h.onDragEnd?.(sx, sy);
      }
      if (holding) {
        holding = false;
        h.onHold?.(false);
      }
    }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") h.onSwipe?.("left");
    else if (e.key === "ArrowRight") h.onSwipe?.("right");
    else if (e.key === "ArrowUp") {
      if (h.onHold) {
        if (!keyHold) {
          keyHold = true;
          h.onHold(true);
        }
      } else h.onSwipe?.("up");
    } else if (e.key === "ArrowDown") h.onSwipe?.("down");
    else if (e.key === " " || e.key === "Enter") {
      const r = el.getBoundingClientRect();
      h.onTap?.(r.width / 2, r.height / 2);
    } else return;
    e.preventDefault();
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
  const keyUp = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" && keyHold) {
      keyHold = false;
      h.onHold?.(false);
    }
  };
  window.addEventListener("keydown", key);
  window.addEventListener("keyup", keyUp);
  return () => {
    window.removeEventListener("keyup", keyUp);
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key);
  };
}

/** Generador pseudoaleatorio con semilla (niveles iguales para todos → ranking justo). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Canvas 2D que se ajusta al tamaño del contenedor con devicePixelRatio. */
export function fitCanvas(host: HTMLElement) {
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const state = { w: 0, h: 0, dpr: 1 };
  const resize = () => {
    const r = host.getBoundingClientRect();
    state.dpr = Math.min(devicePixelRatio || 1, 2);
    state.w = Math.max(1, r.width);
    state.h = Math.max(1, r.height);
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  return {
    canvas,
    ctx,
    state,
    dispose() {
      ro.disconnect();
      canvas.remove();
    },
  };
}

/** Texto flotante de puntos (+100) para canvas 2D. */
export class Popups {
  items: { x: number; y: number; text: string; t: number; color: string }[] = [];
  add(x: number, y: number, text: string, color = "#F75D00") {
    this.items.push({ x, y, text, t: 0, color });
  }
  draw(ctx: CanvasRenderingContext2D, dt: number, scale = 1) {
    ctx.save();
    ctx.textAlign = "center";
    for (const p of this.items) {
      p.t += dt;
      const a = Math.max(0, 1 - p.t / 0.9);
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.round(30 * scale)}px "Archivo Black", Arial`;
      ctx.lineWidth = 6 * scale;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(p.text, p.x, p.y - p.t * 60 * scale);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - p.t * 60 * scale);
    }
    ctx.restore();
    this.items = this.items.filter((p) => p.t < 0.9);
  }
}
