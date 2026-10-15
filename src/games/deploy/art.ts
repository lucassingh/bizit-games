import { COLORS } from "@/lib/brand";

/**
 * Arte 2D de Deploy BGen: fondo (patio de la compañía, misma paleta que la
 * ciudad Kenney del juego 1), gomera de madera, Problemones con cara y placas
 * de texto. Todo dibujado con Canvas 2D, sin assets externos.
 */

const INK = COLORS.carbon;
const NAVY = "#3A3F4B";
const WALL = "#F2EEE8";
const WALL2 = "#E4DED6";
const WIN = "#7FB0D8";
const WIN2 = "#B9D6EC";
const GREEN = "#3F9E5C";
const GREEN2 = "#2E7A45";
const TRUNK = "#9A6B42";

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/* ---------- fondo ---------- */
/** Ciudad del juego 1 (Kenney 3D) renderizada a imagen: el mismo mundo en los dos juegos. */
export const CITY_IMG = typeof Image !== "undefined" ? new Image() : (null as unknown as HTMLImageElement);
if (CITY_IMG) CITY_IMG.src = "/sprites/deploy/city.webp";

export function drawBackground(g: CanvasRenderingContext2D, W: number, H: number, GROUND: number) {
  // cielo amplio (como en los juegos de gomera: el aire es parte del juego)
  const sky = g.createLinearGradient(0, -H, 0, GROUND);
  sky.addColorStop(0, "#8EC9EC");
  sky.addColorStop(0.5, "#BFE0F3");
  sky.addColorStop(0.85, "#E8F2F7");
  sky.addColorStop(1, "#F4F1EB");
  g.fillStyle = sky;
  g.fillRect(-W, -H, W * 3, GROUND + H);
  // sol
  const sun = g.createRadialGradient(W * 0.8, 70, 10, W * 0.8, 70, 240);
  sun.addColorStop(0, "rgba(255,226,160,0.95)");
  sun.addColorStop(1, "rgba(255,226,160,0)");
  g.fillStyle = sun;
  g.fillRect(0, -H, W, 500);
  // nubes grandes y blandas, en dos planos
  const cloud = (x: number, y: number, s: number, a: number) => {
    g.fillStyle = `rgba(255,255,255,${a})`;
    for (const [dx, dy, r] of [
      [0, 0, 46],
      [44, -22, 58],
      [104, -6, 48],
      [60, 16, 40],
      [-30, 14, 34],
    ]) {
      g.beginPath();
      g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      g.fill();
    }
  };
  cloud(120, 150, 1.2, 0.95);
  cloud(560, 80, 0.9, 0.9);
  cloud(1020, 170, 1.4, 0.95);
  cloud(1420, 90, 0.8, 0.9);
  cloud(300, 300, 0.6, 0.5);
  cloud(1250, 320, 0.7, 0.5);

  if (CITY_IMG && CITY_IMG.complete && CITY_IMG.naturalWidth) {
    // la ciudad queda chica y lejana en el horizonte: ocupa el tercio inferior, desaturada por el aire
    const horizon = GROUND - 14;
    const iw = W * 1.12, ih = iw * (CITY_IMG.naturalHeight / CITY_IMG.naturalWidth);
    g.drawImage(CITY_IMG, (W - iw) / 2, horizon - ih * 0.86, iw, ih);
    // velo que nace transparente bien arriba (sin borde visible) y se cierra sobre la ciudad
    const haze = g.createLinearGradient(0, horizon - ih * 1.6, 0, horizon);
    haze.addColorStop(0, "rgba(226,238,247,0)");
    haze.addColorStop(0.45, "rgba(226,238,247,0.5)");
    haze.addColorStop(1, "rgba(240,236,230,0.66)");
    g.fillStyle = haze;
    g.fillRect(-W, -H, W * 3, horizon + H);
    drawGround(g, W, GROUND);
    return;
  }
  // skyline lejano (azulado, plano)
  g.fillStyle = "#CFD9E3";
  for (const [x, w, h] of [
    [-40, 120, 230],
    [90, 70, 320],
    [170, 150, 190],
    [340, 90, 280],
    [440, 160, 210],
    [620, 80, 360],
    [710, 140, 240],
    [860, 110, 300],
    [980, 170, 200],
    [1170, 90, 330],
    [1270, 150, 250],
    [1440, 100, 290],
    [1550, 160, 210],
  ]) {
    g.fillRect(x, GROUND - h - 40, w, h + 40);
    g.fillStyle = "#DCE5EC";
    for (let yy = GROUND - h - 20; yy < GROUND - 60; yy += 28) for (let xx = x + 12; xx < x + w - 12; xx += 22) g.fillRect(xx, yy, 10, 14);
    g.fillStyle = "#CFD9E3";
  }

  // edificios de la compañía (estilo Kenney: blanco, techos azul noche, ventanas celestes, toldos naranjas)
  const office = (x: number, w: number, floors: number, awning = false, sign?: string) => {
    const fh = 58;
    const h = floors * fh + 24;
    const y = GROUND - h;
    g.fillStyle = WALL;
    g.fillRect(x, y, w, h);
    g.fillStyle = WALL2;
    g.fillRect(x + w - 14, y, 14, h);
    g.fillStyle = NAVY;
    g.fillRect(x - 6, y - 14, w + 12, 18);
    g.fillRect(x + w * 0.3, y - 26, w * 0.25, 14);
    for (let f = 0; f < floors; f++) {
      const wy = y + 20 + f * fh;
      const last = f === floors - 1;
      for (let wx = x + 16; wx < x + w - 30; wx += 44) {
        if (last && awning) {
          rr(g, wx, wy + 4, 30, 40, 4);
          g.fillStyle = WIN2;
          g.fill();
        } else {
          rr(g, wx, wy, 30, 30, 4);
          g.fillStyle = WIN;
          g.fill();
          g.fillStyle = WIN2;
          g.fillRect(wx + 4, wy + 4, 10, 10);
        }
        g.strokeStyle = NAVY;
        g.lineWidth = 3;
        rr(g, wx, wy + (last && awning ? 4 : 0), 30, last && awning ? 40 : 30, 4);
        g.stroke();
      }
      if (last && awning) {
        g.fillStyle = COLORS.naranja;
        g.fillRect(x + 6, wy - 6, w - 12, 12);
        for (let k = x + 6; k < x + w - 12; k += 22) g.fillRect(k, wy + 6, 11, 6);
      }
    }
    // puerta
    g.fillStyle = NAVY;
    rr(g, x + w / 2 - 16, GROUND - 46, 32, 46, 4);
    g.fill();
    g.fillStyle = WIN2;
    g.fillRect(x + w / 2 - 10, GROUND - 40, 20, 20);
    if (sign) {
      g.fillStyle = COLORS.naranja;
      const sw = sign.length * 11 + 24;
      rr(g, x + w / 2 - sw / 2, y + 2, sw, 20, 3);
      g.fill();
      g.fillStyle = "#fff";
      g.font = '900 12px "Archivo Black", Arial';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(sign, x + w / 2, y + 12);
    }
  };
  const factory = (x: number, w: number) => {
    const h = 150;
    const y = GROUND - h;
    g.fillStyle = WALL2;
    g.fillRect(x, y, w, h);
    // techo dentado
    g.fillStyle = NAVY;
    for (let k = x; k < x + w; k += 50) {
      g.beginPath();
      g.moveTo(k, y);
      g.lineTo(k + 32, y - 34);
      g.lineTo(k + 50, y);
      g.closePath();
      g.fill();
      g.fillStyle = WIN;
      g.beginPath();
      g.moveTo(k + 34, y - 30);
      g.lineTo(k + 48, y - 2);
      g.lineTo(k + 34, y - 2);
      g.closePath();
      g.fill();
      g.fillStyle = NAVY;
    }
    // chimeneas con anillo naranja
    for (const cx of [x + 30, x + 70]) {
      g.fillStyle = "#D8D2CA";
      g.fillRect(cx, y - 120, 22, 120);
      g.fillStyle = COLORS.naranja;
      g.fillRect(cx - 2, y - 120, 26, 10);
      g.fillStyle = NAVY;
      g.fillRect(cx - 2, y - 60, 26, 6);
    }
    // portón
    g.fillStyle = NAVY;
    g.fillRect(x + w - 90, GROUND - 80, 70, 80);
    g.fillStyle = "#B8B0A6";
    for (let k = 0; k < 5; k++) g.fillRect(x + w - 86, GROUND - 74 + k * 14, 62, 6);
    // tanque
    g.fillStyle = "#E6E0D8";
    rr(g, x - 60, GROUND - 70, 48, 70, 8);
    g.fill();
    g.fillStyle = COLORS.naranja;
    g.fillRect(x - 60, GROUND - 44, 48, 8);
  };
  const tree = (x: number, s: number) => {
    g.fillStyle = TRUNK;
    g.fillRect(x - 5 * s, GROUND - 40 * s, 10 * s, 40 * s);
    for (const [dx, dy, r, c] of [
      [0, -62, 30, GREEN],
      [-20, -46, 22, GREEN2],
      [22, -48, 24, GREEN2],
      [0, -40, 26, GREEN],
    ] as [number, number, number, string][]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x + dx * s, GROUND + dy * s, r * s, 0, Math.PI * 2);
      g.fill();
    }
  };
  const car = (x: number, color: string) => {
    g.fillStyle = color;
    rr(g, x, GROUND - 30, 86, 24, 6);
    g.fill();
    rr(g, x + 18, GROUND - 48, 46, 22, 6);
    g.fill();
    g.fillStyle = WIN2;
    rr(g, x + 24, GROUND - 44, 34, 14, 3);
    g.fill();
    g.fillStyle = INK;
    for (const wx of [x + 18, x + 66]) {
      g.beginPath();
      g.arc(wx, GROUND - 6, 9, 0, Math.PI * 2);
      g.fill();
    }
  };

  office(30, 190, 3, false, "VENTAS");
  office(300, 150, 2, true);
  factory(520, 260, );
  office(900, 130, 4, false, "FINANZAS");
  // casa central: la torre
  {
    const x = 1080, w = 120, h = 420, y = GROUND - h;
    g.fillStyle = WALL;
    g.fillRect(x, y, w, h);
    g.fillStyle = WALL2;
    g.fillRect(x + w - 16, y, 16, h);
    g.fillStyle = NAVY;
    g.fillRect(x - 6, y - 12, w + 12, 16);
    g.fillRect(x + 48, y - 40, 24, 30);
    for (let yy = y + 26; yy < GROUND - 60; yy += 36) {
      g.fillStyle = WIN;
      g.fillRect(x + 12, yy, w - 36, 22);
      g.fillStyle = WIN2;
      g.fillRect(x + 12, yy, 22, 8);
    }
    g.fillStyle = COLORS.naranja;
    rr(g, x + 8, y + 10, w - 32, 22, 3);
    g.fill();
    g.fillStyle = "#fff";
    g.font = '900 11px "Archivo Black", Arial';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("CASA CENTRAL", x + 8 + (w - 32) / 2, y + 21);
  }
  office(1560, 170, 3);
  tree(260, 1);
  tree(880, 0.8);
  tree(1540, 1.1);
  car(360, COLORS.naranja);
  car(1310, "#5B6B7A");

  drawGround(g, W, GROUND);
}

