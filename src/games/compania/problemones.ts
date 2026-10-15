import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { COLORS } from "@/lib/brand";

/**
 * Problemones, conectores y power-ups de La Compañía, modelados con primitivas
 * "cuidadas" (estilo Crossy Road): cajas redondeadas, contorno oscuro (casco
 * invertido), caras grandes dibujadas en canvas con parpadeo, y accesorios que
 * hacen reconocible a cada uno a 3 metros.
 *
 * Reemplazables por GLB: si en el futuro hay un modelo en assets, basta con
 * devolverlo desde `makeProblemon` con el mismo contrato.
 */

export type Kind = "conector" | "mail" | "fantasma" | "excel" | "caja" | "factura" | "botella" | "auto" | "orq";

type Mood = "cansado" | "preocupado" | "zombie" | "enojado" | "panico" | "gruñon";

export interface Problemon {
  obj: THREE.Object3D;
  /** Se puede saltar por encima. */
  low: boolean;
  /** Altura base del objeto sobre el riel. */
  y: number;
  /** Para animar (parpadeo, bamboleo). */
  tick?: (now: number, phase: number) => void;
}

/* ---------- materiales compartidos ---------- */
const OUTLINE = new THREE.MeshBasicMaterial({ color: COLORS.carbon, side: THREE.BackSide, toneMapped: false });
const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
const M = {
  cream: mat("#F3EADA"),
  creamDark: mat("#E3D6C0"),
  red: mat(COLORS.rojo),
  ghost: mat("#FFFFFF", { transparent: true, opacity: 0.9, roughness: 0.5 }),
  clip: mat("#4B4F57"),
  paper: mat("#FFFFFF"),
  green: mat("#5FA66B"),
  greenDark: mat("#2F6B3A"),
  kraft: mat("#C9A46F"),
  kraftDark: mat("#A8864F"),
  label: mat("#FFFFFF"),
  invoice: mat("#F6E7A8"),
  clock: mat(COLORS.rojo, { roughness: 0.4 }),
  glass: mat("#A9DCC6", { transparent: true, opacity: 0.78, roughness: 0.15 }),
  cork: mat("#B78A5A"),
  plug: new THREE.MeshStandardMaterial({ color: COLORS.cian, emissive: "#065c5f", roughness: 0.35 }),
  prong: new THREE.MeshStandardMaterial({ color: COLORS.lima, emissive: "#5a8a00", roughness: 0.3 }),
  ring: new THREE.MeshBasicMaterial({ color: COLORS.lima, toneMapped: false }),
  bolt: new THREE.MeshStandardMaterial({ color: COLORS.lima, emissive: "#6a9c00", roughness: 0.25 }),
  crown: new THREE.MeshStandardMaterial({ color: COLORS.naranja, emissive: "#7a2a00", roughness: 0.3, metalness: 0.2 }),
};

function rbox(w: number, h: number, d: number, r = 0.12) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.2));
}

/** Malla con contorno oscuro (casco invertido) y sombra. */
function solid(geo: THREE.BufferGeometry, m: THREE.Material, outline = 0.055) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  g.add(mesh);
  if (outline > 0) {
    const o = new THREE.Mesh(geo, OUTLINE);
    o.scale.setScalar(1 + outline);
    g.add(o);
  }
  return g;
}

