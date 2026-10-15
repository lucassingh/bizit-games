import * as THREE from "three";
import type { CreateGame, Expr, GameHooks } from "../types";
import type { PhaseIndex } from "@/lib/games";
import { PHASES } from "@/lib/games";
import { bindGestures, PhaseClock, Popups, rng, Scorer } from "../shared/engine";
import { drawBGen, makeBlinker } from "../shared/bgenFace";
import { COLORS } from "@/lib/brand";
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
    [-29, -40],
  ];
  // riel: rectas + esquinas con curva cuadrática (radio de curvatura ~7,4 > medio ancho de la cinta 5,1),
  // en un CurvePath analítico: ancho constante y sin pliegues ni líneas cruzadas
  const CORNER = 10.5;
  const curve = new THREE.CurvePath<THREE.Vector3>();
  {
    const P = W.map(([x, z]) => new THREE.Vector3(x, 0.6, z));
    let cursor = P[0].clone();
    for (let i = 1; i < P.length - 1; i++) {
      const din = P[i].clone().sub(P[i - 1]).normalize();
      const dout = P[i + 1].clone().sub(P[i]).normalize();
      const a = P[i].clone().addScaledVector(din, -CORNER);
      const b = P[i].clone().addScaledVector(dout, CORNER);
      curve.add(new THREE.LineCurve3(cursor, a));
      curve.add(new THREE.QuadraticBezierCurve3(a, P[i].clone(), b));
      cursor = b;
    }
    curve.add(new THREE.LineCurve3(cursor, P[P.length - 1].clone()));
  }
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

  /* ---------- BGen: sprite con el mismo dibujo que la UI (nítido, sin aristas) ---------- */
  const bgenCanvas = document.createElement("canvas");
  bgenCanvas.width = 512;
  bgenCanvas.height = 512;
  const bctx = bgenCanvas.getContext("2d")!;
  const bgenTex = new THREE.CanvasTexture(bgenCanvas);
  bgenTex.colorSpace = THREE.SRGBColorSpace;
  bgenTex.anisotropy = 4;
  const bgenMat = new THREE.MeshBasicMaterial({ map: bgenTex, transparent: true, toneMapped: false, depthWrite: false, alphaTest: 0.02 });
  function makeBGen(size: number) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), bgenMat);
    m.renderOrder = 3;
    g.add(m);
    return g;
  }
  const bgen = makeBGen(5.2);
  scene.add(bgen);
  const ghosts = [makeBGen(4.2), makeBGen(4.2)];
  ghosts.forEach((g) => {
    g.visible = false;
    scene.add(g);
  });
  const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.18, depthWrite: false }));
  shadowDisc.rotation.x = -Math.PI / 2;
  scene.add(shadowDisc);

  const blink = makeBlinker();
  let expr: Expr = "curioso";
  let exprUntil = 0;
  let auraK = 0;
  /** Redibuja el sprite (cara animada + aura cian→lima cuando está potenciado). */
  function drawFace(t: number, gx: number) {
    bctx.clearRect(0, 0, 512, 512);
    drawBGen(bctx, 256, 256, 440, { expr, t, blink: blink(t), gx, gy: 0, talk: 0 }, auraK);
    bgenTex.needsUpdate = true;
  }

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
  // relámpago: dos tubos dentados (núcleo lima + halo cian) que se regeneran cada cuadro mientras dura
  const boltCore = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: "#F3FFB0", transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  const boltHalo = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: COLORS.cian, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(boltHalo, boltCore);
  const flashTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(178,243,38,0.9)");
    gr.addColorStop(1, "rgba(10,182,188,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.set(-29, 42, -29);
  scene.add(flash);
  function buildBolt(from: THREE.Vector3, to: THREE.Vector3, amp: number, seed: number) {
    const pts: THREE.Vector3[] = [];
    const dir = to.clone().sub(from);
    const n = 14;
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const p = from.clone().addScaledVector(dir, k);
      if (i > 0 && i < n) {
        const j = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
        const r1 = j - Math.floor(j);
        const j2 = Math.sin(seed * 39.3468 + i * 11.135) * 24634.6345;
        const r2 = j2 - Math.floor(j2);
        const env = Math.sin(k * Math.PI);
        p.addScaledVector(side, (r1 - 0.5) * 2 * amp * env);
        p.y += (r2 - 0.5) * amp * env;
      }
      pts.push(p);
    }
    return new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.05);
  }
  let boltSeed = 0;
  let shake = 0;
  let outroT = -1;
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
  const LIVES = 3;
  let lives = LIVES;
  hooks.lives(lives);
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
    hooks.stage("charge");
  }
  /** Avanza por el riel; cambia de fase al cruzar cada tramo y llega a la Casa Central. */
  function advance(dt: number) {
    if (arrived) {
      // entra unos metros a la plaza y se planta frente a la torre
      s = SB[3] + Math.min(7, SB[4] - SB[3]) * Math.min(1, (clock.elapsed - T[3]) / 3);
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
      const inLane = it.lanes.some((l) => Math.abs(laneX - l) < 0.42);
      if (!inLane) continue;
      if (it.kind === "conector") {
        it.done = true;
        it.obj.visible = false;
        conGot[it.sec]++;
        scorer.hit(t < orqUntil ? 20 : 10, t);
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
          say("logro", "¡Modo orquestador! Puntos dobles y nada me frena.", 5);
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
      shake = Math.max(shake, 0.7);
      lives--;
      hooks.lives(lives);
      if (lives <= 0) {
        // se acabaron las vidas: el juego queda congelado donde está
        ended = true;
        paused = true;
        clock.paused = true;
        boost = false;
        say("mareado", "¡Uf! Demasiados Problemones…", 9);
        const pct = connectedPct();
        hooks.gameOver({ score: scorer.score, metricValue: `${Math.round(pct * 100)}%`, metricPct: pct });
        return;
      }
      sfx("g.fail", { volume: 0.5 });
      say("mareado", ["¡Uy! Un Problemón.", "¡Ay! Esquivá los Problemones.", "¡Otra vez!"][hits.reduce((a, b) => a + b, 0) % 3], 1);
    }
  }

  /* ---------- medidor de carga del rayo (clímax) ---------- */
  const CHARGE_MAX = 60;
  function drawChargeMeter(w: number, h: number, k: number, secsLeft: number) {
    const bw = Math.min(w * 0.6, 640 * k), bh = 26 * k;
    const x = (w - bw) / 2, y = 118 * k;
    const fill = Math.min(1, charge / CHARGE_MAX);
    const cut = 12 * k;
    octx.save();
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    // título que late
    const pulse = 1 + 0.04 * Math.sin(performance.now() / 120);
    octx.font = `900 ${Math.round(30 * k * pulse)}px "Archivo Black", Archivo, "Arial Black", Arial`;
    octx.lineWidth = 8 * k;
    octx.strokeStyle = "rgba(33,37,41,0.9)";
    octx.fillStyle = "#fff";
    octx.strokeText("¡TOCÁ RÁPIDO Y CARGÁ EL RAYO!", w / 2, y - 48 * k);
    octx.fillText("¡TOCÁ RÁPIDO Y CARGÁ EL RAYO!", w / 2, y - 48 * k);
    // placa biselada
    const plate = (px: number, py: number, pw: number, ph: number) => {
      octx.beginPath();
      octx.moveTo(px + cut, py);
      octx.lineTo(px + pw - cut, py);
      octx.lineTo(px + pw, py + cut);
      octx.lineTo(px + pw, py + ph - cut);
      octx.lineTo(px + pw - cut, py + ph);
      octx.lineTo(px + cut, py + ph);
      octx.lineTo(px, py + ph - cut);
      octx.lineTo(px, py + cut);
      octx.closePath();
    };
    plate(x - 6 * k, y - 6 * k, bw + 12 * k, bh + 12 * k);
    octx.fillStyle = "#212529";
    octx.fill();
    plate(x, y, bw, bh);
    octx.fillStyle = "#3a3e46";
    octx.fill();
    if (fill > 0) {
      octx.save();
      plate(x, y, bw, bh);
      octx.clip();
      const g = octx.createLinearGradient(x, 0, x + bw, 0);
      g.addColorStop(0, COLORS.cian);
      g.addColorStop(1, COLORS.lima);
      octx.fillStyle = g;
      octx.fillRect(x, y, bw * fill, bh);
      octx.restore();
    }
    // marcas de segmentos
    octx.strokeStyle = "rgba(33,37,41,0.55)";
    octx.lineWidth = 2 * k;
    for (let i = 1; i < 10; i++) {
      octx.beginPath();
      octx.moveTo(x + (bw * i) / 10, y);
      octx.lineTo(x + (bw * i) / 10, y + bh);
      octx.stroke();
    }
    // porcentaje y cuenta regresiva
    octx.font = `800 ${Math.round(16 * k)}px Inter, Archivo, Arial`;
    octx.fillStyle = "#fff";
    octx.fillText(`${Math.round(fill * 100)} %`, w / 2, y + bh / 2 + 1);
    octx.font = `500 ${Math.round(15 * k)}px "JetBrains Mono", monospace`;
    octx.fillStyle = "#fff";
    octx.strokeStyle = "rgba(33,37,41,0.8)";
    octx.lineWidth = 5 * k;
    const msg = `el rayo sale en ${Math.max(0, Math.ceil(secsLeft))} s`;
    octx.strokeText(msg, w / 2, y + bh + 26 * k);
    octx.fillText(msg, w / 2, y + bh + 26 * k);
    octx.restore();
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
    const fov = 55 + boostK * 12 + (clock.phase === 3 && !ended ? 10 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    const p = curve.getPointAt(u);
    const tg = curve.getTangentAt(u);
    const right = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
    laneX += (lane - laneX) * Math.min(1, dt * 12);
    const jt = t - jumpT;
    let jumpY = jt < 0.62 ? Math.sin((jt / 0.62) * Math.PI) * 2.7 : 0;
    if (ended && outroT >= 0 && lives > 0) jumpY = Math.abs(Math.sin(outroT * 4.2)) * 2.2;
    const bob = opts.reducedMotion ? 0 : Math.sin(now / 300) * 0.15;
    bgen.position.copy(p).addScaledVector(right, laneX * LANE_W).setY(2.3 + jumpY + bob);
    shadowDisc.position.set(bgen.position.x, 0.12, bgen.position.z);
    (shadowDisc.material as THREE.MeshBasicMaterial).opacity = 0.2 - jumpY * 0.04;
    bgen.quaternion.copy(camera.quaternion);
    bgen.visible = !(t < invulnUntil && Math.floor(t * 12) % 2 === 0);
    auraK = t < autoUntil || t < orqUntil ? 1 : clock.phase >= 1 ? 0.4 : 0;
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
        hooks.stage(null);
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
      const k = Math.max(0, 1 - (e - (opts.durationSec - 2.6)) / 2.4); // 1 → 0 mientras dura
      const from = bgen.position.clone().setY(bgen.position.y + 1);
      const to = new THREE.Vector3(-29, 40, -29);
      const power = 0.6 + Math.min(1.6, charge / 25);
      if (k > 0 && Math.floor(now / 45) !== boltSeed) {
        boltSeed = Math.floor(now / 45);
        const c = buildBolt(from, to, 2.4 * power, boltSeed);
        boltCore.geometry.dispose();
        boltHalo.geometry.dispose();
        boltCore.geometry = new THREE.TubeGeometry(c, 48, 0.22 * power, 6, false);
        boltHalo.geometry = new THREE.TubeGeometry(c, 48, 0.9 * power, 6, false);
      }
      const flick = 0.75 + 0.25 * Math.sin(now / 23);
      (boltCore.material as THREE.MeshBasicMaterial).opacity = k * flick;
      (boltHalo.material as THREE.MeshBasicMaterial).opacity = k * 0.55 * flick;
      (flash.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 1.4);
      flash.scale.setScalar(18 * power * (0.8 + 0.4 * flick) * (0.5 + k * 0.5));
      // sacudida de cámara al impacto
      shake = Math.max(shake, k * 0.9);
    }

    // métrica
    const pct = beamFired ? (finalPower[0] + finalPower[1] + finalPower[2] + hq.power) / 4 : connectedPct();
    if (running) hooks.metric(`${Math.round(pct * 100)}%`, pct);

    if (clock.done && !ended) {
      // cierre: BGen festeja frente a la Casa Central encendida, mensaje y recién después el resultado
      ended = true;
      outroT = 0;
      expr = "logro";
      sfx("g.win");
      const final = (finalPower[0] + finalPower[1] + finalPower[2] + 1) / 4;
      const pct = Math.round(final * 100);
      const areas = (["ventas", "operaciones", "finanzas"] as const).map((id, i) => `${ZONE_NAME[id]} ${Math.round(finalPower[i] * 100)}%`).join(" · ");
      window.setTimeout(() => hooks.stage("outro", { title: `¡Compañía conectada al ${pct}%!`, text: `Integraste ${areas}. Esto es lo que BGenAI puede hacer en tu empresa.` }), 900);
      window.setTimeout(() => {
        hooks.stage(null);
        hooks.end({ score: scorer.score, metricValue: `${pct}%`, metricPct: final });
      }, 7000);
    }
    if (ended && !paused) outroT += dt;

    // cámara: seguimiento ↔ vista de maqueta
    const sc = showcase && t < showcase.until ? zones[showcase.zone] : null;
    if (LINEUP) {
      const a = curve.getPointAt(16 / L), b = curve.getPointAt(4 / L);
      desiredPos.copy(b).setY(4.2);
      desiredLook.copy(a).setY(1.3);
    } else if (clock.phase === 3 && !ended) {
      // detrás de BGen, bajo y mirando a la Casa Central: se ve a BGen, el Caos y el rayo
      desiredPos.copy(bgen.position).add(new THREE.Vector3(0, 9, -22));
      desiredLook.set(-29, 10, -29);
    } else if (ended && lives > 0) {
      const a = -0.5 + outroT * 0.12;
      desiredPos.copy(bgen.position).add(new THREE.Vector3(Math.sin(a) * 12, 4.5, -Math.cos(a) * 12));
      desiredLook.copy(bgen.position).add(new THREE.Vector3(0, 3, 6));
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
    if (shake > 0.001 && !opts.reducedMotion) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake * 0.6;
      shake *= Math.exp(-dt * 6);
    }
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
    if (clock.phase === 3 && !beamFired && !ended) drawChargeMeter(overlay.clientWidth, overlay.clientHeight, Math.max(0.8, overlay.clientWidth / 1200), (opts.durationSec - 2.6) - e);
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
