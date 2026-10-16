import { COLORS } from "@/lib/brand";

/**
 * El Caos Operativo, piezas comunes a los jefes de los juegos 2 y 3: la
 * cara-pantalla con LEDs furiosos, el torbellino de papeles, la barra de vida,
 * la franja de "¡ALERTA!" y el cartel de "¡CAOS DERROTADO!". Cada juego arma su
 * jefe con estas piezas (la nave nodriza en el 3, el núcleo sobre la torre en el 2).
 * Coordenadas de la cara: centro de la pantalla en (0, 6); mide 2·SCREEN_HALF × 112.
 */

/** Mitad del ancho de la cara-pantalla. */
export const SCREEN_HALF = 112;

export interface CaosFace {
  t: number;
  /** Vida 0..1 (con poca vida la pantalla se raja). */
  hp: number;
  /** Destello de golpe 0..1 (entrecierra los ojos). */
  flash: number;
  /** Enfurecido: los LEDs titilan. */
  rage: boolean;
  /** Hacia dónde mira (-1..1). */
  gaze: number;
  /** Apertura de la boca 0..1. */
  mouth: number;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Marco negro de la cara-pantalla con líneas de barrido (lo fijo). */
export function drawCaosScreenFrame(g: CanvasRenderingContext2D, rage: boolean) {
  rr(g, -SCREEN_HALF, -50, SCREEN_HALF * 2, 112, 34);
  g.fillStyle = "#0A0A0C";
  g.fill();
  g.strokeStyle = rage ? "#7a2030" : "#3a3150";
  g.lineWidth = 7;
  g.stroke();
  g.save();
  rr(g, -SCREEN_HALF + 6, -44, SCREEN_HALF * 2 - 12, 100, 28);
  g.clip();
  g.fillStyle = "rgba(255,255,255,0.035)";
  for (let sy = -44; sy < 56; sy += 6) g.fillRect(-SCREEN_HALF, sy, SCREEN_HALF * 2, 2);
  g.restore();
}

/** Los LEDs de la cara: ojos furiosos, cejas y boca en zigzag (sin shadowBlur: halo con trazo ancho). */
export function drawCaosFace(g: CanvasRenderingContext2D, L: CaosFace) {
  const { t } = L;
  const led = L.rage ? (Math.sin(t * 20) > -0.4 ? "#ff6a2a" : "#ff2a2a") : "#ff3b3b";
  const gx = L.gaze * 12;
  const squint = L.flash > 0.4 ? 0.35 : 1;
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  // ojos furiosos (inclinados hacia el centro): halo + LED
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 46 + gx, -4);
    g.scale(1, squint);
    g.beginPath();
    g.moveTo(-s * 30, -12);
    g.lineTo(s * 24, 2);
    g.lineTo(s * 20, 15);
    g.lineTo(-s * 26, 9);
    g.closePath();
    g.strokeStyle = "rgba(255,59,59,0.3)";
    g.lineWidth = 12;
    g.stroke();
    g.fillStyle = led;
    g.fill();
    g.restore();
    g.strokeStyle = "rgba(255,59,59,0.3)";
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(s * 84 + gx, -32);
    g.lineTo(s * 22 + gx, -18);
    g.stroke();
    g.strokeStyle = led;
    g.lineWidth = 7;
    g.stroke();
  }
  // boca: dientes en zigzag; se abre para escupir
  const mo = L.mouth;
  if (mo > 0.05) {
    const mg = g.createLinearGradient(0, 26, 0, 46 + mo * 14);
    mg.addColorStop(0, "#ffd27a");
    mg.addColorStop(1, COLORS.naranja);
    g.fillStyle = mg;
    rr(g, -44, 26, 88, 8 + mo * 18, 6);
    g.fill();
  }
  g.beginPath();
  for (let i = 0; i <= 8; i++) {
    const mx = -44 + i * 11;
    const my = 30 + (i % 2 ? 9 : 0) - mo * 6;
    if (i) g.lineTo(mx, my);
    else g.moveTo(mx, my);
  }
  g.strokeStyle = "rgba(255,59,59,0.3)";
  g.lineWidth = 11;
  g.stroke();
  g.strokeStyle = led;
  g.lineWidth = 5;
  g.stroke();
  // pantalla rajada con poca vida
  if (L.hp < 0.33) {
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-70, -44);
    g.lineTo(-38, -10);
    g.lineTo(-52, 14);
    g.lineTo(-20, 56);
    g.moveTo(-38, -10);
    g.lineTo(-4, -18);
    g.moveTo(60, -44);
    g.lineTo(44, -8);
    g.lineTo(80, 20);
    g.stroke();
  }
  g.restore();
}

