import * as THREE from "three";
import type { CreateGame, Expr, GameHooks } from "../types";
import type { PhaseIndex } from "@/lib/games";
import { PHASES } from "@/lib/games";
import { bindGestures, PhaseClock, Popups, rng, Scorer } from "../shared/engine";
import { faceShapes, makeBlinker } from "../shared/bgenFace";
import { COLORS, DECAGON_PATH, MARK_POLYS, BGEN_FACE } from "@/lib/brand";
import { buildWorld, type ZoneId } from "./world";

/**
 * Juego 1 · La Compañía — runner 3D (docs/03).
 * BGen avanza solo por el riel de datos; el jugador cambia de carril (swipe)
 * y salta (tap). Cada tramo integra un área; el final descarga el rayo sobre el Caos.
 */

type Kind = "conector" | "mail" | "fantasma" | "excel" | "caja" | "factura" | "botella" | "auto" | "orq";

interface Item {
  s: number;
  lane: number;
  lanes: number[];
  kind: Kind;
  obj: THREE.Object3D;
  done: boolean;
  low: boolean;
  sec: number;
  baseY: number;
  phase: number;
}

const LANE_W = 3.2;
const ZONE_ORDER: ZoneId[] = ["ventas", "operaciones", "finanzas", "hq"];
const ZONE_NAME: Record<ZoneId, string> = { ventas: "Ventas", operaciones: "Operaciones", finanzas: "Finanzas", hq: "HQ Bizit" };

