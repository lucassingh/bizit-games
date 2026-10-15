import { COLORS } from "@/lib/brand";

/**
 * Escenografía de "Bandeja BGen": la Casa Central por dentro, en corte frontal.
 * Fondo vectorial (hasta que llegue el Furniture Kit de Kenney para renderizarla en 3D):
 * ventanal con la ciudad, columnas, pizarra, plantas, máquina de café y una fila
 * de escritorios con personas. El estado de la oficina (0 = caos, 1 = ordenada)
 * cambia lo que se ve: papeles por el piso, posturas, pantallas.
 */

const INK = COLORS.carbon;
const NAVY = "#3A3F4B";
const WALL = "#F4F1EC";
const WALL2 = "#E7E1D8";
const WOOD = "#D8B48A";
const WOOD2 = "#B98E63";

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Capa estática: paredes, ventanal, mobiliario fijo. Se cachea. */
export function drawOfficeStatic(g: CanvasRenderingContext2D, W: number, H: number, FLOOR: number, city?: HTMLImageElement | null) {
  // pared
  g.fillStyle = WALL;
  g.fillRect(0, 0, W, FLOOR);
  // zócalo y piso
  g.fillStyle = "#CFC6BB";
  g.fillRect(0, FLOOR - 10, W, 10);
  const fl = g.createLinearGradient(0, FLOOR, 0, H);
  fl.addColorStop(0, "#DDD3C6");
  fl.addColorStop(1, "#C9BEB0");
  g.fillStyle = fl;
  g.fillRect(0, FLOOR, W, H - FLOOR);
  g.strokeStyle = "rgba(0,0,0,0.06)";
  g.lineWidth = 2;
  for (let x = -200; x < W + 200; x += 120) {
    g.beginPath();
    g.moveTo(x, FLOOR);
    g.lineTo(x - 60, H);
    g.stroke();
  }
  // ventanal grande con la ciudad
  const wx = 190, wy = 70, ww = W - 380, wh = 300;
  g.fillStyle = "#BFE0F3";
  rr(g, wx, wy, ww, wh, 10);
  g.fill();
  g.save();
  rr(g, wx, wy, ww, wh, 10);
  g.clip();
  const sky = g.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, "#A9D8F2");
  sky.addColorStop(1, "#EAF3F8");
  g.fillStyle = sky;
  g.fillRect(wx, wy, ww, wh);
  if (city && city.complete && city.naturalWidth) {
    const iw = ww * 1.25, ih = iw * (city.naturalHeight / city.naturalWidth);
    g.drawImage(city, wx - (iw - ww) / 2, wy + wh - ih * 0.95, iw, ih);
    g.fillStyle = "rgba(226,238,247,0.35)";
    g.fillRect(wx, wy, ww, wh);
  }
  g.restore();
  // marco y parantes del ventanal
  g.strokeStyle = NAVY;
  g.lineWidth = 10;
  rr(g, wx, wy, ww, wh, 10);
  g.stroke();
  g.fillStyle = NAVY;
  for (let k = 1; k < 4; k++) g.fillRect(wx + (ww * k) / 4 - 4, wy, 8, wh);
  g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
  // cartel de la empresa sobre el ventanal
  g.fillStyle = COLORS.naranja;
  rr(g, W / 2 - 150, 18, 300, 38, 6);
  g.fill();
  g.fillStyle = "#fff";
  g.font = '900 20px "Archivo Black", Archivo, Arial';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("CASA CENTRAL", W / 2, 38);

  // columnas laterales
  for (const x of [40, W - 120]) {
    g.fillStyle = WALL2;
    g.fillRect(x, 0, 80, FLOOR);
    g.fillStyle = "rgba(0,0,0,0.06)";
    g.fillRect(x + 64, 0, 16, FLOOR);
  }
  // pizarra a la izquierda
  g.fillStyle = "#2E6B4F";
  rr(g, 190, 395, 170, 110, 6);
  g.fill();
  g.strokeStyle = WOOD2;
  g.lineWidth = 8;
  g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.75)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(210, 480);
  g.lineTo(240, 450);
  g.lineTo(270, 465);
  g.lineTo(300, 425);
  g.lineTo(340, 440);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.font = "700 12px Inter, Arial";
  g.textAlign = "left";
  g.fillText("Q4", 206, 414);
  // máquina de café a la derecha
  g.fillStyle = NAVY;
  rr(g, W - 330, 400, 70, 105, 8);
  g.fill();
  g.fillStyle = "#8EC9EC";
  rr(g, W - 320, 410, 50, 26, 4);
  g.fill();
  g.fillStyle = COLORS.naranja;
  g.fillRect(W - 318, 446, 14, 10);
  g.fillStyle = "#fff";
  rr(g, W - 303, 470, 18, 16, 3);
  g.fill();
  // plantas
  for (const x of [150, W - 170]) {
    g.fillStyle = "#B98E63";
    rr(g, x - 18, FLOOR - 56, 36, 46, 6);
    g.fill();
    for (const [dx, dy, r, c] of [
      [0, -70, 24, "#3F9E5C"],
      [-18, -58, 18, "#2E7A45"],
      [18, -60, 20, "#2E7A45"],
      [0, -48, 20, "#3F9E5C"],
    ] as [number, number, number, string][]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x + dx, FLOOR + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Escritorio con persona. `mood` 0 = tapado de papeles y frustrado, 1 = ordenado y contento. */
export function drawDesk(g: CanvasRenderingContext2D, x: number, FLOOR: number, mood: number, t: number, seed: number) {
  const dw = 150, dh = 14;
  const dy = FLOOR - 64;
  // patas
  g.fillStyle = WOOD2;
  g.fillRect(x - dw / 2 + 8, dy, 10, 64);
  g.fillRect(x + dw / 2 - 18, dy, 10, 64);
  // persona (detrás del escritorio)
  const bob = Math.sin(t * 2 + seed) * 2;
  const skin = ["#F1C9A5", "#C68B5B", "#8D5A3C", "#F5D6B8"][seed % 4];
  const shirt = [COLORS.cian, "#5B6B7A", COLORS.naranja, "#7A5BA8"][seed % 4];
  const sag = (1 - mood) * 10; // encorvado cuando hay caos
  g.fillStyle = shirt;
  rr(g, x - 26, dy - 44 + sag + bob, 52, 50, 12);
  g.fill();
  g.fillStyle = skin;
  g.beginPath();
  g.arc(x, dy - 60 + sag + bob, 20, 0, Math.PI * 2);
  g.fill();
  // pelo
  g.fillStyle = ["#2B2B2B", "#6B3E26", "#D9A441", "#4A3F6B"][seed % 4];
  g.beginPath();
  g.arc(x, dy - 66 + sag + bob, 20, Math.PI, 0);
  g.fill();
  // cara: boca según ánimo
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  g.lineCap = "round";
  g.beginPath();
  if (mood > 0.5) g.arc(x, dy - 56 + sag + bob, 7, 0.15 * Math.PI, 0.85 * Math.PI);
  else g.arc(x, dy - 48 + sag + bob, 7, 1.15 * Math.PI, 1.85 * Math.PI);
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(x - 7, dy - 62 + sag + bob, 2.2, 0, Math.PI * 2);
  g.arc(x + 7, dy - 62 + sag + bob, 2.2, 0, Math.PI * 2);
  g.fill();
  // tapa del escritorio
  g.fillStyle = WOOD;
  rr(g, x - dw / 2, dy - dh, dw, dh, 4);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.stroke();
  // monitor
  g.fillStyle = NAVY;
  rr(g, x - 24, dy - dh - 36, 48, 32, 4);
  g.fill();
  g.fillStyle = mood > 0.5 ? COLORS.lima : "#8EC9EC";
  g.fillRect(x - 20, dy - dh - 32, 40, 24);
  g.fillStyle = NAVY;
  g.fillRect(x - 5, dy - dh - 5, 10, 5);
  // papeles sobre el escritorio (caos)
  const piles = Math.round((1 - mood) * 4);
  for (let i = 0; i < piles; i++) {
    g.fillStyle = i % 2 ? "#F6EEDC" : "#E8DDC6";
    g.save();
    g.translate(x - 50 + i * 26, dy - dh - 6 - i * 3);
    g.rotate((i % 2 ? 1 : -1) * 0.15);
    g.fillRect(-12, -8, 24, 16);
    g.strokeStyle = "rgba(33,37,41,0.4)";
    g.lineWidth = 1.5;
    g.strokeRect(-12, -8, 24, 16);
    g.restore();
  }
  // taza o planta cuando está ordenado
  if (mood > 0.5) {
    g.fillStyle = COLORS.naranja;
    rr(g, x + 40, dy - dh - 14, 14, 14, 3);
    g.fill();
  }
}

/** Tablero "AUTOMATIZADO" con contador, arriba a la derecha de la escena. */
export function drawBoard(g: CanvasRenderingContext2D, x: number, y: number, done: number, total: number) {
  g.save();
  g.fillStyle = INK;
  rr(g, x - 110, y - 34, 220, 68, 10);
  g.fill();
  g.fillStyle = COLORS.lima;
  g.font = '800 11px Inter, Arial';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("AUTOMATIZADO", x, y - 16);
  g.fillStyle = "#fff";
  g.font = '900 30px "Archivo Black", Archivo, Arial';
  g.fillText(`${done}`, x - 20, y + 12);
  g.fillStyle = "#9aa0a6";
  g.font = '700 14px Inter, Arial';
  g.fillText(`/ ${total}`, x + 36, y + 14);
  g.restore();
}