const PAPER = ["#D9CBB0", "#BDB3A0", "#EDE6DA"];
/** El torbellino de papeles (la firma del Caos), centrado en (0, -96). */
export function drawPaperTornado(g: CanvasRenderingContext2D, t: number) {
  g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    g.strokeStyle = `rgba(214,200,240,${0.16 + k * 0.05})`;
    g.beginPath();
    g.ellipse(Math.sin(t * 3 + k) * 6, -86 - k * 16, 70 - k * 14, 12 - k * 2, 0, 0, Math.PI * 2);
    g.stroke();
  }
  for (let k = 0; k < 16; k++) {
    const a = t * 2.6 + k * 0.4;
    const rad = 96 + 22 * Math.sin(t * 2 + k);
    g.save();
    g.translate(Math.cos(a) * rad, -96 + Math.sin(a) * 26 - (k % 4) * 9);
    g.rotate(a * 1.4);
    g.fillStyle = PAPER[k % 3];
    g.fillRect(-11, -8, 22, 16);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(-7, -3, 14, 2);
    g.fillRect(-7, 2, 10, 2);
    g.restore();
  }
}

export interface BossBarState {
  /** Protegido (no se le puede hacer daño): barra en gris-cian rayada. */
  shielded?: boolean;
  /** Texto a la derecha del nombre (por defecto "JEFE FINAL" / "¡FURIOSO!"). */
  tag?: string;
  tagColor?: string;
  /** Línea chica debajo de la barra (p. ej. qué hacer para dañarlo). */
  caption?: string;
}

/** Barra de vida arriba de todo (entra deslizando y se llena al presentarse). */
export function drawBossBar(g: CanvasRenderingContext2D, cx: number, y: number, w: number, hp: number, trail: number, t: number, show: number, rage: boolean, st: BossBarState = {}) {
  if (show <= 0) return;
  g.save();
  g.globalAlpha = Math.min(1, show * 1.4);
  g.translate(cx, y - (1 - Math.min(1, show)) * 30);
  g.fillStyle = "rgba(19,19,21,0.9)";
  g.strokeStyle = st.shielded ? COLORS.cian : rage && Math.sin(t * 12) > 0 ? "#ff3b3b" : COLORS.rojo;
  g.lineWidth = 3;
  rr(g, -w / 2 - 16, -12, w + 32, 58, 12);
  g.fill();
  g.stroke();
  g.fillStyle = "#fff";
  g.font = '900 17px "Archivo Black", Archivo, Arial';
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText("EL CAOS OPERATIVO", -w / 2, 5);
  g.textAlign = "right";
  g.font = "800 13px Inter, Arial";
  g.fillStyle = st.tagColor ?? (rage ? "#ff8a8a" : "#c9c3d6");
  g.fillText(st.tag ?? (rage ? "¡FURIOSO!" : "JEFE FINAL"), w / 2, 5);
  // barra
  rr(g, -w / 2, 20, w, 16, 8);
  g.fillStyle = "#2a2430";
  g.fill();
  g.save();
  rr(g, -w / 2, 20, w, 16, 8);
  g.clip();
  if (st.shielded) {
    // blindado: la vida se ve pero "detrás de un vidrio" rayado
    g.fillStyle = "#4f6f7a";
    g.fillRect(-w / 2, 20, w * Math.max(0, hp), 16);
    g.fillStyle = "rgba(10,182,188,0.55)";
    const off = (t * 30) % 20;
    for (let x = -w / 2 - 20 + off; x < w / 2; x += 20) {
      g.beginPath();
      g.moveTo(x, 36);
      g.lineTo(x + 8, 36);
      g.lineTo(x + 16, 20);
      g.lineTo(x + 8, 20);
      g.closePath();
      g.fill();
    }
  } else {
    g.fillStyle = "#ffd27a";
    g.fillRect(-w / 2, 20, w * Math.max(0, trail), 16);
    const bg = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    bg.addColorStop(0, "#e80000");
    bg.addColorStop(1, "#fe8100");
    g.fillStyle = bg;
    g.fillRect(-w / 2, 20, w * Math.max(0, hp), 16);
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(-w / 2, 20, w * Math.max(0, hp), 5);
  }
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let k = 1; k < 10; k++) g.fillRect(-w / 2 + (w * k) / 10 - 1, 20, 2, 16);
  g.restore();
  if (st.caption) {
    g.textAlign = "left";
    g.font = "700 14px Inter, Arial";
    g.lineWidth = 5;
    g.strokeStyle = "rgba(19,19,21,0.85)";
    g.strokeText(st.caption, -w / 2 - 14, 64);
    g.fillStyle = st.shielded ? "#bff3f5" : "#fff";
    g.fillText(st.caption, -w / 2 - 14, 64);
  }
  g.restore();
}