/* ---------- caras en canvas ---------- */
const faceCache = new Map<string, THREE.CanvasTexture>();
function faceTexture(mood: Mood, closed: boolean) {
  const key = `${mood}-${closed ? 1 : 0}`;
  let tex = faceCache.get(key);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.lineCap = "round";
  g.lineJoin = "round";
  const eye = (x: number, y: number, r: number, pupil = 0.45, px = 0, py = 0.1) => {
    g.fillStyle = "#fff";
    g.strokeStyle = COLORS.carbon;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (closed) {
      g.beginPath();
      g.moveTo(x - r, y + 2);
      g.quadraticCurveTo(x, y + r * 0.9, x + r, y + 2);
      g.lineWidth = 6;
      g.stroke();
      return;
    }
    g.fillStyle = COLORS.carbon;
    g.beginPath();
    g.arc(x + px * r, y + py * r, r * pupil, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(x + px * r - r * 0.15, y + py * r - r * 0.18, r * 0.14, 0, Math.PI * 2);
    g.fill();
  };
  const brow = (x: number, y: number, len: number, angle: number) => {
    g.strokeStyle = COLORS.carbon;
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(x - (len / 2) * Math.cos(angle), y - (len / 2) * Math.sin(angle));
    g.lineTo(x + (len / 2) * Math.cos(angle), y + (len / 2) * Math.sin(angle));
    g.stroke();
  };
  const lid = (x: number, y: number, r: number) => {
    // párpado caído: tapa la mitad superior del ojo
    g.fillStyle = "rgba(33,37,41,0.0)";
    g.strokeStyle = COLORS.carbon;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(x - r, y - r * 0.15);
    g.lineTo(x + r, y - r * 0.15);
    g.stroke();
  };
  const mouth = (d: string) => {
    g.strokeStyle = COLORS.carbon;
    g.lineWidth = 7;
    g.stroke(new Path2D(d));
  };
  const L = 86, R = 170, Y = 64;
  switch (mood) {
    case "cansado":
      eye(L, Y, 30, 0.42, 0, 0.3);
      eye(R, Y, 30, 0.42, 0, 0.3);
      if (!closed) {
        lid(L, Y, 30);
        lid(R, Y, 30);
      }
      g.fillStyle = COLORS.carbon;
      g.beginPath();
      g.ellipse(128, 124, 16, 20, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case "preocupado":
      eye(L, Y + 4, 30, 0.5, 0.1, 0.05);
      eye(R, Y + 4, 30, 0.5, 0.1, 0.05);
      brow(L, 22, 44, 0.35);
      brow(R, 22, 44, -0.35);
      mouth("M104 128 q24 -14 48 0");
      break;
    case "zombie":
      eye(L, Y, 36, 0.3, -0.2, 0.2);
      eye(R, Y + 8, 22, 0.5, 0.3, 0);
      mouth("M90 126 l14 -10 l12 12 l14 -12 l14 12 l12 -10");
      break;
    case "enojado":
      eye(L, Y + 6, 28, 0.5, 0.15, 0.1);
      eye(R, Y + 6, 28, 0.5, -0.15, 0.1);
      brow(L, 26, 46, -0.5);
      brow(R, 26, 46, 0.5);
      mouth("M100 132 q28 -18 56 0");
      break;
    case "panico":
      eye(L, Y, 34, 0.28, 0, 0);
      eye(R, Y, 34, 0.28, 0, 0);
      brow(L, 16, 40, 0.3);
      brow(R, 16, 40, -0.3);
      g.fillStyle = COLORS.carbon;
      g.beginPath();
      g.ellipse(128, 128, 20, 16, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case "gruñon":
      eye(L, Y + 8, 26, 0.5, 0, 0.1);
      eye(R, Y + 8, 26, 0.5, 0, 0.1);
      brow(L, 30, 46, -0.15);
      brow(R, 30, 46, 0.15);
      mouth("M100 126 l56 0");
      break;
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceCache.set(key, tex);
  return tex;
}

/** Plano con la cara; devuelve un tick que parpadea con fase propia. */
function face(parent: THREE.Object3D, mood: Mood, w: number, x: number, y: number, z: number) {
  const open = faceTexture(mood, false);
  const shut = faceTexture(mood, true);
  const m = new THREE.MeshBasicMaterial({ map: open, transparent: true, toneMapped: false, depthWrite: false });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.625), m);
  p.position.set(x, y, z);
  p.renderOrder = 2;
  parent.add(p);
  return (now: number, phase: number) => {
    const k = ((now / 1000 + phase) % 3.7) / 3.7;
    const closed = k > 0.93 && k < 0.98;
    const want = closed ? shut : open;
    if (m.map !== want) {
      m.map = want;
      m.needsUpdate = true;
    }
  };
}

/* ---------- texturas de detalle ---------- */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let gridTex: THREE.Texture | undefined;
let invoiceTex: THREE.Texture | undefined;
let stampTex: THREE.Texture | undefined;
let labelTex: THREE.Texture | undefined;

/* ---------- constructores ---------- */
function mail(): Problemon {
  const g = new THREE.Group();
  const ticks: Problemon["tick"][] = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const env = solid(rbox(2.3, 0.42, 1.5, 0.1), i % 2 ? M.creamDark : M.cream);
    env.position.set((i - 1.5) * 0.14, 0.21 + i * 0.44, 0);
    env.rotation.y = (i % 2 ? 1 : -1) * 0.12;
    env.rotation.z = i * 0.04;
    // solapa: línea oscura en V
    const flap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: "#B59B78" }));
    flap.position.set(-0.45, 0.22, 0.4);
    flap.rotation.y = -0.55;
    const flap2 = flap.clone();
    flap2.position.x = 0.45;
    flap2.rotation.y = 0.55;
    env.add(flap, flap2);
    if (i === 1 || i === 3) {
      const stamp = new THREE.Mesh(rbox(0.5, 0.05, 0.3, 0.02), M.red);
      stamp.position.set(0.6, 0.23, -0.3);
      stamp.rotation.y = -0.4;
      env.add(stamp);
    }
    g.add(env);
  }
  ticks.push(face(g, "cansado", 1.5, 0.2, 0.9, 0.78));
  return { obj: g, low: true, y: 0, tick: (now, ph) => ticks.forEach((t) => t?.(now, ph)) };
}