const createGame: CreateGame = (host, hooks: GameHooks, opts) => {
  /* ---------- render ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  const overlay = document.createElement("canvas");
  overlay.style.cssText = "position:absolute;inset:0;pointer-events:none";
  host.appendChild(overlay);
  const octx = overlay.getContext("2d")!;
  const popups = new Popups();

  const scene = new THREE.Scene();
  {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const g = c.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#CFE6F2");
    gr.addColorStop(0.55, "#F6F1EA");
    gr.addColorStop(1, "#FBF7F2");
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  scene.fog = new THREE.Fog("#F3EEE8", 90, 230);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 600);

  scene.add(new THREE.HemisphereLight("#ffffff", "#d8cfc4", 1.25));
  const sun = new THREE.DirectionalLight("#fff3e2", 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const world = buildWorld(scene);
  const zones = world.zones;

  /* ---------- riel de datos ---------- */
  const W: [number, number][] = [
    [-58, 80],
    [-58, 0],
    [0, 0],
    [0, 58],
    [58, 58],
    [58, -58],
    [0, -58],
    [-29, -58],
    [-29, -47],
  ];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < W.length; i++) {
    const p = new THREE.Vector3(W[i][0], 0.6, W[i][1]);
    if (i === 0 || i === W.length - 1) {
      pts.push(p);
      continue;
    }
    const a = new THREE.Vector3(W[i - 1][0], 0.6, W[i - 1][1]);
    const b = new THREE.Vector3(W[i + 1][0], 0.6, W[i + 1][1]);
    const din = p.clone().sub(a).normalize();
    const dout = b.clone().sub(p).normalize();
    pts.push(p.clone().addScaledVector(din, -5), p.clone().addScaledVector(din.add(dout).normalize(), 0.8), p.clone().addScaledVector(dout, 5));
  }
  // puntos intermedios para que las rectas queden rectas
  const dense: THREE.Vector3[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const n = Math.floor(a.distanceTo(b) / 12);
    for (let k = 1; k <= n; k++) dense.push(a.clone().lerp(b, k / (n + 1)));
    dense.push(b);
  }
  const curve = new THREE.CatmullRomCurve3(dense, false, "centripetal");
  curve.arcLengthDivisions = 3000;
  const L = curve.getLength();
  const SAMPLES = 1500;
  const samplePts = Array.from({ length: SAMPLES + 1 }, (_, i) => curve.getPointAt(i / SAMPLES));
  const distTo = (x: number, z: number) => {
    let best = 0, bd = Infinity;
    samplePts.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return (best / SAMPLES) * L;
  };
  // fin de cada tramo: Ventas → (0,0) · Operaciones → (58,0) · Finanzas → (0,-58)
  const SB = [0, distTo(0, 0), distTo(58, 0), distTo(0, -58), L];

  const railU = { uProg: { value: 0 }, uTime: { value: 0 } };
  {
    const N = 900, half = LANE_W * 1.6;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const p = curve.getPointAt(u), tg = curve.getTangentAt(u);
      const r = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
      for (const side of [-1, 1]) {
        pos.push(p.x + r.x * half * side, 0.08, p.z + r.z * half * side);
        uv.push(u, side < 0 ? 0 : 1);
      }
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: railU,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
      fragmentShader: `
        uniform float uProg, uTime; varying vec2 vUv;
        void main(){
          float u=vUv.x, v=vUv.y;
          vec3 cA=vec3(.039,.714,.737), cB=vec3(.698,.953,.149);
          float lane = smoothstep(.03,.0,abs(fract(v*3.)-.5)-.47);
          float edge = smoothstep(.06,.0,min(v,1.-v));
          float dash = step(.5, fract(u*${Math.round(L / 3)}.-uTime*2.));
          float lit = step(u,uProg);
          vec3 col = mix(cA,cB,fract(u*4.));
          float aOn = .26 + edge*.6 + lane*.35*dash;
          float aOff = .10 + edge*.35 + lane*.18*dash;
          vec3 off = vec3(1.);
          gl_FragColor = vec4(mix(off, col, lit), mix(aOff, aOn, lit));
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    scene.add(mesh);
  }

  /* ---------- BGen 3D: isotipo v2 + visor + cara LED ---------- */
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 256;
  faceCanvas.height = 128;
  const fctx = faceCanvas.getContext("2d")!;
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  function makeBGen(scale: number) {
    const g = new THREE.Group();
    const k = new THREE.Group();
    k.scale.setScalar(scale);
    const strokeM = new THREE.MeshStandardMaterial({ color: COLORS.niebla, roughness: 0.35, emissive: "#2a2a30" });
    for (const pl of MARK_POLYS) {
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < pl.length - 1; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(pl[i][0] - 64, 64 - pl[i][1], 3), new THREE.Vector3(pl[i + 1][0] - 64, 64 - pl[i + 1][1], 3)));
      k.add(new THREE.Mesh(new THREE.TubeGeometry(path, pl.length * 6, 1.9, 8, false), strokeM));
      for (const p of pl) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), strokeM);
        s.position.set(p[0] - 64, 64 - p[1], 3);
        k.add(s);
      }
    }
    const dec = new THREE.Shape(MARK_POLYS[0].slice(0, -1).map(([x, y]) => new THREE.Vector2(x - 64, 64 - y)));
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(dec, { depth: 8, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: COLORS.bgenBody, roughness: 0.6 }));
    body.position.z = -6;
    body.castShadow = true;
    k.add(body);
    const { visor } = BGEN_FACE;
    const vx = visor.x - 64, vy = 64 - visor.y - visor.h, vw = visor.w, vh = visor.h, vr = visor.r;
    const vs = new THREE.Shape();
    vs.moveTo(vx + vr, vy);
    vs.lineTo(vx + vw - vr, vy);
    vs.absarc(vx + vw - vr, vy + vr, vr, -Math.PI / 2, Math.PI / 2, false);
    vs.lineTo(vx + vr, vy + vh);
    vs.absarc(vx + vr, vy + vr, vr, Math.PI / 2, Math.PI * 1.5, false);
    const vis = new THREE.Mesh(new THREE.ExtrudeGeometry(vs, { depth: 4, bevelEnabled: true, bevelSize: 1, bevelThickness: 1, bevelSegments: 2 }), new THREE.MeshStandardMaterial({ color: COLORS.visor, roughness: 0.25, metalness: 0.3 }));
    vis.position.z = 4;
    k.add(vis);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, toneMapped: false }));
    face.position.set(vx + vw / 2, vy + vh / 2, 9.3);
    k.add(face);
    g.add(k);
    return g;
  }
  const bgen = makeBGen(0.028);
  scene.add(bgen);
  const ghosts = [makeBGen(0.022), makeBGen(0.022)];
  ghosts.forEach((g) => {
    g.visible = false;
    scene.add(g);
  });
  const auraMat = new THREE.MeshBasicMaterial({ color: COLORS.lima, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide });
  const aura = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.6, 10), auraMat);
  bgen.add(aura);
  aura.position.z = -0.3;
  const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.18, depthWrite: false }));
  shadowDisc.rotation.x = -Math.PI / 2;
  scene.add(shadowDisc);

  const blink = makeBlinker();
  let expr: Expr = "curioso";
  let exprUntil = 0;
  function drawFace(t: number, gx: number) {
    const s = 256 / BGEN_FACE.visor.w;
    fctx.clearRect(0, 0, 256, 128);
    fctx.save();
    fctx.scale(s, s);
    fctx.translate(-BGEN_FACE.visor.x, -BGEN_FACE.visor.y);
    fctx.lineCap = "round";
    fctx.lineJoin = "round";
    fctx.shadowColor = COLORS.lima;
    fctx.shadowBlur = 4;
    for (const sh of faceShapes({ expr, t, blink: blink(t), gx, gy: 0, talk: 0 })) {
      const p = new Path2D(sh.d);
      if (sh.fill) {
        fctx.fillStyle = sh.fill;
        fctx.fill(p);
      }
      if (sh.stroke) {
        fctx.strokeStyle = sh.stroke;
        fctx.lineWidth = sh.width || 2.6;
        fctx.stroke(p);
      }
    }
    fctx.restore();
    faceTex.needsUpdate = true;
  }
  void DECAGON_PATH;

  /* ---------- Problemones, conectores y power-ups ---------- */
  const rand = rng(20261120);
  const M = {
    eyeW: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    eyeB: new THREE.MeshBasicMaterial({ color: COLORS.carbon }),
    mail: new THREE.MeshStandardMaterial({ color: "#E7DCC6", roughness: 0.9, flatShading: true }),
    ghost: new THREE.MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.6, transparent: true, opacity: 0.88 }),
    excel: new THREE.MeshStandardMaterial({ color: "#5E9F6A", roughness: 0.8, flatShading: true }),
    caja: new THREE.MeshStandardMaterial({ color: "#C9A77A", roughness: 0.9, flatShading: true }),
    factura: new THREE.MeshStandardMaterial({ color: "#F0D979", roughness: 0.9, side: THREE.DoubleSide }),
    botella: new THREE.MeshStandardMaterial({ color: "#7FB59A", roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }),
    con: new THREE.MeshBasicMaterial({ color: COLORS.cian, toneMapped: false }),
    conCore: new THREE.MeshBasicMaterial({ color: COLORS.lima, toneMapped: false }),
    auto: new THREE.MeshBasicMaterial({ color: COLORS.lima, toneMapped: false }),
    orq: new THREE.MeshStandardMaterial({ color: COLORS.naranja, emissive: "#7a2a00", roughness: 0.3 }),
  };
  const G = {
    eye: new THREE.SphereGeometry(0.22, 10, 8),
    pupil: new THREE.SphereGeometry(0.12, 8, 6),
    torus: new THREE.TorusGeometry(0.55, 0.16, 8, 20),
    core: new THREE.SphereGeometry(0.22, 10, 8),
  };
  function eyes(parent: THREE.Object3D, y: number, z: number, spread = 0.35) {
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(G.eye, M.eyeW);
      e.position.set(sx * spread, y, z);
      const p = new THREE.Mesh(G.pupil, M.eyeB);
      p.position.set(sx * spread, y - 0.03, z + 0.15);
      parent.add(e, p);
    }
  }
  function makeObj(kind: Kind): { obj: THREE.Object3D; low: boolean; y: number } {
    const g = new THREE.Group();
    let low = false, y = 0.5;
    const add = (m: THREE.Mesh) => {
      m.castShadow = true;
      g.add(m);
      return m;
    };
    switch (kind) {
      case "conector": {
        add(new THREE.Mesh(G.torus, M.con));
        g.add(new THREE.Mesh(G.core, M.conCore));
        y = 1.4;
        break;
      }
      case "mail": {
        add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.5), M.mail)).position.y = 0.7;
        const flap = add(new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 4), M.mail));
        flap.rotation.set(Math.PI, Math.PI / 4, 0);
        flap.position.set(0, 1.1, 0.26);
        flap.scale.set(1, 1, 0.1);
        eyes(g, 0.65, 0.3);
        low = true;
        y = 0;
        break;
      }
      case "caja": {
        add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.6), M.caja)).position.y = 0.7;
        eyes(g, 0.8, 0.85);
        low = true;
        y = 0;
        break;
      }
      case "fantasma": {
        add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), M.ghost)).position.y = 0.4;
        const tail = add(new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.4, 12, 1, true), M.ghost));
        tail.rotation.x = Math.PI;
        tail.position.y = -0.5;
        eyes(g, 0.55, 0.95, 0.38);
        y = 1.7;
        break;
      }
      case "excel": {
        add(new THREE.Mesh(new THREE.BoxGeometry(2, 2.4, 1.4), M.excel)).position.y = 1.2;
        const grid = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2.4, 1.4, 3, 4, 1)), new THREE.LineBasicMaterial({ color: "#2f5b37" }));
        grid.position.y = 1.2;
        g.add(grid);
        eyes(g, 1.6, 0.75);
        y = 0;
        break;
      }
      case "factura": {
        add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.3, 0.12), M.factura)).position.y = 1.15;
        const clock = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: COLORS.rojo }));
        clock.position.set(0, 0.7, 0.08);
        g.add(clock);
        eyes(g, 1.6, 0.1);
        y = 0;
        break;
      }
      case "botella": {
        const b = add(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, LANE_W * 2 + 0.6, 18), M.botella));
        b.rotation.z = Math.PI / 2;
        b.position.y = 1.3;
        const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 1.6, 12), M.botella));
        neck.rotation.z = Math.PI / 2;
        neck.position.set(LANE_W + 1, 1.3, 0);
        eyes(g, 1.7, 1.25, 0.5);
        y = 0;
        break;
      }
      case "auto": {
        add(new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), M.auto));
        y = 1.6;
        break;
      }
      case "orq": {
        add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), M.orq));
        y = 1.6;
        break;
      }
    }
    return { obj: g, low, y };
  }

  const items: Item[] = [];
  const conTotal = [0, 0, 0];
  const conGot = [0, 0, 0];
  const hits = [0, 0, 0];
  function place(it: Omit<Item, "obj" | "low" | "baseY" | "done" | "phase">) {
    const { obj, low, y } = makeObj(it.kind);
    if (it.kind !== "conector" && it.kind !== "botella") obj.scale.setScalar(1.3);
    const p = curve.getPointAt(Math.min(0.999, it.s / L));
    const tg = curve.getTangentAt(Math.min(0.999, it.s / L));
    const r = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
    const laneC = it.lanes.reduce((a, b) => a + b, 0) / it.lanes.length;
    obj.position.copy(p).addScaledVector(r, laneC * LANE_W).setY(y);
    obj.lookAt(obj.position.clone().sub(tg));
    obj.visible = false;
    scene.add(obj);
    items.push({ ...it, obj, low, baseY: y, done: false, phase: rand() * 6 });
    if (it.kind === "conector") conTotal[it.sec]++;
  }
  const near = (s: number) => SB.some((b) => Math.abs(s - b) < 9);
  for (let sec = 0; sec < 3; sec++) {
    let s = SB[sec] + (sec === 0 ? 22 : 12);
    const end = SB[sec + 1] - 8;
    const obstacles: Kind[] = sec === 0 ? ["fantasma", "mail"] : sec === 1 ? ["excel", "caja"] : ["factura", "botella", "excel"];
    let powerSpots = sec === 1 ? [0.35, 0.75] : sec === 2 ? [0.5] : [];
    while (s < end) {
      if (near(s)) {
        s += 4;
        continue;
      }
      const f = (s - SB[sec]) / (SB[sec + 1] - SB[sec]);
      const ps = powerSpots.find((x) => f >= x);
      if (ps !== undefined) {
        powerSpots = powerSpots.filter((x) => x !== ps);
        place({ s, lane: 0, lanes: [0], kind: sec === 1 ? "auto" : "orq", sec });
        s += 8;
        continue;
      }
      const roll = rand();
      const free = Math.floor(rand() * 3) - 1;
      if (roll < 0.42 - sec * 0.06) {
        // fila de conectores
        for (let k = 0; k < 4; k++) place({ s: s + k * 2.3, lane: free, lanes: [free], kind: "conector", sec });
        s += 10;
      } else {
        const kind = obstacles[Math.floor(rand() * obstacles.length)];
        if (kind === "botella") {
          const lanes = free === -1 ? [0, 1] : free === 1 ? [-1, 0] : [-1, 0];
          const freeLane = [-1, 0, 1].find((l) => !lanes.includes(l))!;
          place({ s, lane: lanes[0], lanes, kind, sec });
          for (let k = 0; k < 3; k++) place({ s: s - 3 + k * 2.3, lane: freeLane, lanes: [freeLane], kind: "conector", sec });
        } else {
          const blocked = [-1, 0, 1].filter((l) => l !== free);
          const two = rand() < 0.25 + sec * 0.12;
          const ob = two ? blocked : [blocked[Math.floor(rand() * 2)]];
          for (const l of ob) place({ s, lane: l, lanes: [l], kind, sec });
          for (let k = 0; k < 2; k++) place({ s: s + 3 + k * 2.3, lane: free, lanes: [free], kind: "conector", sec });
        }
        s += sec === 2 ? 9 : 11;
      }
    }
  }

  /* ---------- El Caos Operativo: torbellino de papeles sobre el HQ ---------- */
  const PAPERS = 140;
  const paperMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshStandardMaterial({ color: "#C9C1B4", side: THREE.DoubleSide, transparent: true }), PAPERS);
  const paperSeed = Array.from({ length: PAPERS }, () => ({ a: Math.random() * 6.28, h: Math.random(), r: 10 + Math.random() * 9, s: 0.5 + Math.random() }));
  scene.add(paperMesh);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: COLORS.lima, transparent: true, opacity: 0, toneMapped: false }));
  scene.add(beam);
  const smoke = Array.from({ length: 14 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0 }));
    m.userData = { x: i % 2 ? 36 : 40, z: i % 2 ? 22 : 26, base: i % 2 ? 24 : 22, k: (i / 14) * 1 };
    scene.add(m);
    return m;
  });

  /* ---------- estado de juego ---------- */
  const scorer = new Scorer(hooks);
  let paused = false;
  let t = 0;
  let lane = 0;
  let laneX = 0;
  let prevLane = 0;
  let laneChangedAt = -9;
  let jumpT = -9;
  let invulnUntil = 0;
  let autoUntil = 0;
  let orqUntil = 0;
  let showcase: { zone: ZoneId; until: number } | null = null;
  let charge = 0;
  let beamFired = false;
  let ended = false;
  const finalPower: number[] = [0, 0, 0];

  const say = (e: Expr, text?: string, hold = 1.2) => {
    expr = e;
    exprUntil = t + hold;
    hooks.bgen(e, text);
  };

  function sectionBar(sec: number) {
    const base = conTotal[sec] ? conGot[sec] / conTotal[sec] : 0;
    return Math.max(0.25, Math.min(1, base * 1.15 - hits[sec] * 0.05));
  }

  function connectedPct() {
    const ph = clock.phase;
    let sum = 0;
    for (let i = 0; i < 3; i++) sum += i < ph ? finalPower[i] : i === ph ? sectionBar(i) * 0.5 : 0;
    return Math.min(1, sum / 3);
  }

  const clock = new PhaseClock(hooks, opts.durationSec, (p: PhaseIndex) => {
    const sec = p - 1;
    if (sec >= 0 && sec < 3) {
      finalPower[sec] = sectionBar(sec);
      const z = zones[ZONE_ORDER[sec]];
      z.target = finalPower[sec];
      showcase = { zone: ZONE_ORDER[sec], until: t + 2 };
      const pts = Math.round(finalPower[sec] * 500);
      scorer.hit(pts, t, false);
      say("logro", `¡${ZONE_NAME[ZONE_ORDER[sec]]} integrada al ${Math.round(finalPower[sec] * 100)}%!`, 2);
    }
    if (p === 3) {
      window.setTimeout(() => hooks.hint("¡Tocá rápido para cargar el rayo!"), 1800);
    }
  });
  say("curioso", "¡La empresa está desconectada! Ayudame a integrarla.", 2.5);

  function sAt(e: number) {
    const D = opts.durationSec;
    const T = [0, ...PHASES.map((p) => p.until * D)];
    if (e >= T[3]) return SB[3] + (SB[4] - SB[3]) * Math.min(1, (e - T[3]) / 4.5);
    for (let i = 0; i < 3; i++) if (e < T[i + 1]) return SB[i] + (SB[i + 1] - SB[i]) * ((e - T[i]) / (T[i + 1] - T[i]));
    return SB[3];
  }

  /* ---------- input ---------- */
  const unbind = bindGestures(renderer.domElement, {
    onSwipe(dir) {
      if (paused || ended || clock.phase === 3) return;
      if (dir === "left" || dir === "right") {
        const nl = Math.max(-1, Math.min(1, lane + (dir === "right" ? 1 : -1)));
        if (nl !== lane) {
          prevLane = lane;
          lane = nl;
          laneChangedAt = t;
        }
      } else if (dir === "up") jump();
    },
    onTap() {
      if (paused || ended) return;
      if (clock.phase === 3) {
        if (!beamFired) {
          charge++;
          scorer.hit(20, t);
          say("concentrado");
        }
        return;
      }
      jump();
    },
  });
  function jump() {
    if (t - jumpT > 0.62) jumpT = t;
  }

  /* ---------- colisiones ---------- */
  const tmp = new THREE.Vector3();
  function project(v: THREE.Vector3) {
    tmp.copy(v).project(camera);
    return { x: ((tmp.x + 1) / 2) * overlay.clientWidth, y: ((1 - tmp.y) / 2) * overlay.clientHeight };
  }

  function collide(s: number, jumpY: number) {
    const myLane = Math.round(laneX);
    const power = t < autoUntil || t < orqUntil;
    for (const it of items) {
      if (it.done) continue;
      const ds = it.s - s;
      if (ds > 1.3) continue;
      if (ds < -2) {
        // ya pasó: ¿por poco?
        if (it.kind !== "conector" && it.kind !== "auto" && it.kind !== "orq" && it.lanes.includes(prevLane) && t - laneChangedAt < 0.5) {
          const g = scorer.hit(50, t);
          const sp = project(bgen.position);
          popups.add(sp.x, sp.y - 40, `¡Por poco! +${g}`, COLORS.violeta);
        }
        it.done = true;
        continue;
      }
      const inLane = t < orqUntil || it.lanes.includes(myLane);
      if (!inLane) continue;
      if (it.kind === "conector") {
        it.done = true;
        it.obj.visible = false;
        conGot[it.sec]++;
        scorer.hit(10, t);
        continue;
      }
      if (it.kind === "auto" || it.kind === "orq") {
        it.done = true;
        it.obj.visible = false;
        if (it.kind === "auto") {
          autoUntil = t + 4;
          say("procesando", "⚡ ¡Automatización! Atravieso todo.", 4);
        } else {
          orqUntil = t + 5;
          say("logro", "🎛️ ¡Modo orquestador! Tres BGens a la vez.", 5);
        }
        hooks.hint(it.kind === "auto" ? "⚡ AUTOMATIZACIÓN" : "🎛️ ORQUESTADOR");
        continue;
      }
      // obstáculo
      if (power) {
        it.done = true;
        it.obj.visible = false;
        const g = scorer.hit(100, t);
        const sp = project(it.obj.position);
        popups.add(sp.x, sp.y, `+${g}`, COLORS.cian);
        continue;
      }
      if (it.low && jumpY > 1.15) {
        it.done = true;
        const g = scorer.hit(50, t);
        const sp = project(bgen.position);
        popups.add(sp.x, sp.y - 40, `¡Salto! +${g}`, COLORS.naranja);
        continue;
      }
      if (t < invulnUntil) continue;
      it.done = true;
      invulnUntil = t + 1.2;
      hits[Math.min(2, it.sec)]++;
      scorer.miss();
      say("mareado", ["¡Uy! Un Problemón.", "¡Ay! Esquivá los Problemones.", "¡Otra vez!"][hits.reduce((a, b) => a + b, 0) % 3], 1);
    }
  }

  /* ---------- loop ---------- */
  const camPos = new THREE.Vector3(-40, 30, 120);
  const camLook = new THREE.Vector3(-58, 2, 60);
  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const dummy = new THREE.Object3D();

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? 68 : 55;
    camera.updateProjectionMatrix();
    overlay.width = Math.round(w * devicePixelRatio);
    overlay.height = Math.round(h * devicePixelRatio);
    overlay.style.width = w + "px";
    overlay.style.height = h + "px";
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let raf = 0;
  let last = performance.now();
  // calidad adaptativa: si el equipo no llega a ~40 fps, se apagan sombras y se baja la resolución
  const perf = { frames: 0, since: 0, checked: false };
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!perf.checked && !paused) {
      if (!perf.since) perf.since = now;
      perf.frames++;
      if (now - perf.since > 2500) {
        perf.checked = true;
        const fps = (perf.frames * 1000) / (now - perf.since);
        if (fps < 40) {
          renderer.shadowMap.enabled = false;
          sun.castShadow = false;
          renderer.setPixelRatio(1);
          resize();
          scene.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (m) m.needsUpdate = true;
          });
        }
      }
    }
    const running = !paused && clock.step(dt);
    if (running) t += dt;
    const e = clock.elapsed;
    const s = sAt(e);
    const u = Math.min(0.999, s / L);
    railU.uProg.value = u;
    railU.uTime.value = now / 1000;

    const p = curve.getPointAt(u);
    const tg = curve.getTangentAt(u);
    const right = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
    laneX += (lane - laneX) * Math.min(1, dt * 12);
    const jt = t - jumpT;
    const jumpY = jt < 0.62 ? Math.sin((jt / 0.62) * Math.PI) * 2.7 : 0;
    const bob = opts.reducedMotion ? 0 : Math.sin(now / 300) * 0.15;
    bgen.position.copy(p).addScaledVector(right, laneX * LANE_W).setY(2.3 + jumpY + bob);
    shadowDisc.position.set(bgen.position.x, 0.12, bgen.position.z);
    (shadowDisc.material as THREE.MeshBasicMaterial).opacity = 0.2 - jumpY * 0.04;
    bgen.quaternion.copy(camera.quaternion);
    bgen.visible = !(t < invulnUntil && Math.floor(t * 12) % 2 === 0);
    auraMat.opacity = t < autoUntil || t < orqUntil ? 0.8 : clock.phase >= 1 ? 0.35 : 0;
    aura.visible = auraMat.opacity > 0;
    ghosts.forEach((g, i) => {
      g.visible = t < orqUntil;
      if (g.visible) {
        g.position.copy(p).addScaledVector(right, (i === 0 ? -1 : 1) * LANE_W).setY(2 + bob);
        g.quaternion.copy(camera.quaternion);
      }
    });

    if (running && clock.phase < 3) collide(s, jumpY);
    if (t > exprUntil && expr !== "reposo" && clock.phase < 3) {
      expr = clock.phase === 0 ? "concentrado" : "procesando";
    }
    drawFace(t, (lane - laneX) * -6 + 2);

    // ítems: animación
    for (const it of items) {
      const ds = it.s - s;
      // solo se dibuja lo cercano (menos draw calls en tablets)
      const inView = ds < 75 && ds > -8 && !(it.done && (it.kind === "conector" || it.kind === "auto" || it.kind === "orq" || ds < -6));
      if (it.obj.visible !== inView && !(it.done && it.obj.visible === false)) it.obj.visible = inView;
      if (!inView) continue;
      if (it.kind === "conector" || it.kind === "auto" || it.kind === "orq") it.obj.rotation.y += dt * 3;
      if (it.kind === "fantasma") it.obj.position.y = it.baseY + Math.sin(now / 400 + it.phase) * 0.35;
      if (it.kind === "factura") {
        const fall = Math.max(0, Math.min(1, (24 - ds) / 10));
        it.obj.position.y = it.baseY + (1 - fall) * 12;
      }
    }

    // zonas
    for (const id of ZONE_ORDER) {
      const z = zones[id];
      if (Math.abs(z.power - z.target) > 0.002) {
        z.power += (z.target - z.power) * Math.min(1, dt * 1.6);
        world.applyPower(z);
      }
    }
    smoke.forEach((m) => {
      const on = zones.operaciones.power > 0.4;
      const d = m.userData as { x: number; z: number; base: number; k: number };
      const k = (now / 3000 + d.k) % 1;
      m.position.set(d.x + k * 2, d.base + k * 9, d.z);
      m.scale.setScalar(0.6 + k * 1.6);
      (m.material as THREE.MeshStandardMaterial).opacity = on ? 0.55 * (1 - k) : 0;
    });

    // clímax: el Caos y el rayo
    const hq = zones.hq;
    const chaosK = Math.max(0, 1 - hq.power) * (beamFired ? Math.max(0, 1 - (e - (opts.durationSec - 2.6)) / 1.2) : 1);
    paperSeed.forEach((ps, i) => {
      const a = ps.a + now / 1000 * ps.s * (opts.reducedMotion ? 0 : 1.6);
      const r = ps.r * (0.6 + chaosK * 0.4) * (1 - Math.min(1, charge / 60) * 0.4);
      dummy.position.set(-29 + Math.cos(a) * r, 12 + ps.h * 34, -29 + Math.sin(a) * r);
      dummy.rotation.set(a * 2, a, 0);
      dummy.scale.setScalar(Math.max(0.001, chaosK));
      dummy.updateMatrix();
      paperMesh.setMatrixAt(i, dummy.matrix);
    });
    paperMesh.instanceMatrix.needsUpdate = true;
    if (clock.phase === 3 && running) {
      expr = "concentrado";
      if (!beamFired && e >= opts.durationSec - 2.6) {
        beamFired = true;
        const g = scorer.hit(1000 + charge * 15, t, false);
        const sp = project(new THREE.Vector3(-29, 30, -29));
        popups.add(sp.x, sp.y, `¡Rayo! +${g}`, COLORS.naranja);
        say("logro", "¡Compañía conectada! Bizit lleva la IA a toda tu operación.", 4);
        hq.target = 1;
      }
    }
    if (beamFired) {
      const from = bgen.position.clone();
      const to = new THREE.Vector3(-29, 30, -29);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      beam.position.copy(mid);
      beam.lookAt(to);
      beam.rotateX(Math.PI / 2);
      const w = 0.5 + Math.min(2.2, charge / 18);
      beam.scale.set(w, from.distanceTo(to), w);
      (beam.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - (e - (opts.durationSec - 2.6)) / 2.4) * 0.9;
    }

    // métrica
    const pct = beamFired ? (finalPower[0] + finalPower[1] + finalPower[2] + hq.power) / 4 : connectedPct();
    if (running) hooks.metric(`${Math.round(pct * 100)}%`, pct);

    if (clock.done && !ended) {
      ended = true;
      const final = (finalPower[0] + finalPower[1] + finalPower[2] + 1) / 4;
      window.setTimeout(() => hooks.end({ score: scorer.score, metricValue: `${Math.round(final * 100)}%`, metricPct: final }), 1200);
    }

    // cámara: seguimiento ↔ vista de maqueta
    const sc = showcase && t < showcase.until ? zones[showcase.zone] : null;
    if (clock.phase === 3 || ended) {
      desiredPos.set(-29 + 62, 60, -29 + 70);
      desiredLook.set(-29, 18, -29);
    } else if (sc) {
      desiredPos.copy(sc.center).add(new THREE.Vector3(40, 44, 40));
      desiredLook.copy(sc.center).setY(6);
    } else {
      desiredPos.copy(bgen.position).addScaledVector(tg, -12.5).setY(8.2 + jumpY * 0.3);
      desiredLook.copy(bgen.position).addScaledVector(tg, 10).setY(1.8);
    }
    const k = 1 - Math.exp(-dt * (sc || clock.phase === 3 ? 2.2 : 5));
    camPos.lerp(desiredPos, k);
    camLook.lerp(desiredLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    const fovTarget = (t < autoUntil ? 64 : 55) + (camera.aspect < 1.2 ? 13 : 0);
    if (Math.abs(camera.fov - fovTarget) > 0.1) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }
    sun.position.copy(bgen.position).add(new THREE.Vector3(-30, 60, 25));
    sun.target.position.copy(bgen.position);

    renderer.render(scene, camera);
    if (Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) host.dataset.drawCalls = String(renderer.info.render.calls);
    octx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    popups.draw(octx, dt, Math.max(0.8, overlay.clientWidth / 1200));
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    pause(p: boolean) {
      paused = p;
      clock.paused = p;
    },
    destroy() {
      cancelAnimationFrame(raf);
      unbind();
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    },
  };
};

export default createGame;
