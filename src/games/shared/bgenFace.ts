import type { Expr } from "../types";
import { COLORS, BGEN_FACE, DECAGON_PATH, MARK_PATHS } from "@/lib/brand";

/**
 * Cara LED de BGen, compartida por la UI (SVG), los juegos 2D (canvas) y el
 * juego 3D (textura de canvas). Devuelve trazos en coordenadas del isotipo (128).
 */
export interface FaceShape {
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
}

export interface FaceState {
  expr: Expr;
  /** segundos, para animaciones */
  t: number;
  /** 0..1 */
  blink: number;
  /** mirada, en unidades del visor (±6, ±3) */
  gx: number;
  gy: number;
  /** 0..1: boca hablando */
  talk: number;
}

const L = COLORS.lima;
const C = COLORS.cian;

function rr(cx: number, cy: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  return `M${cx - w / 2 + r},${cy - h / 2}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}v${-(h - 2 * r)}a${r},${r} 0 0 1 ${r},${-r}z`;
}

const circle = (cx: number, cy: number, r: number) => `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;

export function faceShapes(s: FaceState): FaceShape[] {
  const { eyes, mouth } = BGEN_FACE;
  const ox = s.gx, oy = s.gy;
  const ey = eyes.y + oy, xL = eyes.left + ox, xR = eyes.right + ox;
  const my = mouth.y + oy * 0.6, mx = mouth.x + ox * 0.8;
  const out: FaceShape[] = [];
  switch (s.expr) {
    case "curioso": {
      const h = 15 * (1 - s.blink) + 1.6;
      out.push({ d: rr(xL, ey - 1, 9, h, 3), fill: L }, { d: rr(xR, ey - 2.5, 9, h, 3), fill: L });
      out.push({ d: circle(mx, my, 3.2), stroke: L, width: 2.4 });
      break;
    }
    case "concentrado":
      out.push({ d: rr(xL, ey + 1, 11, 3.6, 1.8), fill: L }, { d: rr(xR, ey, 11, 3.6, 1.8), fill: L });
      out.push({ d: `M${mx - 2},${my}h9`, stroke: L, width: 2.6 });
      break;
    case "procesando": {
      const on = Math.floor(s.t * 3) % 2 === 0;
      out.push({ d: circle(xL, ey, 3.5), fill: on ? L : C }, { d: circle(xR, ey, 3.5), fill: on ? C : L });
      const prog = (s.t * 0.6) % 1;
      out.push({ d: `M${mx - 10},${my}h${(20 * prog).toFixed(2)}`, stroke: L, width: 3 });
      break;
    }
    case "logro":
      out.push({ d: `M${xL - 5},${ey + 3}Q${xL},${ey - 5} ${xL + 5},${ey + 3}`, stroke: L, width: 3 });
      out.push({ d: `M${xR - 5},${ey + 3}Q${xR},${ey - 5} ${xR + 5},${ey + 3}`, stroke: L, width: 3 });
      out.push({ d: `M${mx - 8},${my - 2}Q${mx},${my + 9} ${mx + 8},${my - 2}Z`, fill: L, stroke: L, width: 1.5 });
      break;
    case "mareado": {
      const k = 4;
      out.push({ d: `M${xL - k},${ey - k}l${2 * k},${2 * k}M${xL + k},${ey - k}l${-2 * k},${2 * k}`, stroke: L, width: 2.8 });
      out.push({ d: `M${xR - k},${ey - k}l${2 * k},${2 * k}M${xR + k},${ey - k}l${-2 * k},${2 * k}`, stroke: L, width: 2.8 });
      let d = `M${mx - 12},${my}`;
      for (let i = 1; i <= 24; i++) d += `L${(mx - 12 + i).toFixed(1)},${(my + Math.sin(i * 0.8 + s.t * 8) * 1.6).toFixed(2)}`;
      out.push({ d, stroke: L, width: 2.3 });
      break;
    }
    default: {
      const h = 12 * (1 - s.blink) + 1.6;
      out.push({ d: rr(xL, ey, 8, h, 2.6), fill: L }, { d: rr(xR, ey, 8, h, 2.6), fill: L });
      out.push({ d: `M${mx - 7},${my - 1}Q${mx},${my + 4} ${mx + 7},${my - 1}`, stroke: L, width: 2.6 });
    }
  }
  if (s.talk > 0 && s.expr !== "procesando" && s.expr !== "mareado") {
    const open = Math.abs(Math.sin(s.t * 16)) * 4.5 * s.talk + 1.5;
    out[out.length - 1] = { d: rr(mx, my, 10, open, open / 2), fill: L };
  }
  return out;
}

export const VISOR_PATH = rr(
  BGEN_FACE.visor.x + BGEN_FACE.visor.w / 2,
  BGEN_FACE.visor.y + BGEN_FACE.visor.h / 2,
  BGEN_FACE.visor.w,
  BGEN_FACE.visor.h,
  BGEN_FACE.visor.r,
);

/** Parpadeo automático: devuelve 0..1 dado el tiempo y el próximo parpadeo. */
export function makeBlinker() {
  let next = 1.5 + Math.random() * 2;
  let start = -9;
  return (t: number) => {
    if (t > next) {
      start = t;
      next = t + 2.2 + Math.random() * 2.4;
    }
    const bt = t - start;
    return bt < 0.16 ? Math.sin((bt / 0.16) * Math.PI) : 0;
  };
}

const markPaths2D: Path2D[] = [];
let decagon2D: Path2D | undefined;
let visor2D: Path2D | undefined;

/**
 * Dibuja a BGen en un canvas 2D, centrado en (x, y), con ancho `size`.
 * aura: 0..1, contorno cian→lima detrás del cuerpo (fases con equipo).
 */
export function drawBGen(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, face: FaceState, aura = 0) {
  if (!decagon2D) {
    decagon2D = new Path2D(DECAGON_PATH);
    visor2D = new Path2D(VISOR_PATH);
    MARK_PATHS.forEach((d) => markPaths2D.push(new Path2D(d)));
  }
  const s = size / 128;
  ctx.save();
  ctx.translate(x - 64 * s, y - 64 * s);
  ctx.scale(s, s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (aura > 0) {
    const g = ctx.createLinearGradient(0, 128, 128, 0);
    g.addColorStop(0, COLORS.cian);
    g.addColorStop(1, COLORS.lima);
    ctx.globalAlpha = 0.45 * aura;
    ctx.strokeStyle = g;
    ctx.lineWidth = 14;
    ctx.stroke(decagon2D);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = COLORS.bgenBody;
  ctx.fill(decagon2D);
  ctx.strokeStyle = COLORS.niebla;
  ctx.lineWidth = 3.6;
  markPaths2D.forEach((p) => ctx.stroke(p));
  ctx.fillStyle = COLORS.visor;
  ctx.fill(visor2D!);
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 1;
  ctx.stroke(visor2D!);
  ctx.shadowColor = COLORS.lima;
  ctx.shadowBlur = 6;
  for (const sh of faceShapes(face)) {
    const p = new Path2D(sh.d);
    if (sh.fill) {
      ctx.fillStyle = sh.fill;
      ctx.fill(p);
    }
    if (sh.stroke) {
      ctx.strokeStyle = sh.stroke;
      ctx.lineWidth = sh.width || 2.6;
      ctx.stroke(p);
    }
  }
  ctx.restore();
}
