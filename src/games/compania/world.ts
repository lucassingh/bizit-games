import * as THREE from "three";
import { BIZIT_MARK_PATH, COLORS } from "@/lib/brand";

/**
 * La compañía (mundo compartido): maqueta diurna, amigable y bien visible.
 * Cuatro lotes separados por calles: Ventas, Operaciones, Finanzas y HQ Bizit.
 * Cada área tiene un "power" 0→1 que la lleva de gris (caos) a color (integrada).
 */

export type ZoneId = "ventas" | "operaciones" | "finanzas" | "hq";

export interface Zone {
  id: ZoneId;
  center: THREE.Vector3;
  power: number;
  target: number;
  mats: { m: THREE.MeshStandardMaterial; off: THREE.Color; on: THREE.Color; emissiveOn?: THREE.Color }[];
  windows: { mesh: THREE.InstancedMesh; ons: THREE.Color[] }[];
  edges: THREE.LineSegments[];
  ring: THREE.Mesh;
  extras: THREE.Object3D[];
}

const C = (h: string | number) => new THREE.Color(h);
const grey = (hex: string | number) => {
  const c = C(hex);
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  return new THREE.Color(l * 0.78, l * 0.78, l * 0.82);
};

export const ROAD = { half: 6, lots: 58 };

export function buildWorld(scene: THREE.Scene) {
  const zones: Record<ZoneId, Zone> = {} as Record<ZoneId, Zone>;
  const dynamic: THREE.Object3D[] = [];

  /* ---------- terreno ---------- */
  const groundMat = new THREE.MeshStandardMaterial({ color: "#E9E3DB", roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const lotMat = new THREE.MeshStandardMaterial({ color: "#F4F0EA", roughness: 1 });
  const grassMat = new THREE.MeshStandardMaterial({ color: "#CFE3BF", roughness: 1 });
  for (const [sx, sz] of [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const lot = new THREE.Mesh(new THREE.BoxGeometry(46, 0.4, 46), lotMat);
    lot.position.set(sx * 29, 0.2, sz * 29);
    lot.receiveShadow = true;
    scene.add(lot);
    const grass = new THREE.Mesh(new THREE.BoxGeometry(40, 0.45, 40), grassMat);
    grass.position.set(sx * 29, 0.2, sz * 29);
    grass.receiveShadow = true;
    scene.add(grass);
  }
  // calles (cuadrícula de 3x3) con líneas: todo instanciado (pocas llamadas de dibujo)
  const roadMat = new THREE.MeshStandardMaterial({ color: "#7A7D85", roughness: 0.95 });
  const roadGeo = new THREE.PlaneGeometry(12, 150).rotateX(-Math.PI / 2);
  const dashGeo = new THREE.PlaneGeometry(0.35, 2.6).rotateX(-Math.PI / 2);
  const edgeGeo = new THREE.PlaneGeometry(0.3, 150).rotateX(-Math.PI / 2);
  const roads = new THREE.InstancedMesh(roadGeo, roadMat, 6);
  const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({ color: "#E3B23C" }), 6 * 24);
  const edgeLines = new THREE.InstancedMesh(edgeGeo, new THREE.MeshBasicMaterial({ color: "#F5F2EE" }), 12);
  roads.receiveShadow = true;
  const o = new THREE.Object3D();
  let ri = 0, di = 0, ei = 0;
  for (const c of [-58, 0, 58]) {
    for (const vertical of [true, false]) {
      o.rotation.set(0, vertical ? 0 : Math.PI / 2, 0);
      o.position.set(vertical ? c : 0, 0.02, vertical ? 0 : c);
      o.updateMatrix();
      roads.setMatrixAt(ri++, o.matrix);
      for (let k = -72; k < 72; k += 6) {
        o.position.set(vertical ? c : k, 0.04, vertical ? k : c);
        o.updateMatrix();
        dashes.setMatrixAt(di++, o.matrix);
      }
      for (const side of [-1, 1]) {
        o.position.set(vertical ? c + side * 5.6 : 0, 0.035, vertical ? 0 : c + side * 5.6);
        o.updateMatrix();
        edgeLines.setMatrixAt(ei++, o.matrix);
      }
    }
  }
  scene.add(roads, dashes, edgeLines);
  // ciudad de fondo, liviana (una sola llamada de dibujo)
  const far = new THREE.InstancedMesh(new THREE.BoxGeometry(14, 1, 14), new THREE.MeshStandardMaterial({ color: "#E2DBD2", roughness: 1 }), 46);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const r = 165 + (i % 3) * 26;
    const h = 10 + ((i * 37) % 30);
    o.rotation.set(0, 0, 0);
    o.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    o.scale.set(1, h, 1);
    o.updateMatrix();
    far.setMatrixAt(i, o.matrix);
  }
  o.scale.set(1, 1, 1);
  scene.add(far);

  /* ---------- helpers ---------- */
  function mk(z: Zone | null, hex: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    const m = new THREE.MeshStandardMaterial({ color: z ? grey(hex) : C(hex), roughness: 0.82, metalness: 0.02, flatShading: true, ...opts });
    if (z) z.mats.push({ m, off: grey(hex), on: C(hex) });
    return m;
  }
  function box(z: Zone | null, w: number, h: number, d: number, hex: string, x: number, y: number, zz: number, opts?: Partial<THREE.MeshStandardMaterialParameters>) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mk(z, hex, opts));
    m.position.set(x, y + h / 2, zz);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function cyl(z: Zone | null, r: number, h: number, hex: string, x: number, y: number, zz: number, seg = 18) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mk(z, hex));
    m.position.set(x, y + h / 2, zz);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function edges(z: Zone, mesh: THREE.Mesh, col: string = COLORS.cian) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0 }));
    e.position.copy(mesh.position);
    e.scale.setScalar(1.01);
    scene.add(e);
    z.edges.push(e);
  }
  const winGeo = new THREE.BoxGeometry(1, 1, 0.15);
  function windows(z: Zone, o: { x: number; y: number; zz: number; w: number; h: number; face: "x" | "z"; cols: number; rows: number; ww?: number; wh?: number; flip?: boolean }) {
    const n = o.cols * o.rows;
    const mesh = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    const d = new THREE.Object3D();
    const ons: THREE.Color[] = [];
    let i = 0;
    for (let r = 0; r < o.rows; r++)
      for (let c = 0; c < o.cols; c++) {
        const u = (c + 0.5) / o.cols - 0.5, v = (r + 0.5) / o.rows;
        d.position.set(o.face === "x" ? o.x : o.x + u * o.w, o.y + v * o.h, o.face === "x" ? o.zz + u * o.w : o.zz);
        d.rotation.y = o.face === "x" ? Math.PI / 2 : 0;
        d.scale.set(o.ww ?? 1.3, o.wh ?? 1.5, 1);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        mesh.setColorAt(i, C("#5f6470"));
        ons.push(Math.random() < 0.85 ? C("#FFB45C").lerp(C("#FFE2A6"), Math.random() * 0.7) : C("#9FD3DB"));
        i++;
      }
    mesh.instanceColor!.needsUpdate = true;
    scene.add(mesh);
    z.windows.push({ mesh, ons });
  }
  function zone(id: ZoneId, cx: number, cz: number): Zone {
    const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.lima, transparent: true, opacity: 0, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(19, 20.5, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.5, cz);
    scene.add(ring);
    const z: Zone = { id, center: new THREE.Vector3(cx, 0, cz), power: 0, target: 0, mats: [], windows: [], edges: [], ring, extras: [] };
    zones[id] = z;
    return z;
  }
  function tree(x: number, z: number, zn: Zone) {
    cyl(null, 0.35, 2, "#8B6B4E", x, 0.4, z, 6);
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), mk(zn, "#5DAE6A"));
    top.position.set(x, 3.6, z);
    top.castShadow = true;
    scene.add(top);
  }
  function car(x: number, z: number, hex: string, rot: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 2), new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45, flatShading: true }));
    body.position.y = 0.9;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.8), new THREE.MeshStandardMaterial({ color: "#2B3A4A", roughness: 0.2, metalness: 0.4 }));
    cab.position.set(-0.2, 1.8, 0);
    g.add(body, cab);
    g.traverse((o) => (o.castShadow = true));
    g.position.set(x, 0.4, z);
    g.rotation.y = rot;
    scene.add(g);
    return g;
  }

  /* ---------- VENTAS (x<0, z>0): oficina comercial ---------- */
  {
    const z = zone("ventas", -29, 29);
    const b = box(z, 26, 10, 18, "#FFFFFF", -29, 0.4, 29);
    edges(z, b);
    const top = box(z, 12, 4, 10, "#F1ECE6", -31, 10.4, 27);
    edges(z, top, COLORS.lima);
    box(z, 26.6, 0.7, 3, COLORS.naranja, -29, 4.6, 39.4); // toldo
    box(z, 24, 4, 0.4, "#9CC7D6", -29, 0.6, 38.1, { roughness: 0.2, metalness: 0.3 }); // vidriera
    box(z, 10, 2.2, 0.4, COLORS.naranja, -29, 7.4, 38.3); // cartel
    windows(z, { x: -29, y: 5.6, zz: 38.15, w: 22, h: 4, face: "z", cols: 7, rows: 1 });
    windows(z, { x: -15.9, y: 1.4, zz: 29, w: 15, h: 8, face: "x", cols: 5, rows: 2 });
    windows(z, { x: -42.1, y: 1.4, zz: 29, w: 15, h: 8, face: "x", cols: 5, rows: 2 });
    cyl(z, 0.2, 5, "#9AA0A6", -26, 14.4, 25);
    const dish = cyl(z, 1.4, 0.5, "#E6E6F0", -34, 14.4, 25, 14);
    z.extras.push(dish);
    tree(-50, 45, z);
    tree(-46, 12, z);
    tree(-12, 46, z);
  }

  /* ---------- OPERACIONES (x>0, z>0): fábrica ---------- */
  {
    const z = zone("operaciones", 29, 29);
    const b = box(z, 26, 11, 20, "#DCCFB9", 29, 0.4, 27);
    edges(z, b);
    box(z, 26.6, 1, 20.6, "#B9AE9C", 29, 11.4, 27);
    const ch1 = cyl(z, 1.8, 12, "#E6DCCB", 36, 11.6, 22);
    cyl(z, 1.85, 0.8, COLORS.rojo, 36, 22.8, 22);
    const ch2 = cyl(z, 1.8, 10, "#E6DCCB", 40, 11.6, 26);
    cyl(z, 1.85, 0.8, COLORS.rojo, 40, 20.8, 26);
    edges(z, ch1, COLORS.lima);
    edges(z, ch2, COLORS.lima);
    for (const [x, zz] of [
      [21, 21],
      [25, 31],
    ]) {
      box(z, 4.4, 2.4, 3.2, "#F1F1F1", x, 11.6, zz);
      for (let k = 0; k < 5; k++) box(null, 0.14, 1.8, 0.06, "#6B6B70", x - 1.6 + k * 0.8, 11.9, zz + 1.63);
    }
    for (let r = 0; r < 5; r++) box(z, 2.2, 0.45, 0.12, "#E3B23C", 24 + (r % 2 ? 2.6 : 0), 2 + r * 1.7, 37.1);
    windows(z, { x: 32, y: 1.6, zz: 37.08, w: 14, h: 8, face: "z", cols: 5, rows: 2 });
    windows(z, { x: 42.08, y: 1.6, zz: 27, w: 16, h: 8, face: "x", cols: 6, rows: 2 });
    // estacionamiento con líneas amarillas (como la referencia)
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 5), new THREE.MeshBasicMaterial({ color: "#E3B23C" }));
      l.rotation.x = -Math.PI / 2;
      l.position.set(18 + i * 4.2, 0.46, 46);
      scene.add(l);
    }
    car(20.1, 46, "#2F9E44", Math.PI / 2);
    car(24.3, 46, "#FFFFFF", Math.PI / 2);
    car(32.7, 46, COLORS.naranja, Math.PI / 2);
    z.extras.push(ch1, ch2);
    tree(48, 12, z);
    tree(12, 48, z);
  }

  /* ---------- FINANZAS (x>0, z<0): torre de vidrio ---------- */
  {
    const z = zone("finanzas", 29, -29);
    box(z, 22, 1.6, 22, "#EDE7DF", 29, 0.4, -29);
    const t = box(z, 15, 26, 15, "#8FC1D3", 29, 2, -29, { roughness: 0.25, metalness: 0.35 });
    edges(z, t);
    const t2 = box(z, 10, 7, 10, "#A9D0DE", 29, 28, -29, { roughness: 0.25, metalness: 0.35 });
    edges(z, t2, COLORS.lima);
    for (let k = 0; k < 4; k++) cyl(z, 0.6, 4.6, "#FFFFFF", 22 + k * 4.6, 2, -18.6, 10);
    windows(z, { x: 29, y: 3, zz: -21.42, w: 13, h: 23, face: "z", cols: 5, rows: 9, ww: 1.8, wh: 1.4 });
    windows(z, { x: 36.58, y: 3, zz: -29, w: 13, h: 23, face: "x", cols: 5, rows: 9, ww: 1.8, wh: 1.4 });
    windows(z, { x: 21.42, y: 3, zz: -29, w: 13, h: 23, face: "x", cols: 5, rows: 9, ww: 1.8, wh: 1.4 });
    tree(48, -12, z);
    tree(12, -48, z);
  }

  /* ---------- HQ BIZIT (x<0, z<0) ---------- */
  let logoTex: THREE.CanvasTexture;
  let drawLogo: (on: boolean) => void;
  {
    const z = zone("hq", -29, -29);
    box(z, 24, 1.6, 24, "#EDE7DF", -29, 0.4, -29);
    const t = box(z, 16, 36, 16, "#3A3D44", -29, 2, -29);
    edges(z, t, COLORS.naranja);
    const crown = box(z, 12, 4, 12, "#2B2D33", -29, 38, -29);
    edges(z, crown, COLORS.lima);
    const band = box(z, 16.4, 1, 16.4, COLORS.naranja, -29, 36, -29);
    z.mats.find((x) => x.m === band.material)!.emissiveOn = C("#7a2a00");
    cyl(z, 0.2, 6, "#9AA0A6", -29, 42, -29);
    windows(z, { x: -29, y: 3, zz: -20.92, w: 14, h: 32, face: "z", cols: 5, rows: 12, ww: 2, wh: 1.2 });
    windows(z, { x: -20.92, y: 3, zz: -29, w: 14, h: 32, face: "x", cols: 5, rows: 12, ww: 2, wh: 1.2 });
    // panel con el logo de Bizit (textura de canvas)
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 180;
    const g = cv.getContext("2d")!;
    logoTex = new THREE.CanvasTexture(cv);
    logoTex.colorSpace = THREE.SRGBColorSpace;
    drawLogo = (on: boolean) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 512, 180);
      g.save();
      g.translate(26, 22);
      g.scale(1.38, 1.38);
      const p = new Path2D(BIZIT_MARK_PATH);
      const gr = g.createLinearGradient(101.7, 48, 11.3, 48);
      gr.addColorStop(0.6573, on ? "#E80000" : "#9a9aa0");
      gr.addColorStop(1, on ? "#FF8600" : "#b8b8bd");
      g.fillStyle = gr;
      g.fill(p);
      g.restore();
      g.font = "900 92px Archivo, 'Arial Black', Arial";
      g.fillStyle = on ? "#FA6B00" : "#a8a8ad";
      g.textBaseline = "middle";
      g.fillText("BIZIT", 200, 96);
      logoTex.needsUpdate = true;
    };
    drawLogo(false);
    const pm = new THREE.MeshBasicMaterial({ map: logoTex, toneMapped: false });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.9), pm);
    p1.position.set(-29, 33, -20.85);
    scene.add(p1);
    const p2 = p1.clone();
    p2.rotation.y = Math.PI / 2;
    p2.position.set(-20.85, 33, -29);
    scene.add(p2);
    tree(-48, -12, z);
    tree(-12, -48, z);
    tree(-48, -48, z);
  }

  // faroles
  for (const [x, zz] of [
    [-6.8, 20],
    [6.8, 40],
    [-40, 6.8],
    [40, -6.8],
    [64.8, 20],
    [64.8, -30],
    [-20, -64.8],
  ]) {
    cyl(null, 0.15, 6, "#6B6E75", x, 0, zz, 6);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: "#FFD08A" }));
    l.position.set(x, 6.2, zz);
    scene.add(l);
  }

  /* ---------- arcos de IA: cada área → HQ ---------- */
  const arcs: Partial<Record<ZoneId, THREE.Mesh>> = {};
  const hqTop = new THREE.Vector3(-29, 40, -29);
  for (const id of ["ventas", "operaciones", "finanzas"] as const) {
    const from = zones[id].center.clone().setY(id === "finanzas" ? 34 : 15);
    const mid = from.clone().add(hqTop).multiplyScalar(0.5).setY(58);
    const c = new THREE.QuadraticBezierCurve3(from, mid, hqTop);
    const m = new THREE.MeshBasicMaterial({ color: COLORS.cian, transparent: true, opacity: 0, toneMapped: false });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 60, 0.35, 8, false), m);
    scene.add(tube);
    arcs[id] = tube;
  }

  /** Aplica el "power" de cada zona: color, ventanas, contornos, anillo y arco. */
  const tmpC = new THREE.Color();
  let logoOn = false;
  function applyPower(z: Zone) {
    for (const { m, off, on, emissiveOn } of z.mats) {
      m.color.copy(off).lerp(on, z.power);
      if (emissiveOn) m.emissive.copy(emissiveOn).multiplyScalar(z.power);
    }
    for (const w of z.windows) {
      for (let i = 0; i < w.mesh.count; i++) {
        const thr = (i * 0.618) % 1;
        const k = THREE.MathUtils.smoothstep(z.power, thr * 0.7, thr * 0.7 + 0.3);
        tmpC.set("#5f6470").lerp(w.ons[i], k);
        w.mesh.setColorAt(i, tmpC);
      }
      w.mesh.instanceColor!.needsUpdate = true;
    }
    for (const e of z.edges) (e.material as THREE.LineBasicMaterial).opacity = z.power * 0.9;
    (z.ring.material as THREE.MeshBasicMaterial).opacity = z.power * 0.85;
    const arc = arcs[z.id];
    if (arc) (arc.material as THREE.MeshBasicMaterial).opacity = z.power * 0.85;
    if (z.id === "hq" && z.power > 0.5 !== logoOn) {
      logoOn = z.power > 0.5;
      drawLogo(logoOn);
    }
  }

  (Object.values(zones) as Zone[]).forEach(applyPower);
  return { zones, applyPower, dynamic };
}