function fantasma(): Problemon {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 18, 14), M.ghost);
  body.position.y = 0.3;
  body.castShadow = true;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.98, 1.5, 18, 1, true), M.ghost);
  tail.rotation.x = Math.PI;
  tail.position.y = -0.55;
  g.add(body, tail);
  // ondas de la cola
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M.ghost);
    b.position.set((i - 1) * 0.6, -1.25, 0);
    g.add(b);
  }
  // portapapeles
  const clip = solid(rbox(0.7, 0.9, 0.08, 0.04), M.clip, 0.08);
  clip.position.set(0.95, -0.1, 0.55);
  clip.rotation.set(0, -0.5, 0.15);
  const sheet = new THREE.Mesh(rbox(0.58, 0.72, 0.03, 0.02), M.paper);
  sheet.position.z = 0.05;
  clip.add(sheet);
  const lines = canvasTex(64, 80, (c) => {
    c.fillStyle = "#9aa0a6";
    for (let i = 0; i < 5; i++) c.fillRect(8, 12 + i * 13, 48 - i * 6, 4);
    c.fillStyle = COLORS.rojo;
    c.font = "bold 14px Arial";
    c.fillText("LEAD", 8, 10);
  });
  const sheetFace = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), new THREE.MeshBasicMaterial({ map: lines, transparent: true }));
  sheetFace.position.z = 0.07;
  clip.add(sheetFace);
  g.add(clip);
  const tick = face(g, "preocupado", 1.35, 0, 0.45, 0.98);
  return { obj: g, low: false, y: 1.7, tick };
}

function excel(): Problemon {
  const g = new THREE.Group();
  const sheet = solid(rbox(2.0, 2.5, 0.35, 0.08), M.green);
  sheet.position.y = 1.25;
  g.add(sheet);
  gridTex ??= canvasTex(128, 160, (c) => {
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = 2;
    for (let x = 0; x <= 128; x += 32) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 160);
      c.stroke();
    }
    for (let y = 0; y <= 160; y += 32) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(128, y);
      c.stroke();
    }
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(32, 96, 32, 32);
    c.fillRect(96, 32, 32, 32);
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.4), new THREE.MeshBasicMaterial({ map: gridTex, transparent: true }));
  grid.position.set(0, 1.25, 0.19);
  g.add(grid);
  // brazos adelante
  for (const sx of [-1, 1]) {
    const arm = solid(rbox(0.32, 0.32, 1.3, 0.1), M.greenDark);
    arm.position.set(sx * 0.8, 1.0, 0.75);
    arm.rotation.x = -0.15;
    g.add(arm);
  }
  const tick = face(g, "zombie", 1.6, 0, 1.55, 0.2);
  return { obj: g, low: false, y: 0, tick };
}

function caja(): Problemon {
  const g = new THREE.Group();
  const box = solid(rbox(1.8, 1.3, 1.6, 0.06), M.kraft);
  box.position.y = 0.65;
  g.add(box);
  // solapas abiertas
  for (const [x, z, ry] of [
    [0.9, 0, 0],
    [-0.9, 0, 0],
  ] as const) {
    const fl = new THREE.Mesh(rbox(0.05, 0.6, 1.5, 0.02), M.kraftDark);
    fl.position.set(x * 1.0, 1.55, z);
    fl.rotation.z = (x > 0 ? -1 : 1) * 0.6;
    fl.rotation.y = ry;
    g.add(fl);
  }
  // papeles asomando
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(rbox(0.5, 0.75, 0.03, 0.01), M.paper);
    p.position.set(-0.55 + i * 0.22, 1.55 + (i % 2) * 0.15, -0.4 + (i % 3) * 0.3);
    p.rotation.set((i % 2 ? 1 : -1) * 0.3, i * 0.5, (i % 3) * 0.25 - 0.25);
    g.add(p);
  }
  labelTex ??= canvasTex(96, 48, (c) => {
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 96, 48);
    c.fillStyle = "#6b6b6b";
    c.fillRect(10, 30, 60, 5);
    c.fillRect(10, 20, 40, 5);
    c.fillStyle = COLORS.rojo;
    c.font = "bold 13px Arial";
    c.fillText("ARCHIVO", 10, 14);
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map: labelTex }));
  label.position.set(0.35, 0.45, 0.82);
  g.add(label);
  const tick = face(g, "enojado", 1.2, -0.25, 0.9, 0.82);
  return { obj: g, low: true, y: 0, tick };
}

