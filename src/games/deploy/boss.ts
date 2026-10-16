import { COLORS } from "@/lib/brand";
import { drawCaosFace, drawCaosScreenFrame, drawPaperTornado, type CaosFace } from "../shared/caos";

/**
 * El Caos Operativo en Torre del Caos: el mismo personaje que la nave del juego 3
 * (cara-pantalla, colores, franjas, placa "CAOS S.A." y torbellino de papeles),
 * adaptado a la gomera: un núcleo pesado que se apoya arriba de la torre y es un
 * cuerpo físico más (se cae, rueda y recibe daño por los golpes).
 * Coordenadas locales: (0, 0) es el centro del cuerpo; mide POD_W × POD_H.
 */

export const POD_W = 210;
export const POD_H = 112;

const HULL: [number, number][] = [
  [-105, -30],
  [-78, -56],
  [78, -56],
  [105, -30],
  [105, 32],
  [80, 56],
  [-80, 56],
  [-105, 32],
];

function hullPath(g: CanvasRenderingContext2D) {
  g.beginPath();
  HULL.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export interface PodLook extends CaosFace {
  /** Escudo visible 0..1 (mientras queden Problemones). */
  shield: number;
  /** Destello del escudo cuando algo le pega 0..1. */
  shieldHit: number;
  /** Retrocohetes encendidos 0..1 (mientras baja). */
  thrust: number;
  /** -1 vivo; 0..1 explotando. */
  dying: number;
}

export function drawCaosPod(g: CanvasRenderingContext2D, x: number, y: number, angle: number, L: PodLook) {
  const { t } = L;

  // torbellino de papeles arriba (siempre "para arriba", aunque el núcleo esté tumbado)
  g.save();
  g.translate(x, y - 40);
  g.scale(0.55, 0.55);
  drawPaperTornado(g, t);
  g.restore();

  g.save();
  g.translate(x, y);
  g.rotate(angle);
  if (L.dying >= 0) g.scale(1 + L.dying * 0.08, 1 + L.dying * 0.08);

  // retrocohetes (mientras baja del cielo)
  if (L.thrust > 0.02)
    for (const tx of [-62, 62]) {
      const f = (26 + Math.sin(t * 31 + tx) * 7) * L.thrust;
      g.fillStyle = "rgba(247,93,0,0.55)";
      g.beginPath();
      g.moveTo(tx - 16, 54);
      g.quadraticCurveTo(tx, 54 + f * 2.4, tx + 16, 54);
      g.fill();
      g.fillStyle = "#ffb020";
      g.beginPath();
      g.moveTo(tx - 10, 54);
      g.quadraticCurveTo(tx, 54 + f * 1.5, tx + 10, 54);
      g.fill();
      g.fillStyle = "#fff3c4";
      g.beginPath();
      g.moveTo(tx - 5, 54);
      g.quadraticCurveTo(tx, 54 + f * 0.8, tx + 5, 54);
      g.fill();
    }

  // casco
  g.save();
  g.translate(0, 6);
  hullPath(g);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fill();
  g.restore();
  const hg = g.createLinearGradient(0, -56, 0, 56);
  hg.addColorStop(0, L.rage ? "#5a2f55" : "#4a3a6b");
  hg.addColorStop(0.45, L.rage ? "#331d33" : "#2a2140");
  hg.addColorStop(1, "#15121d");
  hullPath(g);
  g.fillStyle = hg;
  g.fill();
  g.save();
  hullPath(g);
  g.clip();
  // franjas de peligro a los costados
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side * 96, 0);
    for (let k = -5; k < 5; k++) {
      g.fillStyle = k % 2 ? COLORS.naranja : "#1b1622";
      g.beginPath();
      g.moveTo(k * 12 - 26, -60);
      g.lineTo(k * 12 - 14, -60);
      g.lineTo(k * 12 + 22, 60);
      g.lineTo(k * 12 + 10, 60);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  // paneles y brillo de arriba
  g.lineWidth = 2;
  for (const px of [-74, 74]) {
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.beginPath();
    g.moveTo(px, -60);
    g.lineTo(px, 60);
    g.stroke();
  }
  g.strokeStyle = "rgba(255,255,255,0.14)";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-100, -26);
  g.lineTo(-75, -50);
  g.lineTo(75, -50);
  g.lineTo(100, -26);
  g.stroke();
  g.restore();
  hullPath(g);
  g.strokeStyle = "#0A0A0C";
  g.lineWidth = 5;
  g.lineJoin = "round";
  g.stroke();

  // luces que corren abajo
  const step = Math.floor(t * 12);
  for (let i = 0; i < 6; i++) {
    const on = (step - i + 400) % 6 === 0;
    g.fillStyle = on ? "#ffd27a" : L.rage ? "#7a1a22" : "#4a2a3a";
    g.fillRect(-55 + i * 20, 42, 12, 6);
  }
  // luces de los costados
  for (const s of [-1, 1]) {
    const on = Math.sin(t * 8 + s) > 0;
    if (on) {
      g.fillStyle = "rgba(255,59,59,0.3)";
      g.beginPath();
      g.arc(s * 99, 0, 12, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = on ? "#ff3b3b" : "#5a1418";
    g.beginPath();
    g.arc(s * 99, 0, 5.5, 0, Math.PI * 2);
    g.fill();
  }

  // la cara-pantalla (la misma del juego 3, a escala)
  g.save();
  g.translate(0, -4);
  g.scale(0.58, 0.58);
  drawCaosScreenFrame(g, L.rage);
  drawCaosFace(g, L);
  g.restore();

  // placa "CAOS S.A." montada sobre el borde de arriba
  g.fillStyle = COLORS.rojo;
  g.strokeStyle = "#0A0A0C";
  g.lineWidth = 3;
  rr(g, -46, -68, 92, 22, 5);
  g.fill();
  g.stroke();
  g.fillStyle = "#fff";
  g.font = '900 12px "Archivo Black", Archivo, Arial';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("CAOS S.A.", 0, -56.5);

  // humo y chispas cuando está dañado
  const smoke = (sx: number, sy: number, seed: number) => {
    for (let k = 0; k < 4; k++) {
      const ph = (t * 0.9 + k / 4 + seed) % 1;
      g.fillStyle = `rgba(70,66,80,${0.45 * (1 - ph)})`;
      g.beginPath();
      g.arc(sx + Math.sin(ph * 5 + seed * 9) * 10, sy - ph * 70, 7 + ph * 15, 0, Math.PI * 2);
      g.fill();
    }
  };
  if (L.hp < 0.66) smoke(-80, -40, 0.1);
  if (L.hp < 0.33) {
    smoke(80, -36, 0.6);
    for (let k = 0; k < 3; k++) {
      const f = 10 + Math.sin(t * 25 + k) * 4;
      g.fillStyle = k % 2 ? "#ffb020" : COLORS.naranja;
      g.beginPath();
      g.moveTo(70 + k * 8, -46);
      g.quadraticCurveTo(74 + k * 8, -46 - f * 2, 78 + k * 8, -46);
      g.fill();
    }
  }

  // destello de golpe / explotando
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

  // escudo: burbuja cian con candado mientras queden Problemones
  if (L.shield > 0.01) {
    g.save();
    g.globalAlpha = L.shield;
    const rx = 140 + Math.sin(t * 4) * 3, ry = 96 + Math.sin(t * 4) * 2;
    g.fillStyle = `rgba(10,182,188,${0.1 + L.shieldHit * 0.25})`;
    g.beginPath();
    g.ellipse(x, y - 8, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = L.shieldHit > 0.05 ? "#bff3f5" : "rgba(10,182,188,0.85)";
    g.lineWidth = 5;
    g.setLineDash([16, 10]);
    g.lineDashOffset = -t * 30;
    g.stroke();
    g.setLineDash([]);
    // candado
    const lx = x + rx * 0.72, ly = y - 8 - ry * 0.72;
    g.fillStyle = COLORS.cian;
    g.strokeStyle = "#0A0A0C";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(lx, ly, 17, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = "#fff";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(lx, ly - 3, 5.5, Math.PI, 0);
    g.stroke();
    g.fillStyle = "#fff";
    g.fillRect(lx - 7.5, ly - 3, 15, 11);
    g.restore();
  }
}
