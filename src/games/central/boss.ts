import { COLORS } from "@/lib/brand";
import { drawCaosFace, drawCaosScreenFrame, drawPaperTornado, SCREEN_HALF, type CaosFace } from "../shared/caos";

/**
 * El Caos Operativo, jefe final del juego 3: una nave nodriza ancha, como en los
 * clásicos de naves. Casco oscuro con la cara-pantalla al centro (su punto
 * débil), compuertas por donde larga las tareas, una boca que escupe abanicos,
 * propulsores y el torbellino de papeles de siempre girando arriba.
 * Coordenadas locales: (0, 0) es el centro del casco; mide 2·HALF_W de ancho.
 */

export const HALF_W = 440;
/** Mitad del ancho de la cara-pantalla: los disparos ahí hacen el doble de daño. */
export const CORE_HALF = SCREEN_HALF;
/** Compuertas (x local) por donde caen las tareas. */
export const HATCHES = [-320, -170, 170, 320] as const;
/** Altura (y local) de la boca, abajo de la cara. */
export const MOUTH_Y = 92;

const TOP: [number, number][] = [
  [-440, 0],
  [-410, -36],
  [-290, -56],
  [-135, -68],
  [135, -68],
  [290, -56],
  [410, -36],
  [440, 0],
];
const BOTTOM: [number, number][] = [
  [440, 0],
  [395, 32],
  [245, 50],
  [118, 88],
  [-118, 88],
  [-245, 50],
  [-395, 32],
];

/** Borde inferior del casco (y local) a la distancia dx del centro; -999 si está afuera. */
export function hullBottom(dx: number) {
  const a = Math.abs(dx);
  if (a <= 118) return 88;
  if (a <= 245) return 88 - (38 * (a - 118)) / 127;
  if (a <= 395) return 50 - (18 * (a - 245)) / 150;
  if (a <= HALF_W) return 32 * (1 - (a - 395) / 45);
  return -999;
}

