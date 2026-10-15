import * as THREE from "three";
import { COLORS } from "@/lib/brand";
import { baseMaterial, instance, loadModel, powerMaterial, type KitName, type PowerMaterial } from "./kit";

/**
 * La compañía (mundo compartido): maqueta diurna armada con el Kenney City Kit
 * (CC0). Cuatro lotes separados por calles: Ventas, Operaciones, Finanzas y la
 * Casa Central de la empresa del visitante. Cada área tiene un "power" 0→1 que
 * la lleva de gris (caos) a color (integrada) y enciende su cartel.
 */

export type ZoneId = "ventas" | "operaciones" | "finanzas" | "hq";

export interface Zone {
  id: ZoneId;
  name: string;
  center: THREE.Vector3;
  power: number;
  target: number;
  /** Materiales del kit con desaturación por power. */
  pm: PowerMaterial[];
  /** Materiales propios (cartel, props) que van de gris a color. */
  mats: { m: THREE.MeshStandardMaterial; off: THREE.Color; on: THREE.Color; emissiveOn?: THREE.Color }[];
  ring: THREE.Mesh;
  sign?: { tex: THREE.CanvasTexture; draw: (on: boolean) => void; lit: boolean };
  extras: THREE.Object3D[];
}

const C = (h: string | number) => new THREE.Color(h);
const grey = (hex: string | number) => {
  const c = C(hex);
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  return new THREE.Color(l * 0.78, l * 0.78, l * 0.82);
};

export const ROAD = { half: 6, lots: 58 };
/** Escala del kit: una baldosa de Kenney = S unidades del mundo. */
const S = 10.5;
/** Los árboles del kit son chicos frente a los edificios: van más grandes. */
const T = S * 1.9;