/** Franja de "¡ALERTA!" mientras llega el jefe. */
export function drawWarning(g: CanvasRenderingContext2D, W: number, y: number, t: number, k: number) {
  if (k <= 0) return;
  g.save();
  g.globalAlpha = Math.min(1, k);
  g.fillStyle = "rgba(110,8,16,0.62)";
  g.fillRect(0, y - 62, W, 124);
  for (const sy of [y - 62, y + 48]) {
    g.save();
    g.beginPath();
    g.rect(0, sy, W, 14);
    g.clip();
    const off = (t * 140) % 40;
    for (let x = -40; x < W + 40; x += 40) {
      g.fillStyle = "#ffd027";
      g.beginPath();
      g.moveTo(x + off, sy);
      g.lineTo(x + off + 20, sy);
      g.lineTo(x + off + 6, sy + 14);
      g.lineTo(x + off - 14, sy + 14);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  const blink = Math.sin(t * 11) > -0.35;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '900 62px "Archivo Black", Archivo, Arial';
  g.lineWidth = 8;
  g.strokeStyle = "#0A0A0C";
  g.fillStyle = blink ? "#fff" : "#ffb3b3";
  g.strokeText("¡ALERTA!", W / 2, y - 12);
  g.fillText("¡ALERTA!", W / 2, y - 12);
  g.font = "800 19px Inter, Arial";
  g.fillStyle = "#ffd027";
  g.fillText("SE ACERCA EL CAOS OPERATIVO", W / 2, y + 30);
  g.restore();
}

/** "¡CAOS DERROTADO!" con los puntos: entra creciendo y se desvanece a los 3 s (killT en segundos). */
export function drawDefeated(g: CanvasRenderingContext2D, x: number, y: number, killT: number, pts: number) {
  if (killT < 0 || killT >= 3) return;
  const k = Math.min(1, killT / 0.35);
  g.save();
  g.globalAlpha = Math.min(1, (3 - killT) / 0.4);
  g.translate(x, y);
  g.scale(0.6 + 0.4 * k + Math.sin(killT * 8) * 0.015, 0.6 + 0.4 * k);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '900 76px "Archivo Black", Archivo, Arial';
  g.lineWidth = 12;
  g.strokeStyle = "#0A0A0C";
  g.strokeText("¡CAOS DERROTADO!", 0, 0);
  g.fillStyle = COLORS.lima;
  g.fillText("¡CAOS DERROTADO!", 0, 0);
  g.font = '900 30px "Archivo Black", Archivo, Arial';
  g.lineWidth = 8;
  g.strokeText(`+${pts.toLocaleString("es-AR")}`, 0, 64);
  g.fillStyle = "#fff";
  g.fillText(`+${pts.toLocaleString("es-AR")}`, 0, 64);
  g.restore();
}
