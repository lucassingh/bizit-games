import { COLORS } from "@/lib/brand";

/**
 * Escenografía de "Bandeja BGen": la Casa Central de noche, vista desde la
 * vereda de enfrente (render 3D del mundo del juego 1, `hq-night.webp`).
 * La empresa está desbordada: las tareas salen volando por las ventanas
 * iluminadas de la torre. El equipo espera en la puerta; BGen las intercepta
 * en la vereda. Capas: imagen de fondo → ventanas encendidas (animadas) →
 * vereda → personas → juego.
 */

const INK = COLORS.carbon;

export const HQ_IMG = typeof Image !== "undefined" ? new Image() : (null as unknown as HTMLImageElement);
if (HQ_IMG) HQ_IMG.src = "/sprites/deploy/hq-night.webp";

/** Dónde queda la imagen en el mundo (cubre el ancho; la calle apoya en FLOOR). */
export function imageRect(W: number, FLOOR: number) {
  const iw = W, ih = iw * (1400 / 2400);
  return { x: 0, y: FLOOR - ih * 0.905, w: iw, h: ih };
}

/** Ventanas de la torre central visibles, en coordenadas del mundo (un ventanal ancho por piso). */
export function towerWindows(W: number, FLOOR: number) {
  const r = imageRect(W, FLOOR);
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const y = r.y + r.h * (0.045 + i * 0.0855);
    if (y < 30 || y > FLOOR - 150) continue;
    out.push({ x: r.x + r.w * 0.5025, y, w: r.w * 0.118, h: r.h * 0.05 });
  }
  return out;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Capa estática: cielo nocturno + render de la torre + vereda. */
export function drawNightStatic(g: CanvasRenderingContext2D, W: number, H: number, FLOOR: number) {
  const sky = g.createLinearGradient(0, -H, 0, FLOOR);
  sky.addColorStop(0, "#070a16");
  sky.addColorStop(1, "#141a33");
  g.fillStyle = sky;
  g.fillRect(-W, -H, W * 3, FLOOR + H);
  // estrellas
  g.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 70; i++) {
    const x = ((i * 977) % W), y = ((i * 613) % Math.max(1, FLOOR * 0.5));
    g.fillRect(x, y - 300, 2, 2);
  }
  if (HQ_IMG && HQ_IMG.complete && HQ_IMG.naturalWidth) {
    const r = imageRect(W, FLOOR);
    g.drawImage(HQ_IMG, r.x, r.y, r.w, r.h);
  }
  // vereda y calle
  g.fillStyle = "#3a3f4d";
  g.fillRect(-W, FLOOR, W * 3, H);
  g.fillStyle = "#8d919c";
  g.fillRect(-W, FLOOR, W * 3, 12);
  g.fillStyle = "#4b5060";
  g.fillRect(-W, FLOOR + 12, W * 3, 60);
  g.fillStyle = "#2b2f3a";
  g.fillRect(-W, FLOOR + 72, W * 3, H);
  g.fillStyle = "#E3B23C";
  for (let x = -W; x < W * 2; x += 140) g.fillRect(x, FLOOR + 96, 60, 5);
  // farol a cada lado
  for (const x of [120, W - 120]) {
    g.fillStyle = INK;
    g.fillRect(x - 4, FLOOR - 190, 8, 190);
    g.fillRect(x - 22, FLOOR - 196, 44, 10);
    const glow = g.createRadialGradient(x, FLOOR - 200, 4, x, FLOOR - 200, 120);
    glow.addColorStop(0, "rgba(255,214,140,0.55)");
    glow.addColorStop(1, "rgba(255,214,140,0)");
    g.fillStyle = glow;
    g.fillRect(x - 120, FLOOR - 320, 240, 240);
    g.fillStyle = "#FFD68C";
    g.beginPath();
    g.arc(x, FLOOR - 200, 9, 0, Math.PI * 2);
    g.fill();
  }
}