function factura(): Problemon {
  const g = new THREE.Group();
  const sheet = solid(rbox(1.7, 2.3, 0.14, 0.03), M.invoice);
  sheet.position.y = 1.15;
  g.add(sheet);
  invoiceTex ??= canvasTex(128, 176, (c) => {
    c.fillStyle = "#8a7d55";
    for (let i = 0; i < 7; i++) c.fillRect(14, 56 + i * 14, 100 - (i % 3) * 20, 4);
    c.fillStyle = "#4a4330";
    c.fillRect(14, 20, 50, 7);
    c.fillRect(14, 34, 30, 5);
  });
  const text = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshBasicMaterial({ map: invoiceTex, transparent: true }));
  text.position.set(0, 1.15, 0.08);
  g.add(text);
  stampTex ??= canvasTex(128, 128, (c) => {
    c.strokeStyle = COLORS.rojo;
    c.lineWidth = 8;
    c.beginPath();
    c.arc(64, 64, 54, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = COLORS.rojo;
    c.font = "bold 24px Arial Black, Arial";
    c.textAlign = "center";
    c.fillText("VENCIDA", 64, 72);
  });
  const stamp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: stampTex, transparent: true }));
  stamp.position.set(0.1, 0.75, 0.09);
  stamp.rotation.z = -0.35;
  g.add(stamp);
  // reloj despertador arriba
  const clock = new THREE.Group();
  clock.position.set(0.45, 2.55, 0);
  clock.add(solid(new THREE.SphereGeometry(0.34, 14, 12), M.clock));
  for (const sx of [-1, 1]) {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.clock);
    bell.position.set(sx * 0.28, 0.28, 0);
    clock.add(bell);
  }
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: "#fff" }));
  dial.position.z = 0.3;
  const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.18), new THREE.MeshBasicMaterial({ color: COLORS.carbon }));
  hand.position.set(0, 0.08, 0.31);
  clock.add(dial, hand);
  g.add(clock);
  const tick = face(g, "panico", 1.3, 0, 1.75, 0.1);
  return { obj: g, low: false, y: 0, tick };
}

function botella(): Problemon {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 4.4, 6, 18), M.glass);
  body.rotation.z = Math.PI / 2;
  body.position.set(-0.4, 1.3, 0);
  body.castShadow = true;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.75, 1.6, 14), M.glass);
  neck.rotation.z = -Math.PI / 2;
  neck.position.set(3.0, 1.3, 0);
  const cork = solid(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12), M.cork, 0.08);
  cork.rotation.z = Math.PI / 2;
  cork.position.set(3.95, 1.3, 0);
  // reflejo
  const shine = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 2.4, 4, 8), new THREE.MeshBasicMaterial({ color: "#fff", transparent: true, opacity: 0.55 }));
  shine.rotation.z = Math.PI / 2;
  shine.position.set(-0.6, 2.05, 0.55);
  g.add(body, neck, cork, shine);
  const tick = face(g, "gruñon", 1.5, -0.9, 1.45, 1.15);
  return { obj: g, low: false, y: 0, tick };
}

function conector(): Problemon {
  const g = new THREE.Group();
  const body = solid(rbox(0.9, 1.0, 0.7, 0.2), M.plug, 0.06);
  for (const sx of [-1, 1]) {
    const pr = new THREE.Mesh(rbox(0.16, 0.5, 0.16, 0.05), M.prong);
    pr.position.set(sx * 0.25, 0.7, 0);
    body.add(pr);
  }
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 10), M.plug);
  cable.position.y = -0.7;
  body.add(cable);
  g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 28), M.ring);
  g.add(ring);
  return { obj: g, low: false, y: 1.5, tick: (now) => (ring.rotation.x = now / 900) };
}

function bolt(): Problemon {
  const s = new THREE.Shape([
    [0.15, 1.1],
    [-0.55, 0.05],
    [-0.1, 0.05],
    [-0.35, -1.1],
    [0.55, 0.15],
    [0.1, 0.15],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  geo.center();
  const g = solid(geo, M.bolt, 0.06);
  return { obj: g, low: false, y: 1.6 };
}

function crown(): Problemon {
  const s = new THREE.Shape([
    [-0.9, -0.5],
    [-0.9, 0.3],
    [-0.45, -0.05],
    [0, 0.6],
    [0.45, -0.05],
    [0.9, 0.3],
    [0.9, -0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  geo.center();
  const g = solid(geo, M.crown, 0.06);
  return { obj: g, low: false, y: 1.6 };
}

export function makeProblemon(kind: Kind): Problemon {
  switch (kind) {
    case "mail":
      return mail();
    case "fantasma":
      return fantasma();
    case "excel":
      return excel();
    case "caja":
      return caja();
    case "factura":
      return factura();
    case "botella":
      return botella();
    case "conector":
      return conector();
    case "auto":
      return bolt();
    case "orq":
      return crown();
  }
}