function hullPath(g: CanvasRenderingContext2D) {
  g.beginPath();
  TOP.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  for (const [x, y] of BOTTOM) g.lineTo(x, y);
  g.closePath();
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export interface BossLook extends CaosFace {
  /** Apertura de cada compuerta 0..1. */
  hatch: number[];
  /** -1 vivo; 0..1 explotando. */
  dying: number;
}

/* Lo fijo del casco se dibuja una vez en un canvas aparte (normal y furioso) y se reutiliza:
   el jefe se ve igual y cuesta una fracción por cuadro. Sin shadowBlur (es lo más caro del canvas). */
const PAD = 40;
const SPR_TOP = 112; // por encima del casco: chimeneas
const SPR_BOTTOM = 104;
const SPR_SCALE = 1.5;
const sprites = new Map<string, HTMLCanvasElement>();

function hullSprite(rage: boolean) {
  const key = rage ? "rage" : "calm";
  const hit = sprites.get(key);
  if (hit) return hit;
  const w = (HALF_W + PAD) * 2, h = SPR_TOP + SPR_BOTTOM;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * SPR_SCALE);
  c.height = Math.ceil(h * SPR_SCALE);
  const g = c.getContext("2d")!;
  g.scale(SPR_SCALE, SPR_SCALE);
  g.translate(HALF_W + PAD, SPR_TOP);

  // chimeneas
  for (const sx of [-250, 250]) {
    g.fillStyle = "#2a2338";
    g.strokeStyle = "#0A0A0C";
    g.lineWidth = 4;
    rr(g, sx - 15, -100, 30, 50, 4);
    g.fill();
    g.stroke();
    g.fillStyle = COLORS.rojo;
    g.fillRect(sx - 15, -92, 30, 6);
  }
  // sombra, relleno y contorno
  g.save();
  g.translate(0, 10);
  hullPath(g);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fill();
  g.restore();
  const hg = g.createLinearGradient(0, -70, 0, 92);
  hg.addColorStop(0, rage ? "#5a2f55" : "#4a3a6b");
  hg.addColorStop(0.45, rage ? "#331d33" : "#2a2140");
  hg.addColorStop(1, "#15121d");
  hullPath(g);
  g.fillStyle = hg;
  g.fill();
  g.save();
  hullPath(g);
  g.clip();
  // franjas de peligro en las puntas de las alas
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side * 410, 0);
    for (let k = -6; k < 6; k++) {
      g.fillStyle = k % 2 ? COLORS.naranja : "#1b1622";
      g.beginPath();
      g.moveTo(k * 14 - 30, -50);
      g.lineTo(k * 14 - 16, -50);
      g.lineTo(k * 14 + 26, 40);
      g.lineTo(k * 14 + 12, 40);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  // paneles
  g.lineWidth = 2;
  for (const px of [-345, -245, -118, 118, 245, 345]) {
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.beginPath();
    g.moveTo(px, -80);
    g.lineTo(px, 100);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.06)";
    g.beginPath();
    g.moveTo(px + 2, -80);
    g.lineTo(px + 2, 100);
    g.stroke();
  }
  // brillo del borde de arriba
  g.strokeStyle = "rgba(255,255,255,0.14)";
  g.lineWidth = 4;
  g.beginPath();
  TOP.forEach(([px, py], i) => (i ? g.lineTo(px, py + 6) : g.moveTo(px, py + 6)));
  g.stroke();
  g.restore();
  hullPath(g);
  g.strokeStyle = "#0A0A0C";
  g.lineWidth = 6;
  g.lineJoin = "round";
  g.stroke();

  // placa "CAOS S.A." y señal de peligro
  g.save();
  g.translate(-262, -22);
  g.rotate(-0.02);
  g.fillStyle = COLORS.rojo;
  g.strokeStyle = "#0A0A0C";
  g.lineWidth = 3;
  rr(g, -62, -15, 124, 30, 6);
  g.fill();
  g.stroke();
  g.fillStyle = "#fff";
  g.font = '900 17px "Archivo Black", Archivo, Arial';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("CAOS S.A.", 0, 1);
  g.restore();
  g.save();
  g.translate(262, -22);
  g.fillStyle = "#ffd027";
  g.strokeStyle = "#0A0A0C";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, -18);
  g.lineTo(20, 16);
  g.lineTo(-20, 16);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = "#0A0A0C";
  g.font = '900 20px "Archivo Black", Archivo, Arial';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("!", 0, 5);
  g.restore();

  // huecos de las compuertas
  for (const hx of HATCHES) {
    g.fillStyle = "#0A0A0C";
    rr(g, hx - 36, hullBottom(hx) - 22, 72, 22, 6);
    g.fill();
  }
  // marco de la cara-pantalla
  drawCaosScreenFrame(g, rage);
  // el sprite tarda en estar listo si la fuente todavía no cargó: no se cachea hasta que esté
  if (document.fonts?.check?.('900 17px "Archivo Black"') !== false) sprites.set(key, c);
  return c;
}

