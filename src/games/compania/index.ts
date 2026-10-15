import * as THREE from "three";
import type { CreateGame, Expr, GameHooks } from "../types";
import type { PhaseIndex } from "@/lib/games";
import { PHASES } from "@/lib/games";
import { bindGestures, PhaseClock, Popups, rng, Scorer } from "../shared/engine";
import { faceShapes, makeBlinker } from "../shared/bgenFace";
import { COLORS, DECAGON_PATH, MARK_POLYS, BGEN_FACE } from "@/lib/brand";
import { buildWorld, type ZoneId } from "./world";
import { sfx } from "@/lib/audio";
import { makeProblemon, type Kind, type Problemon } from "./problemones";

/**
 * Juego 1 · La Compañía — runner 3D (docs/03).
 * BGen avanza solo por el riel de datos; el jugador cambia de carril (swipe)
 * y salta (tap). Cada tramo integra un área; el final descarga el rayo sobre el Caos.
 */



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
  tick?: Problemon["tick"];
}

const LANE_W = 3.2;
const ZONE_ORDER: ZoneId[] = ["ventas", "operaciones", "finanzas", "hq"];
const ZONE_NAME: Record<ZoneId, string> = { ventas: "Ventas", operaciones: "Operaciones", finanzas: "Finanzas", hq: "Casa Central" };

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
    // radio de giro ~9 > medio ancho de la cinta (5.1): la cinta no se pliega en las esquinas
    pts.push(p.clone().addScaledVector(din, -9), p.clone().addScaledVector(din.add(dout).normalize(), 1.6), p.clone().addScaledVector(dout, 9));
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
    const strokeM = new THREE.MeshStandardMaterial({ color: COLORS.bgenStroke, roughness: 0.5 });
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
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(dec, { depth: 8, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: COLORS.bgenBody, roughness: 0.55 }));
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

  /* ---------- Problemones, conectores y power-ups (ver problemones.ts) ---------- */
  const rand = rng(20261120);

  const items: Item[] = [];
  const conTotal = [0, 0, 0];
  const conGot = [0, 0, 0];
  const hits = [0, 0, 0];
  function place(it: Omit<Item, "obj" | "low" | "baseY" | "done" | "phase">) {
    const { obj, low, y, tick } = makeProblemon(it.kind);
    if (it.kind !== "conector" && it.kind !== "botella" && it.kind !== "fantasma" && it.kind !== "auto" && it.kind !== "orq") obj.scale.setScalar(1.25);
    const p = curve.getPointAt(Math.min(0.999, it.s / L));
    const tg = curve.getTangentAt(Math.min(0.999, it.s / L));
    const r = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
    const laneC = it.lanes.reduce((a, b) => a + b, 0) / it.lanes.length;
    obj.position.copy(p).addScaledVector(r, laneC * LANE_W).setY(y);
    obj.lookAt(obj.position.clone().sub(tg));
    obj.visible = false;
    scene.add(obj);
    items.push({ ...it, obj, low, baseY: y, done: false, phase: rand() * 6, tick });
    if (it.kind === "conector") conTotal[it.sec]++;
  }
  // ni en los límites de tramo ni en las esquinas (ahí los carriles se cierran y el esquive se vuelve injusto)
  const corners = W.slice(1, -1).map(([x, z]) => distTo(x, z));
  const LINEUP = typeof location !== "undefined" && new URLSearchParams(location.search).has("lineup");
  const near = (s: number) => SB.some((b) => Math.abs(s - b) < 9) || corners.some((c) => Math.abs(s - c) < 13);
  if (LINEUP) {
    const kinds: Kind[] = ["mail", "fantasma", "excel", "caja", "factura", "botella", "conector", "auto", "orq"];
    // una fila ancha frente a la cámara (los carriles fraccionarios solo sirven para la foto)
    kinds.forEach((kind, i) => place({ s: 16, lane: 0, lanes: [(i - 4) * 1.15], kind, sec: 0 }));
  }
  for (let sec = 0; sec < 3 && !LINEUP; sec++) {
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

  /* ---------- El Caos Operativo: torbellino de papeles sobre la Casa Central ---------- */
  const PAPERS = 140;
  const paperMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshStandardMaterial({ color: "#C9C1B4", side: THREE.DoubleSide, transparent: true }), PAPERS);
  const paperSeed = Array.from({ length: PAPERS }, () => ({ a: Math.random() * 6.28, h: Math.random(), r: 10 + Math.random() * 9, s: 0.5 + Math.random() }));
  scene.add(paperMesh);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: COLORS.lima, transparent: true, opacity: 0, toneMapped: false }));
  scene.add(beam);
  const smoke = Array.from({ length: 14 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0 }));
    m.userData = { x: i % 2 ? 20 : 25, z: i % 2 ? 22 : 24, base: i % 2 ? 17 : 15, k: (i / 14) * 1 };
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
  let boostShown = false;
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
    if (p === 3 && !arrived) arrive();
    const sec = p - 1;
    if (sec >= 0 && sec < 3) {
      finalPower[sec] = sectionBar(sec);
      const z = zones[ZONE_ORDER[sec]];
      z.target = finalPower[sec];
      showcase = { zone: ZONE_ORDER[sec], until: t + 2 };
      const pts = Math.round(finalPower[sec] * 500);
      scorer.hit(pts, t, false);
      sfx("g.phase");
      say("logro", `¡${ZONE_NAME[ZONE_ORDER[sec]]} integrada al ${Math.round(finalPower[sec] * 100)}%!`, 2);
    }
    if (p === 3) {
      window.setTimeout(() => hooks.hint("¡Tocá rápido para cargar el rayo!"), 1800);
    }
  }, true);
  say("curioso", "¡La empresa está desconectada! Ayudame a integrarla.", 2.5);

  /* ---------- avance ----------
   * BGen avanza por distancia (no por reloj): a velocidad normal cada tramo dura lo
   * nominal (25/30/25 s) y se llega a la Casa Central a los 80 s. Con turbo se llega
   * antes y el tiempo ahorrado se convierte en puntos. El Caos dura siempre 10 s.
   */
  const D = opts.durationSec;
  const T = [0, ...PHASES.map((p) => p.until * D)];
  const BOOST = 1.7;
  let s = 0;
  let boost = false;
  let boostK = 0; // 0..1 suavizado, para cámara y efectos
  let arrived = false;
  const baseSpeed = () => {
    const k = Math.min(2, clock.phase);
    return (SB[k + 1] - SB[k]) / (T[k + 1] - T[k]);
  };
  function arrive() {
    if (arrived) return;
    arrived = true;
    s = SB[3];
    boost = false;
    sfx("g.win", { volume: 0.7 });
    const saved = Math.max(0, T[3] - clock.elapsed);
    if (saved > 0.5) {
      const g = scorer.hit(Math.round(saved) * 25, t, false);
      const sp = project(bgen.position);
      popups.add(sp.x, sp.y - 60, `Tiempo ahorrado +${g}`, COLORS.naranja);
    }
    clock.elapsed = T[3]; // el Caos dura siempre lo nominal (D − T[3] = 10 s)
    if (clock.phase < 3) clock.setPhase(3);
  }
  /** Avanza por el riel; cambia de fase al cruzar cada tramo y llega a la Casa Central. */
  function advance(dt: number) {
    if (arrived) {
      s = SB[3] + (SB[4] - SB[3]) * Math.min(1, (clock.elapsed - T[3]) / 4.5);
      return;
    }
    boostK += ((boost ? 1 : 0) - boostK) * Math.min(1, dt * 4);
    s += baseSpeed() * (1 + (BOOST - 1) * boostK) * dt;
    while (clock.phase < 2 && s >= SB[clock.phase + 1]) clock.setPhase((clock.phase + 1) as PhaseIndex);
    if (s >= SB[3]) arrive();
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
    onHold(on) {
      if (paused || ended || clock.phase === 3) {
        boost = false;
        return;
      }
      if (on && !boost) {
        sfx("g.zap", { volume: 0.5 });
        say("concentrado");
        if (!boostShown) {
          boostShown = true;
          hooks.hint("¡TURBO!");
        }
      }
      boost = on;
    },
    onTap() {
      if (paused || ended) return;
      if (clock.phase === 3) {
        if (!beamFired) {
          charge++;
          sfx("g.tap", { volume: 0.5, rate: 0.8 + Math.min(1.2, charge * 0.02) });
          scorer.hit(20, t);
          say("concentrado");
        }
        return;
      }
      jump();
    },
  });
  function jump() {
    if (t - jumpT > 0.62) {
      jumpT = t;
      sfx("g.jump", { volume: 0.45 });
    }
  }

  /* ---------- colisiones ---------- */
  const tmp = new THREE.Vector3();
  function project(v: THREE.Vector3) {
    tmp.copy(v).project(camera);
    return { x: ((tmp.x + 1) / 2) * overlay.clientWidth, y: ((1 - tmp.y) / 2) * overlay.clientHeight };
  }

  function collide(s: number, jumpY: number) {
    const power = t < autoUntil || t < orqUntil;
    for (const it of items) {
      if (it.done) continue;
      const ds = it.s - s;
      if (ds > 1.3) continue;
      if (ds < -2) {
        // ya pasó: ¿por poco?
        if (it.kind !== "conector" && it.kind !== "auto" && it.kind !== "orq" && it.lanes.includes(prevLane) && t - laneChangedAt < 0.5) {
          const g = scorer.hit(50, t);
          sfx("g.near", { volume: 0.5 });
          const sp = project(bgen.position);
          popups.add(sp.x, sp.y - 40, `¡Por poco! +${g}`, COLORS.violeta);
        }
        it.done = true;
        continue;
      }
      const inLane = t < orqUntil || it.lanes.some((l) => Math.abs(laneX - l) < 0.42);
      if (!inLane) continue;
      if (it.kind === "conector") {
        it.done = true;
        it.obj.visible = false;
        conGot[it.sec]++;
        scorer.hit(10, t);
        sfx(`g.coin${Math.min(4, scorer.combo)}` as "g.coin1", { volume: 0.55 });
        continue;
      }
      if (it.kind === "auto" || it.kind === "orq") {
        it.done = true;
        it.obj.visible = false;
        sfx(it.kind === "auto" ? "g.power" : "g.power2");
        if (it.kind === "auto") {
          autoUntil = t + 4;
          say("procesando", "¡Automatización! Atravieso todo.", 4);
        } else {
          orqUntil = t + 5;
          say("logro", "¡Modo orquestador! Tres BGens a la vez.", 5);
        }
        hooks.hint(it.kind === "auto" ? "AUTOMATIZACIÓN" : "ORQUESTADOR");
        continue;
      }
      // obstáculo
      if (power) {
        it.done = true;
        it.obj.visible = false;
        sfx("g.bell", { volume: 0.4, rate: 1.4 });
        const g = scorer.hit(100, t);
        const sp = project(it.obj.position);
        popups.add(sp.x, sp.y, `+${g}`, COLORS.cian);
        continue;
      }
      if (it.low && jumpY > 1.15) {
        it.done = true;
        sfx("g.coin4", { volume: 0.4, rate: 1.2 });
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
      sfx("g.hit", { volume: 0.8 });
      sfx("g.fail", { volume: 0.5 });
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
    if (running) {
      t += dt;
      advance(dt);
    }
    const e = clock.elapsed;
    const u = Math.min(0.999, s / L);
    railU.uProg.value = u;
    railU.uTime.value = now / 1000 * (1 + boostK);
    const fov = 55 + boostK * 12;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

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
      if (it.kind === "conector" || it.kind === "auto" || it.kind === "orq") {
        it.obj.rotation.y += dt * 3;
        it.obj.position.y = it.baseY + Math.sin(now / 350 + it.phase) * 0.18;
      }
      if (it.kind === "fantasma") it.obj.position.y = it.baseY + Math.sin(now / 400 + it.phase) * 0.35;
      if (it.kind === "mail" || it.kind === "caja" || it.kind === "excel") it.obj.rotation.z = Math.sin(now / 500 + it.phase) * 0.04;
      it.tick?.(now, it.phase);
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
        sfx("g.beam");
        window.setTimeout(() => sfx("g.bell", { volume: 0.7 }), 500);
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
    if (LINEUP) {
      const a = curve.getPointAt(16 / L), b = curve.getPointAt(4 / L);
      desiredPos.copy(b).setY(4.2);
      desiredLook.copy(a).setY(1.3);
    } else if (clock.phase === 3 || ended) {
      desiredPos.set(-29 + 62, 60, -29 + 70);
      desiredLook.set(-29, 18, -29);
    } else if (sc) {
      desiredPos.copy(sc.center).add(new THREE.Vector3(40, 44, 40));
      desiredLook.copy(sc.center).setY(6);
    } else {
      desiredPos.copy(bgen.position).addScaledVector(tg, -12.5 - boostK * 2.5).setY(8.2 + jumpY * 0.3 - boostK * 0.8);
      desiredLook.copy(bgen.position).addScaledVector(tg, 10 + boostK * 6).setY(1.8);
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
    skipTo(p) {
      if (p <= clock.phase || arrived) return;
      s = SB[p] + 0.01;
      clock.elapsed = T[p];
      if (p === 3) arrive();
      else while (clock.phase < p) clock.setPhase((clock.phase + 1) as PhaseIndex);
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