const ZONE_NAMES: Record<ZoneId, string> = { ventas: "VENTAS", operaciones: "OPERACIONES", finanzas: "FINANZAS", hq: "CASA CENTRAL" };

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
  function zone(id: ZoneId, cx: number, cz: number): Zone {
    const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.lima, transparent: true, opacity: 0, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(19, 20.5, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.5, cz);
    scene.add(ring);
    const z: Zone = { id, name: ZONE_NAMES[id], center: new THREE.Vector3(cx, 0, cz), power: 0, target: 0, pm: [], mats: [], ring, extras: [] };
    zones[id] = z;
    return z;
  }

  /** Cartel del área: tablero sobre dos postes, mirando a la calle; se enciende con el power. */
  function sign(z: Zone, x: number, zz: number, rotY: number, wide = false) {
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 256;
    const g = cv.getContext("2d")!;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const draw = (on: boolean) => {
      g.fillStyle = on ? COLORS.naranja : "#9d9a97";
      g.fillRect(0, 0, 1024, 256);
      g.fillStyle = on ? "#ffffff" : "#e6e3df";
      g.textAlign = "center";
      g.textBaseline = "middle";
      let px = 150;
      g.font = `900 ${px}px 'Archivo Black', Archivo, 'Arial Black', Arial`;
      while (g.measureText(z.name).width > 940 && px > 60) g.font = `900 ${(px -= 6)}px 'Archivo Black', Archivo, 'Arial Black', Arial`;
      g.fillText(z.name, 512, 140);
      g.fillStyle = on ? "#212529" : "#6f6c69";
      g.fillRect(0, 232, 1024, 24);
      tex.needsUpdate = true;
    };
    draw(false);
    const w = wide ? 24 : 18, h = w / 4;
    const grp = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), [
      mk(null, "#212529"),
      mk(null, "#212529"),
      mk(null, "#212529"),
      mk(null, "#212529"),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    ]);
    board.position.y = 9 + h / 2;
    board.castShadow = true;
    grp.add(board);
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 9.2, 8), mk(null, "#4b4f57"));
      pole.position.set(sx * (w / 2 - 1.2), 4.6, 0);
      pole.castShadow = true;
      grp.add(pole);
    }
    grp.position.set(x, 0.4, zz);
    grp.rotation.y = rotY;
    grp.name = `sign:${z.id}`;
    scene.add(grp);
    z.sign = { tex, draw, lit: false };
  }

  zone("ventas", -29, 29);
  zone("operaciones", 29, 29);
  zone("finanzas", 29, -29);
  zone("hq", -29, -29);

  // carteles mirando a la calle por la que pasa el riel
  sign(zones.ventas, -29, 9.5, 0);
  sign(zones.operaciones, 29, 9.5, 0, true);
  sign(zones.finanzas, 48.5, -29, Math.PI / 2);
  // el cartel de la Casa Central va al costado de la plaza (el riel termina al frente de la torre)
  sign(zones.hq, -47, -44, 0.5, true);

  /* ---------- modelos del kit (asíncrono: la ciudad aparece en cuanto cargan) ---------- */
  const pmByZoneKit = new Map<string, PowerMaterial>();
  function zoneMat(z: Zone, kit: KitName, src: THREE.Group) {
    const key = `${z.id}/${kit}`;
    let pm = pmByZoneKit.get(key);
    if (!pm) {
      const base = baseMaterial(src);
      if (!base) return undefined;
      pm = powerMaterial(base);
      pm.set(z.power);
      pmByZoneKit.set(key, pm);
      z.pm.push(pm);
    }
    return pm.mat;
  }
  type Put = [KitName, string, number, number, number?, number?, Zone?];
  async function put(kit: KitName, name: string, x: number, zz: number, rotY = 0, scale = S, z?: Zone, y = 0.4) {
    const src = await loadModel(kit, name);
    const mat = z ? zoneMat(z, kit, src) : undefined;
    const g = instance(src, { mat, scale, x, z: zz, rotY, y });
    g.name = `${kit}:${name}`;
    scene.add(g);
    return g;
  }
  const R = Math.PI / 2;
  const V = zones.ventas, O = zones.operaciones, F = zones.finanzas, H = zones.hq;
  const plan: Put[] = [
    // VENTAS (x<0, z>0): oficina comercial con vidriera hacia la calle del sur
    ["comercial", "building-e", -29, 24, Math.PI, S * 1.25, V],
    ["comercial", "building-c", -45, 40, Math.PI, S, V],
    ["comercial", "building-h", -13, 41, Math.PI, S, V],
    ["comercial", "detail-parasol-a", -40, 14, 0, S, V],
    ["comercial", "detail-parasol-b", -18, 14, 0.6, S, V],
    ["suburban", "planter", -34, 13, 0, S, V],
    ["suburban", "planter", -24, 13, 0, S, V],
    ["suburban", "tree-large", -49, 12, 0, T, V],
    ["suburban", "tree-small", -9, 12, 0, T, V],
    ["suburban", "tree-large", -48, 50, 0, T, V],
    // OPERACIONES (x>0, z>0): fábrica, galpón, tanques y contenedores
    ["industrial", "building-m", 23, 26, Math.PI, S * 1.2, O],
    ["industrial", "building-i", 42, 40, -R, S, O],
    ["industrial", "water-tower", 14, 44, 0, S, O],
    ["industrial", "detail-tank-large", 46, 22, 0, S, O],
    ["industrial", "shipping-container-a", 40, 12, 0.2, S, O],
    ["industrial", "shipping-container-b", 47, 12, 0.1, S, O],
    ["industrial", "shipping-container-c", 43.5, 15.5, 0.15, S, O],
    ["industrial", "solar-panel-landscape-group", 12, 30, 0, S, O],
    ["suburban", "tree-small", 10, 12, 0, T, O],
    ["suburban", "tree-large", 50, 50, 0, T, O],
    // FINANZAS (x>0, z<0): torre de vidrio con anexo
    ["comercial", "building-skyscraper-a", 29, -29, R, S * 1.35, F],
    ["comercial", "building-skyscraper-c", 14, -42, R, S * 0.95, F],
    ["comercial", "building-l", 43, -14, R, S * 0.9, F],
    ["suburban", "planter", 49, -20, 0, S, F],
    ["suburban", "planter", 49, -38, 0, S, F],
    ["suburban", "tree-large", 12, -12, 0, T, F],
    ["suburban", "tree-small", 48, -48, 0, T, F],
    // CASA CENTRAL (x<0, z<0): torre principal con plaza al frente (donde termina el riel)
    ["comercial", "building-skyscraper-b", -29, -24, Math.PI, S * 1.55, H],
    ["comercial", "building-k", -46, -40, Math.PI, S * 0.9, H],
    ["comercial", "building-skyscraper-d", -10, -38, Math.PI, S * 0.85, H],
    ["suburban", "planter", -38, -44, 0, S, H],
    ["suburban", "planter", -20, -44, 0, S, H],
    ["suburban", "tree-large", -49, -12, 0, T, H],
    ["suburban", "tree-small", -9, -12, 0, T, H],
  ];
  // mobiliario urbano (sin zona: siempre a color)
  const street: Put[] = [];
  for (const [x, zz, r] of [
    [-6.8, 20, R],
    [6.8, 40, -R],
    [-40, 6.8, 0],
    [40, -6.8, Math.PI],
    [64.8, 20, -R],
    [64.8, -30, -R],
    [-6, -64.8, 0],
    [-51.2, 60, R],
    [-51.2, 30, R],
  ] as const)
    street.push(["city", "light-curved", x, zz, r]);
  for (const [x, zz] of [
    [-6.8, 6.8],
    [6.8, -6.8],
    [51.2, 6.8],
    [-51.2, -6.8],
  ] as const)
    street.push(["city", "traffic-light", x, zz, 0]);
  street.push(["city", "dumpster", 14, 50, 0.3], ["city", "road-sign-street", -51.2, 50, 0]);
  // manzanas exteriores a lo largo del recorrido (para correr "dentro" de la ciudad desde el inicio)
  const outer: [string, number, number, number, number][] = [
    ["building-k", -74, 92, R, 1.0],
    ["building-h", -74, 72, R, 1.0],
    ["building-c", -74, 52, R, 1.0],
    ["building-l", -76, 28, R, 1.1],
    ["building-h", -74, 6, R, 1.0],
    ["building-skyscraper-c", -78, -22, R, 1.1],
    ["building-c", -74, -46, R, 1.0],
    ["building-k", -40, 76, 0, 1.0],
    ["building-e", -14, 78, 0, 1.0],
    ["building-h", 14, 76, 0, 1.0],
    ["building-c", 40, 76, 0, 1.0],
    ["building-l", 76, 40, -R, 1.0],
    ["building-skyscraper-c", 78, 8, -R, 1.0],
    ["building-k", 76, -26, -R, 1.0],
    ["building-h", 76, -50, -R, 1.0],
    ["building-c", 40, -76, Math.PI, 1.0],
    ["building-e", 8, -78, Math.PI, 1.0],
    // detrás de la plaza de la Casa Central no va nada alto: ahí se para la cámara del clímax
    ["building-c", -2, -78, Math.PI, 0.9],
    ["building-c", -58, -78, Math.PI, 0.9],
  ];
  for (const [name, x, zz, r, k] of outer) street.push(["comercial", name, x, zz, r, S * k]);
  for (const [x, zz] of [
    [-66, 84],
    [-66, 40],
    [-66, -8],
    [-66, -60],
    [-28, 66],
    [28, 66],
    [66, 28],
    [66, -40],
    [24, -66],
    [-52, -66],
  ] as const)
    street.push(["suburban", "tree-large", x, zz, (x * 7 + zz) % 3, T]);
  // ciudad de fondo: edificios de bajo detalle en anillo
  const lows = ["low-detail-building-a", "low-detail-building-b", "low-detail-building-c", "low-detail-building-d", "low-detail-building-e", "low-detail-building-f", "low-detail-building-g", "low-detail-building-h", "low-detail-building-wide-a", "low-detail-building-wide-b"];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 165 + (i % 3) * 26;
    street.push(["comercial", lows[i % lows.length], Math.cos(a) * r, Math.sin(a) * r, a + Math.PI, S * (1.4 + ((i * 7) % 5) * 0.35)]);
  }
  const ready = Promise.allSettled([...plan, ...street].map((p) => put(...p))).then(() => {
    (Object.values(zones) as Zone[]).forEach(applyPower);
  });
  void box;

  /* ---------- arcos de IA: cada área → Casa Central ---------- */
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

  /** Aplica el "power" de cada zona: color del kit, props, cartel, anillo y arco. */
  function applyPower(z: Zone) {
    for (const pm of z.pm) pm.set(z.power);
    for (const { m, off, on, emissiveOn } of z.mats) {
      m.color.copy(off).lerp(on, z.power);
      if (emissiveOn) m.emissive.copy(emissiveOn).multiplyScalar(z.power);
    }
    (z.ring.material as THREE.MeshBasicMaterial).opacity = z.power * 0.85;
    const arc = arcs[z.id];
    if (arc) (arc.material as THREE.MeshBasicMaterial).opacity = z.power * 0.85;
    if (z.sign && z.power > 0.5 !== z.sign.lit) {
      z.sign.lit = z.power > 0.5;
      z.sign.draw(z.sign.lit);
    }
  }

  (Object.values(zones) as Zone[]).forEach(applyPower);
  return { zones, applyPower, dynamic, ready };
}