let glowSprite: HTMLCanvasElement | null = null;
/** Resplandor rojo hacia abajo (tiñe la torre), pre-dibujado. */
function glow() {
  if (glowSprite) return glowSprite;
  const c = document.createElement("canvas");
  c.width = 280;
  c.height = 140;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(140, 40, 6, 140, 40, 125);
  gr.addColorStop(0, "rgba(197,33,38,1)");
  gr.addColorStop(1, "rgba(197,33,38,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 280, 140);
  glowSprite = c;
  return c;
}

export function drawBoss(g: CanvasRenderingContext2D, x: number, y: number, tilt: number, L: BossLook) {
  const { t } = L;
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  if (L.dying >= 0) g.scale(1 + L.dying * 0.06, 1 + L.dying * 0.06);

  g.globalAlpha = L.rage ? 0.34 : 0.2;
  g.drawImage(glow(), -560, -40, 1120, 560);
  g.globalAlpha = 1;

  // torbellino de papeles (la firma del Caos), arriba al centro
  drawPaperTornado(g, t);

  // humo de las chimeneas
  for (const sx of [-250, 250]) {
    for (let k = 0; k < 5; k++) {
      const ph = (t * 0.55 + k / 5 + (sx > 0 ? 0.5 : 0)) % 1;
      g.fillStyle = `rgba(150,145,165,${0.32 * (1 - ph)})`;
      g.beginPath();
      g.arc(sx + Math.sin(ph * 6 + k) * 10, -96 - ph * 110, 9 + ph * 22, 0, Math.PI * 2);
      g.fill();
    }
  }

  // propulsores (detrás del casco)
  for (const [tx, ty] of [
    [-360, 26],
    [360, 26],
    [-210, 52],
    [210, 52],
  ] as const) {
    const f = 28 + Math.sin(t * 31 + tx) * 7;
    g.fillStyle = "rgba(247,93,0,0.55)";
    g.beginPath();
    g.moveTo(tx - 18, ty);
    g.quadraticCurveTo(tx, ty + f * 2.3, tx + 18, ty);
    g.fill();
    g.fillStyle = "#ffb020";
    g.beginPath();
    g.moveTo(tx - 12, ty);
    g.quadraticCurveTo(tx, ty + f * 1.5, tx + 12, ty);
    g.fill();
    g.fillStyle = "#fff3c4";
    g.beginPath();
    g.moveTo(tx - 6, ty);
    g.quadraticCurveTo(tx, ty + f * 0.8, tx + 6, ty);
    g.fill();
  }

  // el casco (pre-dibujado)
  const w = (HALF_W + PAD) * 2, h = SPR_TOP + SPR_BOTTOM;
  g.drawImage(hullSprite(L.rage), -(HALF_W + PAD), -SPR_TOP, w, h);

  // luces que corren por el casco
  const step = Math.floor(t * 12);
  for (let i = 0; i < 19; i++) {
    const lx = -360 + i * 40;
    if (Math.abs(lx) < 125) continue;
    const on = (step - i + 400) % 6 === 0;
    g.fillStyle = on ? "#ffd27a" : L.rage ? "#7a1a22" : "#4a2a3a";
    g.fillRect(lx - 9, 10, 18, 7);
  }

  // compuertas (se abren y brillan cuando largan una tarea)
  g.lineCap = "round";
  L.hatch.forEach((k, i) => {
    const hx = HATCHES[i];
    const by = hullBottom(hx) - 2;
    if (k > 0.02) {
      g.fillStyle = `rgba(255,170,60,${0.75 * k})`;
      g.beginPath();
      g.ellipse(hx, by - 4, 34, 14, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "#5a4a78";
    g.lineWidth = 5;
    for (const s of [-1, 1]) {
      const a = -s * k * 1.1;
      g.beginPath();
      g.moveTo(hx + s * 34, by);
      g.lineTo(hx + s * 34 - s * 32 * Math.cos(a), by - s * 32 * Math.sin(a));
      g.stroke();
    }
  });

  // luces de punta de ala
  for (const s of [-1, 1]) {
    const on = Math.sin(t * 8 + s) > 0;
    if (on) {
      g.fillStyle = "rgba(255,59,59,0.3)";
      g.beginPath();
      g.arc(s * 428, -6, 16, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = on ? "#ff3b3b" : "#5a1418";
    g.beginPath();
    g.arc(s * 428, -6, 7, 0, Math.PI * 2);
    g.fill();
  }

  // la cara-pantalla: el punto débil
  drawCaosFace(g, L);

  // humo y fuego cuando está dañado
  const smoke = (sx: number, sy: number, seed: number) => {
    for (let k = 0; k < 4; k++) {
      const ph = (t * 0.9 + k / 4 + seed) % 1;
      g.fillStyle = `rgba(70,66,80,${0.5 * (1 - ph)})`;
      g.beginPath();
      g.arc(sx + Math.sin(ph * 5 + seed * 9) * 14, sy - ph * 90, 10 + ph * 20, 0, Math.PI * 2);
      g.fill();
    }
  };
  if (L.hp < 0.66) smoke(-300, 4, 0.1);
  if (L.hp < 0.33) {
    smoke(300, 8, 0.6);
    for (let k = 0; k < 3; k++) {
      const f = 14 + Math.sin(t * 25 + k) * 5;
      g.fillStyle = k % 2 ? "#ffb020" : COLORS.naranja;
      g.beginPath();
      g.moveTo(286 + k * 10, 14);
      g.quadraticCurveTo(292 + k * 10, 14 - f * 2, 298 + k * 10, 14);
      g.fill();
    }
  }

  // destello de golpe
  if (L.flash > 0.01) {
    hullPath(g);
    g.fillStyle = `rgba(255,255,255,${Math.min(0.6, L.flash * 0.5)})`;
    g.fill();
  }
  if (L.dying >= 0 && Math.floor(t * 18) % 2 === 0) {
    hullPath(g);
    g.fillStyle = "rgba(255,240,200,0.55)";
    g.fill();
  }
  g.restore();
}