/** Ventanas encendidas (naranja cálido; algunas pasan a lima a medida que se automatiza). */
export function drawWindows(g: CanvasRenderingContext2D, wins: { x: number; y: number; w: number; h: number }[], t: number, automated: number) {
  const litCount = Math.round(wins.length * automated);
  wins.forEach((w, i) => {
    const flick = 0.8 + 0.2 * Math.sin(t * (1.5 + (i % 5) * 0.4) + i);
    // se automatiza de abajo hacia arriba
    const lit = i >= wins.length - litCount;
    const rgb = lit ? "178,243,38" : "255,178,80";
    g.save();
    g.globalCompositeOperation = "lighter";
    const glow = g.createRadialGradient(w.x, w.y, 4, w.x, w.y, w.w * 0.9);
    glow.addColorStop(0, `rgba(${rgb},${0.22 * flick})`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = glow;
    g.fillRect(w.x - w.w, w.y - w.w, w.w * 2, w.w * 2);
    g.fillStyle = `rgba(${rgb},${0.38 * flick})`;
    rr(g, w.x - w.w / 2, w.y - w.h / 2, w.w, w.h, 3);
    g.fill();
    g.restore();
  });
}

/** Persona del equipo en la vereda. `mood` 0 = tapada de papeles y preocupada, 1 = contenta. */
export function drawPerson(g: CanvasRenderingContext2D, x: number, FLOOR: number, mood: number, t: number, seed: number) {
  const bob = Math.sin(t * 2 + seed) * 2;
  const skin = ["#F1C9A5", "#C68B5B", "#8D5A3C", "#F5D6B8"][seed % 4];
  const shirt = [COLORS.cian, "#5B6B7A", COLORS.naranja, "#7A5BA8"][seed % 4];
  const sag = (1 - mood) * 8;
  const base = FLOOR + 4;
  // piernas
  g.fillStyle = "#2E3340";
  g.fillRect(x - 12, base - 34, 9, 34);
  g.fillRect(x + 3, base - 34, 9, 34);
  // cuerpo
  g.fillStyle = shirt;
  rr(g, x - 20, base - 84 + sag + bob, 40, 54, 10);
  g.fill();
  // cabeza
  g.fillStyle = skin;
  g.beginPath();
  g.arc(x, base - 100 + sag + bob, 17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ["#2B2B2B", "#6B3E26", "#D9A441", "#4A3F6B"][seed % 4];
  g.beginPath();
  g.arc(x, base - 105 + sag + bob, 17, Math.PI, 0);
  g.fill();
  // cara
  g.strokeStyle = INK;
  g.lineWidth = 2.2;
  g.lineCap = "round";
  g.beginPath();
  if (mood > 0.5) g.arc(x, base - 97 + sag + bob, 6, 0.15 * Math.PI, 0.85 * Math.PI);
  else g.arc(x, base - 90 + sag + bob, 6, 1.15 * Math.PI, 1.85 * Math.PI);
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(x - 6, base - 102 + sag + bob, 2, 0, Math.PI * 2);
  g.arc(x + 6, base - 102 + sag + bob, 2, 0, Math.PI * 2);
  g.fill();
  // papeles en los brazos cuando hay caos; celular/café cuando está tranquilo
  const piles = Math.round((1 - mood) * 4);
  for (let i = 0; i < piles; i++) {
    g.fillStyle = i % 2 ? "#F6EEDC" : "#E8DDC6";
    g.save();
    g.translate(x + 16, base - 60 - i * 7 + sag + bob);
    g.rotate((i % 2 ? 1 : -1) * 0.12);
    g.fillRect(-14, -5, 28, 10);
    g.strokeStyle = "rgba(33,37,41,0.4)";
    g.lineWidth = 1.2;
    g.strokeRect(-14, -5, 28, 10);
    g.restore();
  }
  if (mood > 0.6) {
    g.fillStyle = COLORS.naranja;
    rr(g, x + 14, base - 66 + bob, 12, 12, 3);
    g.fill();
  }
}

/** Tablero "AUTOMATIZADO" con contador. */
export function drawBoard(g: CanvasRenderingContext2D, x: number, y: number, done: number, total: number) {
  g.save();
  g.fillStyle = "rgba(33,37,41,0.92)";
  rr(g, x - 110, y - 34, 220, 68, 10);
  g.fill();
  g.strokeStyle = COLORS.lima;
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = COLORS.lima;
  g.font = "800 11px Inter, Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("AUTOMATIZADO", x, y - 16);
  g.fillStyle = "#fff";
  g.font = '900 30px "Archivo Black", Archivo, Arial';
  g.fillText(`${done}`, x - 20, y + 12);
  g.fillStyle = "#9aa0a6";
  g.font = "700 14px Inter, Arial";
  g.fillText(`/ ${total}`, x + 36, y + 14);
  g.restore();
}