/** Piso: lomada de pasto y tierra, limpio para que la torre y los Problemones se lean. */
function drawGround(g: CanvasRenderingContext2D, W: number, GROUND: number) {
  // pasto con borde ondulado
  g.fillStyle = "#8CC45C";
  g.beginPath();
  g.moveTo(-W, GROUND + 60);
  g.lineTo(-W, GROUND - 2);
  for (let x = -W; x <= W * 2; x += 60) g.quadraticCurveTo(x + 30, GROUND - 12, x + 60, GROUND - 2);
  g.lineTo(W * 2, GROUND + 60);
  g.closePath();
  g.fill();
  g.fillStyle = "#6FAE47";
  g.fillRect(-W, GROUND + 14, W * 3, 8);
  // tierra
  g.fillStyle = "#8B6A4A";
  g.fillRect(-W, GROUND + 22, W * 3, 220);
  g.fillStyle = "#A07E5A";
  for (let x = -W; x < W * 2; x += 37) {
    const y = GROUND + 40 + ((x * 7) % 60);
    g.beginPath();
    g.ellipse(x, y, 7, 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#6E5238";
  for (let x = -W + 18; x < W * 2; x += 53) {
    const y = GROUND + 70 + ((x * 13) % 50);
    g.beginPath();
    g.ellipse(x, y, 5, 3, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/* ---------- sprites de Problemones renderizados desde los modelos 3D del juego 1 ---------- */
interface SpriteMeta {
  w: number;
  h: number;
  /** píxeles de la imagen por unidad del mundo 3D */
  ppu: number;
  cx: number;
  cy: number;
}
const SPRITE_META: Record<string, SpriteMeta> = {
  mail: { w: 464, h: 300, ppu: 150.57, cx: 233, cy: 149 },
  fantasma: { w: 385, h: 470, ppu: 159.28, cx: 194, cy: 235 },
  excel: { w: 378, h: 470, ppu: 173.32, cx: 189, cy: 236 },
  caja: { w: 466, h: 468, ppu: 209.69, cx: 233, cy: 233 },
  factura: { w: 283, h: 470, ppu: 150.71, cx: 142, cy: 235 },
  botella: { w: 470, h: 144, ppu: 57.36, cx: 235, cy: 72 },
};
const SPRITES: Record<string, HTMLImageElement> = {};
if (typeof Image !== "undefined")
  for (const n of Object.keys(SPRITE_META)) {
    const im = new Image();
    im.src = `/sprites/deploy/${n}.png`;
    SPRITES[n] = im;
  }
/** Qué sprite usa cada Problemón del juego 2 (el jefe se dibuja a mano). */
const ENEMY_SPRITE: Partial<Record<EnemyKind, string>> = { mail: "mail", fantasma: "fantasma", excel: "excel", factura: "factura", reporte: "caja" };

/** Dibuja el sprite centrado, escalado para que su lado mayor mida ~2.5·r. Devuelve false si todavía no cargó. */
function drawSprite(ctx: CanvasRenderingContext2D, name: string, r: number) {
  const im = SPRITES[name], m = SPRITE_META[name];
  if (!im || !m || !im.complete || !im.naturalWidth) return false;
  const k = (r * 2.5) / Math.max(m.w, m.h);
  ctx.drawImage(im, -m.cx * k, -m.cy * k, m.w * k, m.h * k);
  return true;
}

/* ---------- gomera ---------- */
export function drawSlingshot(ctx: CanvasRenderingContext2D, sx: number, sy: number, ground: number, part: "back" | "front") {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const wood = (w: number, col: string) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(sx, ground - 70);
    ctx.lineTo(sx, sy + 62);
    ctx.quadraticCurveTo(sx - 6, sy + 20, sx - 36, sy - 14);
    ctx.moveTo(sx, sy + 62);
    ctx.quadraticCurveTo(sx + 8, sy + 20, sx + 36, sy - 14);
    ctx.stroke();
  };
  if (part === "back") {
    // base: poste de madera clara como el del cartel, con una lengüeta de tierra
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(sx, ground - 2, 30, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#B4783F";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    rr(ctx, sx - 13, ground - 70, 26, 70, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(sx + 3, ground - 68, 8, 66);
    // aro de metal donde arranca la horquilla
    ctx.fillStyle = "#6B6E75";
    rr(ctx, sx - 15, ground - 74, 30, 9, 3);
    ctx.fill();
    ctx.stroke();
    wood(26, INK);
    wood(19, "#8C5A2B");
    // veta
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx - 4, ground - 76);
    ctx.lineTo(sx - 4, sy + 70);
    ctx.stroke();
    // cartel de madera "DEPLOY" clavado a un poste, al pie de la gomera
    drawWoodSign(ctx, sx + 92, ground, "DEPLOY");
  } else {
    // puntas de las horquillas con cuero
    for (const x of [sx - 36, sx + 36]) {
      ctx.fillStyle = "#4A2E16";
      rr(ctx, x - 9, sy - 30, 18, 22, 5);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Cartel de madera clara con bordes irregulares, dos clavos y texto quemado. */
export function drawWoodSign(ctx: CanvasRenderingContext2D, x: number, ground: number, text: string) {
  ctx.save();
  ctx.lineJoin = "round";
  // poste
  ctx.fillStyle = "#B4783F";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  rr(ctx, x - 7, ground - 74, 14, 74, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(x + 1, ground - 72, 5, 70);
  // tabla con bordes irregulares, levemente inclinada
  ctx.translate(x, ground - 60);
  ctx.rotate(-0.05);
  const w = 104, h = 34;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2 + 4);
  ctx.lineTo(-w / 2 + 6, -h / 2);
  ctx.lineTo(w / 2 - 4, -h / 2 + 2);
  ctx.lineTo(w / 2, -h / 2 + 10);
  ctx.lineTo(w / 2 - 3, h / 2 - 6);
  ctx.lineTo(w / 2 - 8, h / 2);
  ctx.lineTo(-w / 2 + 5, h / 2 - 2);
  ctx.lineTo(-w / 2, h / 2 - 8);
  ctx.closePath();
  const grd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grd.addColorStop(0, "#F2C98A");
  grd.addColorStop(1, "#D9A05B");
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // vetas
  ctx.strokeStyle = "rgba(120,70,20,0.28)";
  ctx.lineWidth = 1.5;
  for (const yy of [-9, -2, 6, 11]) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 8, yy);
    ctx.quadraticCurveTo(0, yy + (yy % 2 ? 2 : -2), w / 2 - 10, yy);
    ctx.stroke();
  }
  // clavos
  for (const nx of [-w / 2 + 12, w / 2 - 12]) {
    ctx.fillStyle = "#6B6E75";
    ctx.beginPath();
    ctx.arc(nx, -h / 2 + 9, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(nx - 1, -h / 2 + 8, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // texto quemado
  ctx.fillStyle = "#5A3412";
  ctx.font = '900 17px "Archivo Black", Archivo, Arial';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 2);
  ctx.restore();
}

/** Bandas de la gomera: dos elásticos con brillo y la bolsa de cuero en la posición del proyectil. */
export function drawBands(ctx: CanvasRenderingContext2D, sx: number, sy: number, px: number, py: number, part: "back" | "pouch" | "front") {
  ctx.save();
  ctx.lineCap = "round";
  const band = (fx: number) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(fx, sy - 16);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.strokeStyle = "#8C5A2B";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  if (part === "back") band(sx + 36);
  else if (part === "front") {
    // banda delantera fina, no tapa la cara
    ctx.strokeStyle = "#8C5A2B";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sx - 36, sy - 16);
    ctx.lineTo(px - 18, py + 6);
    ctx.stroke();
  } else {
    // bolsa de cuero detrás del agente
    const dx = px - sx, dy = py - sy;
    const a = Math.atan2(dy, dx);
    ctx.translate(px, py);
    ctx.rotate(a);
    ctx.fillStyle = "#4A2E16";
    rr(ctx, -14, -30, 28, 60, 10);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- Problemones ---------- */
export type EnemyKind = "mail" | "factura" | "excel" | "fantasma" | "reporte" | "boss";
type Mood = "cansado" | "preocupado" | "zombie" | "panico" | "enojado" | "furioso";

function face(ctx: CanvasRenderingContext2D, mood: Mood, r: number, t: number, phase: number) {
  const blink = ((t + phase) % 3.4) > 3.25;
  const eye = (x: number, y: number, er: number, px = 0, py = 0.15, pupil = 0.5) => {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(x - er, y);
      ctx.quadraticCurveTo(x, y + er * 0.8, x + er, y);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + px * er, y + py * er, er * pupil, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + px * er - er * 0.18, y + py * er - er * 0.2, er * 0.16, 0, Math.PI * 2);
    ctx.fill();
  };
  const brow = (x: number, y: number, len: number, ang: number) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(x - (len / 2) * Math.cos(ang), y - (len / 2) * Math.sin(ang));
    ctx.lineTo(x + (len / 2) * Math.cos(ang), y + (len / 2) * Math.sin(ang));
    ctx.stroke();
  };
  const ex = r * 0.36, ey = -r * 0.12, er = r * 0.26;
  ctx.lineCap = "round";
  switch (mood) {
    case "cansado":
      eye(-ex, ey, er, 0, 0.35);
      eye(ex, ey, er, 0, 0.35);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(-ex - er, ey - er * 0.2);
      ctx.lineTo(-ex + er, ey - er * 0.2);
      ctx.moveTo(ex - er, ey - er * 0.2);
      ctx.lineTo(ex + er, ey - er * 0.2);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.45, r * 0.14, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "preocupado":
      eye(-ex, ey + r * 0.05, er, 0.1, 0.05);
      eye(ex, ey + r * 0.05, er, 0.1, 0.05);
      brow(-ex, ey - er * 1.5, r * 0.4, 0.35);
      brow(ex, ey - er * 1.5, r * 0.4, -0.35);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.beginPath();
      ctx.arc(0, r * 0.62, r * 0.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      break;
    case "zombie":
      eye(-ex, ey, er * 1.25, -0.2, 0.2, 0.3);
      eye(ex, ey + r * 0.1, er * 0.8, 0.3, 0, 0.5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, r * 0.5);
      for (let k = 0; k < 4; k++) ctx.lineTo(-r * 0.4 + (k + 0.5) * r * 0.2, r * 0.5 + (k % 2 ? 0.1 : -0.08) * r);
      ctx.lineTo(r * 0.4, r * 0.5);
      ctx.stroke();
      break;
    case "panico":
      eye(-ex, ey, er * 1.1, 0, 0, 0.3);
      eye(ex, ey, er * 1.1, 0, 0, 0.3);
      brow(-ex, ey - er * 1.7, r * 0.36, 0.3);
      brow(ex, ey - er * 1.7, r * 0.36, -0.3);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.5, r * 0.18, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "enojado":
    case "furioso": {
      const k = mood === "furioso" ? 1.3 : 1;
      eye(-ex, ey + r * 0.05, er * k, 0.15, 0.1);
      eye(ex, ey + r * 0.05, er * k, -0.15, 0.1);
      brow(-ex, ey - er * 1.3, r * 0.44, -0.55);
      brow(ex, ey - er * 1.3, r * 0.44, 0.55);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.beginPath();
      ctx.arc(0, r * 0.72, r * 0.22, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      if (mood === "furioso") {
        ctx.fillStyle = "#fff";
        for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.1 - r * 0.04, r * 0.5, r * 0.08, r * 0.1);
      }
      break;
    }
  }
}

/** Dibuja el Problemón centrado en (0,0) con radio físico r (ya rotado por el cuerpo). */
export function drawEnemySprite(ctx: CanvasRenderingContext2D, kind: EnemyKind, r: number, t: number, phase: number) {
  ctx.save();
  ctx.lineJoin = "round";
  const spr = ENEMY_SPRITE[kind];
  if (spr && drawSprite(ctx, spr, r)) {
    ctx.restore();
    return;
  }
  const outline = () => {
    ctx.lineWidth = Math.max(2.5, r * 0.1);
    ctx.strokeStyle = INK;
    ctx.stroke();
  };
  switch (kind) {
    case "mail": {
      // pila de sobres
      for (let i = 2; i >= 0; i--) {
        ctx.save();
        ctx.translate((i - 1) * r * 0.08, r * 0.55 - i * r * 0.5);
        ctx.rotate((i % 2 ? 1 : -1) * 0.06);
        rr(ctx, -r, -r * 0.3, r * 2, r * 0.6, r * 0.1);
        ctx.fillStyle = i % 2 ? "#E8DDC6" : "#F6EEDC";
        ctx.fill();
        outline();
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.3);
        ctx.lineTo(0, r * 0.1);
        ctx.lineTo(r, -r * 0.3);
        ctx.lineWidth = Math.max(2, r * 0.06);
        ctx.stroke();
        if (i === 1) {
          ctx.fillStyle = COLORS.rojo;
          rr(ctx, r * 0.45, -r * 0.22, r * 0.4, r * 0.2, 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.translate(0, -r * 0.35);
      face(ctx, "cansado", r * 0.8, t, phase);
      break;
    }
    case "fantasma": {
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.2);
      ctx.arc(0, 0, r, Math.PI, 0);
      ctx.lineTo(r, r * 0.95);
      for (let k = 0; k < 4; k++) ctx.lineTo(r - (k + 0.5) * (r / 2), r * (k % 2 ? 0.95 : 0.75));
      ctx.closePath();
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      outline();
      // portapapeles LEAD
      ctx.save();
      ctx.translate(r * 0.75, r * 0.35);
      ctx.rotate(0.25);
      rr(ctx, -r * 0.28, -r * 0.38, r * 0.56, r * 0.76, r * 0.06);
      ctx.fillStyle = "#4B4F57";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(-r * 0.22, -r * 0.26, r * 0.44, r * 0.58);
      ctx.fillStyle = COLORS.rojo;
      ctx.font = `900 ${Math.round(r * 0.22)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("LEAD", 0, -r * 0.1);
      ctx.fillStyle = "#9aa0a6";
      for (let k = 0; k < 3; k++) ctx.fillRect(-r * 0.18, r * 0.05 + k * r * 0.09, r * (0.36 - k * 0.08), r * 0.04);
      ctx.restore();
      face(ctx, "preocupado", r, t, phase);
      break;
    }
    case "excel": {
      rr(ctx, -r * 0.9, -r, r * 1.8, r * 2, r * 0.12);
      ctx.fillStyle = "#5FA66B";
      ctx.fill();
      outline();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(k * r * 0.36, -r);
        ctx.lineTo(k * r * 0.36, r);
        ctx.moveTo(-r * 0.9, k * r * 0.4);
        ctx.lineTo(r * 0.9, k * r * 0.4);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(-r * 0.54, r * 0.4, r * 0.36, r * 0.4);
      ctx.fillRect(r * 0.18, -r * 0.8, r * 0.36, r * 0.4);
      // brazos de zombie
      for (const sx of [-1, 1]) {
        rr(ctx, sx * r * 0.95 - (sx < 0 ? r * 0.5 : 0), -r * 0.1, r * 0.5, r * 0.26, r * 0.1);
        ctx.fillStyle = "#2F6B3A";
        ctx.fill();
        outline();
      }
      face(ctx, "zombie", r * 0.9, t, phase);
      break;
    }
    case "factura": {
      rr(ctx, -r * 0.85, -r, r * 1.7, r * 2, r * 0.08);
      ctx.fillStyle = "#F6E7A8";
      ctx.fill();
      outline();
      ctx.fillStyle = "#8a7d55";
      for (let k = 0; k < 4; k++) ctx.fillRect(-r * 0.6, r * 0.2 + k * r * 0.17, r * (1.1 - (k % 2) * 0.3), r * 0.07);
      // sello VENCIDA
      ctx.save();
      ctx.rotate(-0.3);
      ctx.strokeStyle = COLORS.rojo;
      ctx.lineWidth = Math.max(2, r * 0.08);
      ctx.beginPath();
      ctx.arc(0, r * 0.45, r * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = COLORS.rojo;
      ctx.font = `900 ${Math.round(r * 0.2)}px "Archivo Black", Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("VENCIDA", 0, r * 0.45);
      ctx.restore();
      // despertador
      ctx.fillStyle = COLORS.rojo;
      ctx.beginPath();
      ctx.arc(r * 0.55, -r * 1.05, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      outline();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(r * 0.55, -r * 1.05, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(0, -r * 0.35);
      face(ctx, "panico", r * 0.85, t, phase);
      break;
    }
    case "reporte": {
      // carpeta gris con pestaña y gráfico que cae
      rr(ctx, -r, -r * 0.7, r * 2, r * 1.7, r * 0.12);
      ctx.fillStyle = "#C9C2B8";
      ctx.fill();
      outline();
      rr(ctx, -r, -r, r * 0.9, r * 0.5, r * 0.1);
      ctx.fillStyle = "#C9C2B8";
      ctx.fill();
      outline();
      ctx.strokeStyle = COLORS.rojo;
      ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, r * 0.2);
      ctx.lineTo(-r * 0.2, r * 0.45);
      ctx.lineTo(r * 0.15, r * 0.3);
      ctx.lineTo(r * 0.6, r * 0.8);
      ctx.stroke();
      ctx.translate(0, -r * 0.15);
      face(ctx, "enojado", r * 0.8, t, phase);
      break;
    }
    case "boss": {
      // el Caos: torbellino de papeles con cara furiosa
      for (let k = 0; k < 18; k++) {
        const a = t * 2.4 + k * 0.7;
        const rad = r * (0.95 + 0.25 * Math.sin(t * 3 + k));
        ctx.save();
        ctx.translate(Math.cos(a) * rad, Math.sin(a) * rad * 0.55 - r * 0.1);
        ctx.rotate(a * 1.5);
        ctx.fillStyle = k % 3 === 0 ? "#D9CBB0" : k % 3 === 1 ? "#BDB3A0" : "#EDE6DA";
        ctx.fillRect(-r * 0.22, -r * 0.14, r * 0.44, r * 0.28);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.fillStyle = "#6E7079";
      ctx.fill();
      outline();
      const grd = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r * 0.8);
      grd.addColorStop(0, "rgba(255,255,255,0.25)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.fill();
      face(ctx, "furioso", r * 0.8, t, phase);
      break;
    }
  }
  ctx.restore();
}

/* ---------- placa de texto (nombre del agente, pistas) ---------- */
export function drawPlaque(ctx: CanvasRenderingContext2D, x: number, y: number, title: string, sub?: string, accent: string = COLORS.naranja) {
  ctx.save();
  ctx.font = '900 17px "Archivo Black", Archivo, Arial';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(title).width;
  ctx.font = '600 13px Inter, Arial';
  const sw = sub ? ctx.measureText(sub).width : 0;
  const w = Math.max(tw, sw) + 44, h = sub ? 54 : 36;
  const cut = 10;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + cut, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 2);
  ctx.lineTo(x + w / 2 - cut, y + h / 2);
  ctx.lineTo(x - w / 2, y + h / 2);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(x - w / 2 + cut + 2, y - h / 2, w * 0.35, 3);
  ctx.fillStyle = "#fff";
  ctx.font = '900 17px "Archivo Black", Archivo, Arial';
  ctx.fillText(title, x, y - (sub ? 9 : 0));
  if (sub) {
    ctx.fillStyle = "#FFD3B5";
    ctx.font = '600 13px Inter, Arial';
    ctx.fillText(sub, x, y + 13);
  }
  // flechita hacia abajo
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + h / 2);
  ctx.lineTo(x + 8, y + h / 2);
  ctx.lineTo(x, y + h / 2 + 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
