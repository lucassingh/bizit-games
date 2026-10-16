import type { CreateGame, Expr, GameHooks } from "../types";
import { PHASES, phaseBounds, type PhaseIndex } from "@/lib/games";
import { bindGestures, fitCanvas, PhaseClock, Popups, rng, Scorer } from "../shared/engine";
import { drawBGen, makeBlinker } from "../shared/bgenFace";
import { COLORS } from "@/lib/brand";
import { music, sfx } from "@/lib/audio";
import { Crown, Users, type IconNode } from "lucide";
import { drawIcon } from "../shared/icons";
import { drawEnemySprite, type EnemyKind } from "../deploy/art";
import { drawBoard, drawNightStatic, drawPerson, drawWindows, HQ_IMG, towerWindows } from "./office";
import { CORE_HALF, drawBoss, HALF_W, HATCHES, hullBottom, MOUTH_Y } from "./boss";
import { drawBossBar, drawDefeated, drawWarning } from "../shared/caos";

/**
 * Juego 3 · Bandeja BGen — "De manual a automático" (docs/05, v3).
 * La Casa Central de noche, desde la vereda. La empresa está desbordada y las
 * tareas salen volando por las ventanas de la torre; el equipo espera en la
 * puerta. BGen, en la vereda, se mueve (arrastrar) y dispara: cada tarea que
 * alcanza queda automatizada; cada una que llega al equipo cuesta una vida.
 *  Drive: mails y leads, despacio.
 *  Foundation: más tipos y ritmo; power-up Equipo (BGen más ancho 6 s).
 *  Evolution: lluvia densa, documentos VIP (×3) y bombas DELETE (no atrapar);
 *             power-up Orquestador (5 s: todo se atrapa solo).
 *  Caos: como en los clásicos de naves. Antes, unos segundos de calma (no cae
 *        nada y algo retumba); después baja desde arriba de todo la nave del
 *        Caos Operativo con su barra de vida y larga de todo por sus compuertas.
 *        Los disparos le bajan vida (la pantalla-cara es el punto débil: ×2) y
 *        tocar rápido carga el rayo. Si se lo derrota, el juego termina antes.
 */

const W = 1600, H = 700;
const FLOOR = 600;
const BY = FLOOR + 38; // BGen en la vereda
const R = 46;
const BOLT_SPEED = 1250;
const FIRE_EVERY = 0.26;

/* ---------- jefe final ---------- */
/** Fases propias de este juego: el Caos arranca antes para que la pelea tenga tiempo. */
const BOUNDS = phaseBounds("central");
/** Segundos sin tareas antes de que llegue el jefe. */
const CALM = 2.6;
/** Segundos que tarda en bajar (con la alerta) antes de pelear. */
const INTRO = 3.4;
/** Altura del centro del casco durante la pelea. */
const HOVER = 150;
const BOSS_HP = 400;
/** Toques para cargar el rayo, y cuánto le saca. */
const CHARGE_MAX = 14;
const BEAM_DMG = 60;
const BOSS_KINDS: EnemyKind[] = ["mail", "excel", "factura", "fantasma", "reporte"];

type Drop = {
  kind: EnemyKind | "vip" | "bomb" | "team" | "orq";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  r: number;
  dead?: boolean;
  /** 0..1 animación de "absorbido" */
  got?: number;
};

interface Bolt {
  x: number;
  y: number;
  dead?: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
  r: number;
}

const PHASE_KINDS: (EnemyKind | "vip" | "bomb")[][] = [
  ["mail", "mail", "fantasma"],
  ["mail", "fantasma", "excel", "reporte"],
  ["mail", "excel", "factura", "reporte", "vip", "vip", "bomb"],
];
const PHASE_EVERY = [1.35, 1.0, 0.8];
const PHASE_FALL = [130, 165, 210];
const ZONE_NAME = ["Ventas", "Operaciones", "Finanzas", "Casa Central"];
/** El equipo esperando en la puerta de la torre. */
const TEAM = [640, 700, 900, 960];

const createGame: CreateGame = (host, hooks: GameHooks, opts) => {
  const { canvas, ctx, state, dispose } = fitCanvas(host);
  const scorer = new Scorer(hooks);
  const popups = new Popups();
  const blink = makeBlinker();
  const rand = rng(20261122);
  const BOSS_AT = BOUNDS[2] * opts.durationSec;

  let paused = false;
  let ended = false;
  let t = 0;
  let bx = W / 2, targetX = W / 2;
  let expr: Expr = "curioso";
  let exprUntil = 0;
  let lives = 3;
  let invulnUntil = 0;
  let shake = 0;
  let wideUntil = 0, orqUntil = 0, orqWas = false;
  let spawnIn = 1.2;
  let caught = 0, dropped = 0, total = 0;
  const drops: Drop[] = [];
  const sparks: Spark[] = [];
  const bolts: Bolt[] = [];
  let fireIn = 0;
  const deskMood = TEAM.map(() => 0.2);
  const deskShake = TEAM.map(() => 0);
  const WINS = towerWindows(W, FLOOR);
  let powerSpawned = [false, false, false];

  // jefe
  const boss = {
    x: W / 2,
    y: -280,
    tilt: 0,
    hp: BOSS_HP,
    /** Vida "fantasma" que baja despacio detrás de la real (barra de daño). */
    trail: BOSS_HP,
    flash: 0,
    recoil: 0,
    rage: false,
    hatch: [0, 0, 0, 0],
    mouth: 0,
    /** -1 hasta que empieza a bajar. */
    introT: -1,
    fight: false,
    ft: 0,
    attackIn: 1.2,
    pattern: 0,
    dying: -1,
    gone: false,
    escaping: false,
    hitSfxAt: -9,
    critAt: -9,
    explodeIn: 0,
  };
  /** Partes de un ataque que salen con demora (barridos de compuertas). */
  const later: { at: number; fn: () => void }[] = [];
  let calmed = false;
  let rumbleIn = 0;
  let charge = 0;
  let beamT = -1;
  let firstBeam = false;
  let finishAt = -1;
  let screenFlash = 0;
  let killT = -1;
  let killPts = 0;
  let outcome: "win" | "escaped" | null = null;

  const say = (e: Expr, text?: string, hold = 1.2) => {
    expr = e;
    exprUntil = t + hold;
    hooks.bgen(e, text);
  };

  // el cartel "¡El Caos Operativo!" lo reemplaza la alerta del juego
  const clockHooks: GameHooks = {
    ...hooks,
    banner: (title, subtitle) => {
      if (title !== PHASES[3].title) hooks.banner(title, subtitle);
    },
  };
  const clock = new PhaseClock(
    clockHooks,
    opts.durationSec,
    (p: PhaseIndex) => {
      if (p >= 1 && p <= 2) {
        const pts = scorer.hit(300, t, false);
        popups.add(W / 2, 250, `¡${ZONE_NAME[p - 1]} automatizada! +${pts}`, COLORS.naranja);
        sfx("g.phase");
        say("logro", p === 1 ? "¡Llegó el equipo de agentes! Disparo triple." : "¡Finanzas! Agarrá la corona: multitiro. ¡Los DELETE no se tocan!", 3);
      }
      if (p === 3) {
        boss.introT = 0;
        sfx("g.phase", { rate: 0.7 });
        music.duck(0.3, 1);
        say("concentrado", "¡Es el Caos Operativo! Preparate…", INTRO);
        // lo que quedaba cayendo se automatiza: la pelea arranca limpia
        for (const d of drops) {
          if (d.got !== undefined || d.kind === "team" || d.kind === "orq") continue;
          if (d.kind === "bomb") d.dead = true;
          else {
            d.got = 0;
            caught++;
          }
        }
      }
    },
    false,
    BOUNDS,
  );
  hooks.lives(lives);
  hooks.metric("0%", 0);
  say("curioso", "¡Llueven tareas! Movéme: disparo solo y las automatizo.", 3);

  /* ---------- input ---------- */
  const toWorld = (px: number) => {
    const v = view();
    return (px - v.ox) / v.s;
  };
  const unbind = bindGestures(canvas, {
    onDragStart(x) {
      if (paused || ended) return false;
      targetX = toWorld(x);
      fireIn = 0;
      chargeTap();
      return true;
    },
    onDragMove(x) {
      targetX = toWorld(x);
    },
    onDragEnd() {
    },
    onTap(x) {
      if (paused || ended) return;
      targetX = toWorld(x);
      fire();
      chargeTap();
    },
    onSwipe(dir) {
      if (dir === "left") targetX = Math.max(120, targetX - 220);
      if (dir === "right") targetX = Math.min(W - 120, targetX + 220);
    },
  });

  /** Se dispara siempre, menos mientras baja el jefe y cuando ya explotó. */
  const canFire = () => !(clock.phase === 3 && !boss.fight) && boss.dying < 0 && !boss.gone;

  function fire() {
    if (ended || !canFire()) return;
    bolts.push({ x: bx, y: BY - R });
    sfx("g.laser", { volume: 0.45, rate: 1.4 + Math.random() * 0.2 });
  }

  /* ---------- mundo ---------- */
  function spawn(kind?: Drop["kind"]) {
    const p = Math.min(2, clock.phase);
    const kinds = PHASE_KINDS[p];
    const k = kind ?? kinds[Math.floor(rand() * kinds.length)];
    const power = k === "team" || k === "orq";
    // solo desde los pisos altos (al menos 330 px de caída: da tiempo a cruzar la vereda)
    const high = WINS.filter((w) => w.y < FLOOR - 330);
    const fromWin = rand() < 0.7 && high.length > 0;
    const win = high[Math.floor(rand() * high.length)] ?? WINS[0];
    drops.push({
      kind: k,
      x: fromWin ? win.x + (rand() - 0.5) * win.w * 0.8 : 170 + rand() * (W - 340),
      y: fromWin ? win.y : -60,
      vx: 0,
      vy: PHASE_FALL[p] * (0.85 + rand() * 0.3) * (power ? 0.8 : 1),
      rot: (rand() - 0.5) * 0.5,
      vr: (rand() - 0.5) * 1.2,
      r: k === "vip" ? 30 : k === "bomb" ? 28 : power ? 30 : 34,
    });
    if (!power && k !== "bomb") total++;
  }

  /** Una tarea que larga el jefe (por una compuerta o por la boca). */
  function spawnAt(kind: Drop["kind"], x: number, y: number, vx: number, vy: number) {
    drops.push({ kind, x, y, vx, vy, rot: (rand() - 0.5) * 0.5, vr: (rand() - 0.5) * 1.6, r: kind === "bomb" ? 28 : 34 });
    if (kind !== "bomb") total++;
  }

  function burst(x: number, y: number, n: number, colors: string[]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 320;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150, life: 1, c: colors[i % colors.length], r: 4 + Math.random() * 6 });
    }
  }

  function loseLife(reason: string, deskIdx: number) {
    if (t < invulnUntil) return;
    invulnUntil = t + 1.2;
    shake = 0.7;
    deskShake[deskIdx] = 1;
    deskMood[deskIdx] = Math.max(0, deskMood[deskIdx] - 0.5);
    lives--;
    hooks.lives(lives);
    scorer.miss();
    sfx("g.hit", { volume: 0.7 });
    // respiro: lo que ya venía bajando se evapora (no cuenta) y hay 1,5 s sin tareas nuevas
    for (const d of drops) {
      if (d.got !== undefined || d.kind === "team" || d.kind === "orq") continue;
      d.dead = true;
      if (d.kind !== "bomb") total--;
      burst(d.x, d.y, 6, ["#D9CBB0"]);
    }
    spawnIn = Math.max(spawnIn, 1.5);
    later.length = 0;
    boss.attackIn = Math.max(boss.attackIn, 1.6);
    if (lives <= 0) {
      ended = true;
      paused = true;
      clock.paused = true;
      say("mareado", "¡Uf! Se me desbordó la bandeja…", 9);
      const pct = metricPct();
      hooks.gameOver({ score: scorer.score, metricValue: `${Math.round(pct * 100)}%`, metricPct: pct });
      return;
    }
    sfx("g.fail", { volume: 0.5 });
    say("mareado", reason, 1.2);
  }

  const metricPct = () => (total ? Math.min(1, caught / total) : 0);

  /** Todo lo que está cayendo se automatiza (rayo, jefe derrotado); los DELETE desaparecen. */
  function autoCatchAll() {
    for (const d of drops) {
      if (d.got !== undefined || d.kind === "team" || d.kind === "orq") continue;
      if (d.kind === "bomb") {
        d.dead = true;
        burst(d.x, d.y, 6, ["#999"]);
        continue;
      }
      d.got = 0;
      caught++;
    }
  }

  /* ---------- jefe ---------- */
  function chargeTap() {
    if (clock.phase !== 3 || !boss.fight || boss.dying >= 0 || boss.gone || ended) return;
    charge++;
    if (charge >= CHARGE_MAX) fireBeam();
  }

  function fireBeam() {
    charge = 0;
    beamT = 0;
    if (!firstBeam) {
      firstBeam = true;
      hooks.stage(null);
    }
    sfx("g.beam");
    shake = 1;
    const pts = scorer.hit(300, t, false);
    popups.add(boss.x, boss.y + 220, `¡RAYO! +${pts}`, COLORS.lima);
    burst(boss.x, boss.y + 20, 30, [COLORS.lima, COLORS.cian, "#fff"]);
    autoCatchAll();
    say("logro", "¡Rayo! Seguí tocando para cargar otro.", 1.6);
    hitBoss(BEAM_DMG, boss.x, boss.y + 40, true);
  }

  function hitBoss(n: number, x: number, y: number, beam = false) {
    boss.hp = Math.max(0, boss.hp - n);
    boss.flash = Math.min(1, boss.flash + (beam ? 1 : 0.3));
    if (!beam) {
      const crit = n >= 2;
      scorer.hit(crit ? 12 : 5, t, false);
      burst(x, y, crit ? 5 : 3, crit ? [COLORS.naranja, "#ffd27a", "#fff"] : [COLORS.lima, COLORS.cian]);
      if (crit) boss.recoil = Math.min(8, boss.recoil + 1.5);
      if (t - boss.hitSfxAt > 0.08) {
        boss.hitSfxAt = t;
        sfx("g.tap", { volume: 0.32, rate: crit ? 1.6 : 1.15 });
      }
      if (crit && t - boss.critAt > 1.6) {
        boss.critAt = t;
        popups.add(x, y + 36, "¡CRÍTICO!", COLORS.naranja);
      }
    }
    if (!boss.rage && boss.hp > 0 && boss.hp < BOSS_HP * 0.35) {
      boss.rage = true;
      hooks.hint("¡EL CAOS SE ENFURECIÓ!");
      sfx("g.fail", { volume: 0.7, rate: 0.6 });
      say("concentrado", "¡Se enfureció! Aguantá que ya casi lo tenemos.", 2.5);
      boss.attackIn = Math.min(boss.attackIn, 0.7);
    }
    if (boss.hp <= 0 && boss.dying < 0) startDying();
  }

  function startDying() {
    boss.dying = 0;
    later.length = 0;
    hooks.stage(null);
    shake = 1;
    sfx("g.beam", { rate: 0.8 });
    say("logro", "¡Se está desarmando!", 2.2);
    autoCatchAll();
  }

  function defeated() {
    boss.gone = true;
    screenFlash = 1;
    shake = 1.2;
    burst(boss.x, boss.y, 70, [COLORS.naranja, "#ffd27a", "#fff", COLORS.rojo, COLORS.lima]);
    // los papeles del torbellino salen volando
    burst(boss.x, boss.y - 90, 40, ["#D9CBB0", "#EDE6DA", "#BDB3A0"]);
    sfx("g.bell", { volume: 0.9 });
    killPts = scorer.hit(2000 + Math.round(clock.left) * 40, t, false);
    killT = 0;
    say("logro", "¡Caos derrotado! La bandeja quedó en cero.", 6);
    outcome = "win";
    finishAt = t + 1.6;
  }

  function dropFromHatch(h: number, kind?: Drop["kind"]) {
    if (boss.dying >= 0 || boss.gone) return;
    boss.hatch[h] = 1;
    const hx = HATCHES[h];
    spawnAt(kind ?? BOSS_KINDS[Math.floor(rand() * BOSS_KINDS.length)], boss.x + hx, boss.y + hullBottom(hx) + 18, (rand() - 0.5) * 50, 210 + rand() * 60);
    sfx("g.down", { volume: 0.22, rate: 1.7 });
  }

  /** Tres ataques que se turnan: barrido por las compuertas, abanico por la boca y mezcla con un DELETE. */
  function attack() {
    const pat = boss.pattern++ % 3;
    const at = (s: number, fn: () => void) => later.push({ at: t + s, fn });
    if (pat === 0) {
      const order = boss.pattern % 2 ? [0, 1, 2, 3] : [3, 2, 1, 0];
      order.forEach((h, i) => at(i * 0.22, () => dropFromHatch(h)));
    } else if (pat === 1) {
      boss.mouth = 1;
      sfx("g.zap", { volume: 0.55, rate: 0.7 });
      const n = boss.rage ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const f = (i / (n - 1)) * 2 - 1;
        spawnAt(BOSS_KINDS[Math.floor(rand() * BOSS_KINDS.length)], boss.x + f * 36, boss.y + MOUTH_Y + 14, f * 190, 220);
      }
    } else {
      const hs = [0, 1, 2, 3];
      for (let i = hs.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [hs[i], hs[j]] = [hs[j], hs[i]];
      }
      at(0, () => dropFromHatch(hs[0]));
      at(0.14, () => dropFromHatch(hs[1]));
      at(0.32, () => dropFromHatch(hs[2], "bomb"));
      if (boss.rage) at(0.5, () => dropFromHatch(hs[3]));
    }
  }

  function updateBoss(dt: number) {
    const b = boss;
    b.flash = Math.max(0, b.flash - dt * 4);
    b.recoil *= Math.exp(-dt * 10);
    b.mouth = Math.max(0, b.mouth - dt * 2.2);
    for (let i = 0; i < b.hatch.length; i++) b.hatch[i] = Math.max(0, b.hatch[i] - dt * 2.4);
    b.trail += (b.hp - b.trail) * Math.min(1, dt * 2.5);
    if (b.gone) return;
    if (!b.fight) {
      // la bajada: desde arriba de todo hasta su lugar, mientras suena la alerta
      b.introT += dt;
      const k = Math.min(1, b.introT / (INTRO - 0.5));
      const e = 1 - Math.pow(1 - k, 3);
      b.x = W / 2;
      b.y = -280 + (HOVER + 280) * e;
      b.tilt = Math.sin(b.introT * 2.2) * 0.03 * (1 - k);
      if (b.introT >= INTRO) {
        b.fight = true;
        b.ft = 0;
        b.attackIn = 1.1;
        music.duck(1, 0.8);
        sfx("g.go");
        hooks.stage("charge");
        hooks.hint("¡A PELEAR! DISPARALE A LA PANTALLA");
        say("concentrado", "¡Ahora! La pantalla es su punto débil. ¡Tocá rápido para el rayo!", 3.5);
      }
      return;
    }
    if (b.dying >= 0) {
      b.dying += dt / 2.2;
      shake = Math.max(shake, 0.55);
      b.y += dt * 14;
      b.explodeIn -= dt;
      if (b.explodeIn <= 0) {
        b.explodeIn = 0.09;
        burst(b.x + (rand() - 0.5) * HALF_W * 1.8, b.y + (rand() - 0.3) * 110, 14, [COLORS.naranja, "#ffd27a", "#fff", COLORS.rojo]);
        if (t - b.hitSfxAt > 0.18) {
          b.hitSfxAt = t;
          sfx("g.hit", { volume: 0.6, rate: 0.6 + rand() * 0.5 });
        }
      }
      if (b.dying >= 1) defeated();
      return;
    }
    b.ft += dt;
    b.x = W / 2 + Math.sin(b.ft * 0.55) * 90;
    b.y = HOVER + Math.sin(b.ft * 1.3) * 7 - b.recoil;
    b.tilt = Math.cos(b.ft * 0.55) * 0.025;
    for (let i = later.length - 1; i >= 0; i--)
      if (t >= later[i].at) {
        const fn = later[i].fn;
        later.splice(i, 1);
        fn();
      }
    b.attackIn -= dt;
    if (b.attackIn <= 0) {
      attack();
      b.attackIn = (b.rage ? 1.5 : 2.1) * (0.9 + rand() * 0.2);
    }
  }

  /** Efectos que siguen animando aunque el reloj haya terminado (explosión, rayo, chispas). */
  function stepFx(dt: number) {
    for (const s of sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 900 * dt;
      s.life -= dt * 1.6;
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
    screenFlash = Math.max(0, screenFlash - dt * 1.8);
    if (beamT >= 0) beamT = beamT + dt > 0.6 ? -1 : beamT + dt;
    if (killT >= 0) killT += dt;
    shake *= Math.exp(-dt * 5);
  }

  /* ---------- simulación ---------- */
  function update(dt: number) {
    if (!clock.step(dt)) {
      if (ended) afterEnd(dt);
      return;
    }
    t += dt;
    const p = clock.phase;

    // BGen sigue el dedo con suavidad
    const tx = Math.max(120, Math.min(W - 120, targetX));
    bx += (tx - bx) * Math.min(1, dt * 14);
    // disparo automático continuo (en la tablet alcanza con mover a BGen); tocar suma tiros extra
    if (!ended && canFire()) {
      fireIn -= dt;
      if (fireIn <= 0) {
        fire();
        if (t < wideUntil) bolts.push({ x: bx - 46, y: BY - R * 0.6 }, { x: bx + 46, y: BY - R * 0.6 });
        if (t < orqUntil) for (const dx of [-140, -70, 70, 140]) bolts.push({ x: bx + dx, y: BY - R * 0.6 });
        fireIn = FIRE_EVERY;
      }
    }
    for (const b of bolts) {
      b.y -= BOLT_SPEED * dt;
      if (b.y < -40) b.dead = true;
    }

    // calma antes del jefe: dejan de caer tareas y algo grande retumba
    const calm = p === 2 && clock.elapsed >= BOSS_AT - CALM;
    if (calm && !calmed) {
      calmed = true;
      music.duck(0.3, 1.2);
      say("curioso", "Shh… ¿escuchaste eso? Algo grande se acerca.", CALM + 0.6);
    }
    if (calm || (p === 3 && !boss.fight)) {
      rumbleIn -= dt;
      if (rumbleIn <= 0) {
        rumbleIn = 0.5 + rand() * 0.35;
        shake = Math.max(shake, calm ? 0.22 : 0.45);
        sfx("g.near", { volume: 0.35, rate: 0.45 });
      }
    }

    // caída de tareas (en el Caos las larga el jefe)
    spawnIn -= dt;
    if (spawnIn <= 0 && p < 3 && !calm) {
      spawn();
      spawnIn = PHASE_EVERY[p] * (0.8 + rand() * 0.4);
    }
    // power-ups acumulativos: el Equipo (disparo triple) llega al entrar a Foundation y se queda
    // hasta el final; el Orquestador (abanico, 7 s) cae al principio de Evolution y de nuevo a la mitad
    if (p >= 1 && !powerSpawned[0]) {
      powerSpawned[0] = true;
      wideUntil = Infinity;
      sfx("g.power");
      hooks.hint("EQUIPO DE AGENTES: DISPARO TRIPLE");
      burst(bx, BY - R, 24, [COLORS.cian, COLORS.lima, "#fff"]);
    }
    if (orqWas && t >= orqUntil) {
      orqWas = false;
      hooks.hint("ORQUESTADOR TERMINADO · SEGUÍS CON TRIPLE");
      sfx("g.down", { volume: 0.5 });
    }
    if (p === 2 && !powerSpawned[1] && clock.phaseProgress() > 0.05) {
      powerSpawned[1] = true;
      spawn("orq");
    }
    if (p === 2 && !powerSpawned[2] && clock.phaseProgress() > 0.55) {
      powerSpawned[2] = true;
      spawn("orq");
    }
    if (p === 3) updateBoss(dt);

    const orq = t < orqUntil;
    for (const d of drops) {
      if (d.dead) continue;
      if (d.got !== undefined) {
        // absorbido: vuela al tablero
        d.got += dt * 2.2;
        d.x += (W - 190 - d.x) * Math.min(1, dt * 5);
        d.y += (70 - d.y) * Math.min(1, dt * 5);
        if (d.got >= 1) d.dead = true;
        continue;
      }
      d.x += d.vx * dt;
      if ((d.x < 90 && d.vx < 0) || (d.x > W - 90 && d.vx > 0)) d.vx *= -1;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      // ¿le pegó un disparo? (en modo orquestador todo lo que entra en escena se automatiza solo)
      let shot = orq && d.kind !== "bomb" && d.y > 60;
      if (!shot)
        for (const b of bolts) {
          if (b.dead) continue;
          if (Math.abs(b.x - d.x) < d.r + 8 && Math.abs(b.y - d.y) < d.r + 14) {
            b.dead = true;
            shot = true;
            break;
          }
        }
      if (shot) {
        if (d.kind === "bomb") {
          d.dead = true;
          burst(d.x, d.y, 26, [COLORS.rojo, "#fff", "#444"]);
          scorer.miss();
          scorer.score = Math.max(0, scorer.score - 150);
          hooks.score(scorer.score, 1);
          popups.add(d.x, d.y - 40, "¡DELETE! −150", COLORS.rojo);
          sfx("g.fail", { volume: 0.9, rate: 1.4 });
          shake = 0.6;
          say("mareado", "¡Ese era un DELETE! No se toca.", 1.2);
          continue;
        }
        if (d.kind === "team") {
          d.dead = true;
          wideUntil = Infinity;
          sfx("g.power");
          say("logro", "¡Equipo de agentes! Disparo triple.", 3);
          hooks.hint("EQUIPO DE AGENTES");
          burst(d.x, d.y, 24, [COLORS.cian, COLORS.lima, "#fff"]);
          continue;
        }
        if (d.kind === "orq") {
          d.dead = true;
          orqUntil = t + 7;
          orqWas = true;
          sfx("g.power2");
          say("logro", "¡Modo orquestador! Multitiro y todo se automatiza.", 3);
          hooks.hint("ORQUESTADOR");
          burst(d.x, d.y, 30, [COLORS.naranja, COLORS.lima, "#fff"]);
          continue;
        }
        d.got = 0;
        caught++;
        const base = d.kind === "vip" ? 300 : 100;
        const pts = scorer.hit(base, t);
        popups.add(d.x, d.y - 40, d.kind === "vip" ? `¡VIP! +${pts}` : `+${pts}`, d.kind === "vip" ? "#D9A441" : COLORS.cian);
        sfx(`g.coin${Math.min(4, scorer.combo)}` as "g.coin1", { volume: 0.8 });
        burst(d.x, d.y, 10, [COLORS.cian, COLORS.lima]);
        say(caught % 6 === 0 ? "logro" : "procesando", caught % 6 === 0 ? "¡Automatizado!" : undefined, 0.8);
        continue;
      }
      // ¿llegó a la vereda (al equipo)?
      if (d.y + d.r >= FLOOR - 30) {
        d.dead = true;
        if (d.kind === "bomb") {
          // la bomba se desactiva sola en el piso
          burst(d.x, FLOOR - 30, 8, ["#999"]);
          continue;
        }
        dropped++;
        burst(d.x, FLOOR - 30, 12, ["#D9CBB0", "#BDB3A0"]);
        sfx("g.near", { volume: 0.4, rate: 0.7 });
        loseLife(["¡Uy! Le cayó al equipo.", "¡Ay! Esa tarea quedó sin hacer.", "¡Otra más a la vereda!"][dropped % 3], nearestDesk(d.x));
        if (ended) return;
      }
    }

    // los disparos que no pegaron en una tarea le pegan al jefe (la cara-pantalla vale doble)
    if (p === 3 && boss.fight && boss.dying < 0 && !boss.gone)
      for (const b of bolts) {
        if (b.dead) continue;
        const dx = b.x - boss.x;
        const bottom = hullBottom(dx);
        if (bottom < -100 || b.y > boss.y + bottom || b.y < boss.y - 90) continue;
        b.dead = true;
        hitBoss(Math.abs(dx) < CORE_HALF ? 2 : 1, b.x, boss.y + bottom);
      }

    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);
    for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].dead) bolts.splice(i, 1);

    // el ánimo de los escritorios mejora con lo automatizado
    const goal = Math.min(1, 0.2 + metricPct() * 0.9);
    for (let i = 0; i < deskMood.length; i++) {
      deskMood[i] += (goal - deskMood[i]) * Math.min(1, dt * 0.6);
      deskShake[i] = Math.max(0, deskShake[i] - dt * 2.5);
    }

    stepFx(dt);
    hooks.metric(`${Math.round(metricPct() * 100)}%`, metricPct());
    if (t > exprUntil && p < 3) expr = "concentrado";

    // jefe derrotado: el juego termina antes (con bonus por el tiempo que sobró)
    if (finishAt >= 0 && t >= finishAt && !clock.done) clock.finish();
    if (clock.done && !ended) finishGame();
  }

  function finishGame() {
    ended = true;
    expr = "logro";
    sfx("g.win");
    hooks.stage(null);
    // se terminó el tiempo justo mientras explotaba: cuenta como derrotado
    if (!outcome && boss.dying >= 0 && !boss.gone) defeated();
    if (!outcome && clock.phase === 3 && !boss.gone) {
      // se acabó el tiempo con el jefe vivo: se escapa, pero el daño suma
      outcome = "escaped";
      boss.escaping = true;
      later.length = 0;
      const dmg = 1 - boss.hp / BOSS_HP;
      const pts = scorer.hit(Math.round(dmg * 1200), t, false);
      if (pts) popups.add(W / 2, 320, `Daño al Caos +${pts}`, COLORS.naranja);
      say("logro", "¡Casi! El Caos se escapó… pero la bandeja quedó en cero.", 5);
      autoCatchAll();
    }
    const pct = metricPct();
    const pc = Math.round(pct * 100);
    const dmgPc = Math.round((1 - boss.hp / BOSS_HP) * 100);
    const detail =
      outcome === "win"
        ? { title: `¡Caos derrotado! Empresa automatizada al ${pc}%`, text: `Atrapaste ${caught} tareas y derrotaste al Caos Operativo. Esto es lo que BGenAI puede hacer en tu empresa.` }
        : { title: `¡Empresa automatizada al ${pc}%!`, text: `Atrapaste ${caught} tareas y le bajaste el ${dmgPc}% de vida al Caos. Esto es lo que BGenAI puede hacer en tu empresa.` };
    window.setTimeout(() => hooks.stage("outro", detail), 900);
    window.setTimeout(() => {
      hooks.stage(null);
      hooks.end({ score: scorer.score, metricValue: `${pc}%`, metricPct: pct });
    }, 12000);
  }

  /** Terminado el reloj: la animación sigue (absorción de tareas, explosión, el jefe que se escapa). */
  function afterEnd(dt: number) {
    if (paused) return;
    t += dt;
    for (const d of drops) {
      if (d.got === undefined || d.dead) continue;
      d.got += dt * 2.2;
      d.x += (W - 190 - d.x) * Math.min(1, dt * 5);
      d.y += (70 - d.y) * Math.min(1, dt * 5);
      if (d.got >= 1) d.dead = true;
    }
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);
    if (boss.escaping) {
      boss.y -= dt * 260;
      boss.tilt = Math.sin(t * 3) * 0.04;
      boss.flash = Math.max(0, boss.flash - dt * 4);
    }
    stepFx(dt);
  }

  function nearestDesk(x: number) {
    let best = 0;
    for (let i = 1; i < TEAM.length; i++) if (Math.abs(TEAM[i] - x) < Math.abs(TEAM[best] - x)) best = i;
    return best;
  }

  /* ---------- dibujo ---------- */
  let bg: HTMLCanvasElement | null = null;
  let bgKey = "";
  function view() {
    const s = Math.min(state.w / W, state.h / H);
    return { s, ox: (state.w - W * s) / 2, oy: (state.h - H * s) / 2 };
  }
  function background(v: ReturnType<typeof view>) {
    const key = `${state.w}x${state.h}@${state.dpr}:${HQ_IMG?.complete && HQ_IMG.naturalWidth ? 1 : 0}`;
    if (bg && bgKey === key) return bg;
    bgKey = key;
    bg = document.createElement("canvas");
    bg.width = Math.round(state.w * state.dpr);
    bg.height = Math.round(state.h * state.dpr);
    const g = bg.getContext("2d")!;
    g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    g.fillStyle = "#0d1020";
    g.fillRect(0, 0, state.w, state.h);
    g.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * v.ox, state.dpr * v.oy);
    drawNightStatic(g, W, H, FLOOR);
    return bg;
  }

  function drawDrop(d: Drop) {
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.got !== undefined) {
      const k = 1 - d.got;
      ctx.scale(k, k);
      ctx.globalAlpha = k;
      // tilde verde
      ctx.strokeStyle = COLORS.lima;
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(-18, 2);
      ctx.lineTo(-5, 15);
      ctx.lineTo(20, -14);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.rotate(d.rot);
    if (d.kind === "vip") {
      // documento dorado con estrella
      ctx.fillStyle = "#F4D27A";
      ctx.strokeStyle = COLORS.carbon;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-24, -32, 48, 64, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#B88A1E";
      for (let k = 0; k < 4; k++) ctx.fillRect(-16, -14 + k * 10, 32 - (k % 2) * 10, 4);
      ctx.fillStyle = COLORS.naranja;
      ctx.font = '900 12px "Archivo Black", Arial';
      ctx.textAlign = "center";
      ctx.fillText("VIP", 0, -20);
      const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 60);
      glow.addColorStop(0, "rgba(255,215,100,0.35)");
      glow.addColorStop(1, "rgba(255,215,100,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-60, -60, 120, 120);
    } else if (d.kind === "bomb") {
      ctx.fillStyle = COLORS.rojo;
      ctx.strokeStyle = COLORS.carbon;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-28, -22, 56, 44, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = '900 13px "Archivo Black", Arial';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DELETE", 0, 1);
      // mecha
      ctx.strokeStyle = COLORS.carbon;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(20, -22);
      ctx.quadraticCurveTo(30, -36, 24, -44);
      ctx.stroke();
      ctx.fillStyle = COLORS.naranja;
      ctx.beginPath();
      ctx.arc(24, -45, 4 + Math.sin(t * 20) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === "team" || d.kind === "orq") {
      const icon: IconNode = d.kind === "team" ? Users : Crown;
      const col = d.kind === "team" ? COLORS.cian : COLORS.naranja;
      ctx.fillStyle = col;
      ctx.strokeStyle = COLORS.carbon;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawIcon(ctx, icon, 0, 0, 30, "#fff", 2.6);
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 40 + Math.sin(t * 5) * 3, 0, Math.PI * 2);
      ctx.stroke();
    } else drawEnemySprite(ctx, d.kind, d.r, t, d.x * 0.01);
    ctx.restore();
  }

  let boltCanvas: HTMLCanvasElement | null = null;
  /** El disparo de BGen con su brillo, dibujado una sola vez. */
  function boltSprite() {
    if (boltCanvas) return boltCanvas;
    const c = document.createElement("canvas");
    c.width = 80;
    c.height = 148;
    const g = c.getContext("2d")!;
    g.scale(2, 2);
    g.translate(20, 37);
    g.shadowColor = COLORS.cian;
    g.shadowBlur = 14;
    g.fillStyle = COLORS.lima;
    g.beginPath();
    g.roundRect(-5, -22, 10, 44, 5);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "#fff";
    g.beginPath();
    g.roundRect(-2, -16, 4, 24, 2);
    g.fill();
    boltCanvas = c;
    return c;
  }

  /** Medidor del rayo: un arco sobre BGen que se llena con cada toque. */
  function drawCharge() {
    const k = charge / CHARGE_MAX;
    const rad = R * 1.55;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.arc(bx, BY - 6, rad, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    if (k > 0) {
      ctx.beginPath();
      ctx.arc(bx, BY - 6, rad, Math.PI * 1.08, Math.PI * (1.08 + 0.84 * k));
      // halo (más fuerte cuando está por cargarse) + trazo
      ctx.strokeStyle = `rgba(178,243,38,${k > 0.7 ? 0.3 + Math.sin(t * 20) * 0.12 : 0.22})`;
      ctx.lineWidth = 20;
      ctx.stroke();
      ctx.strokeStyle = COLORS.lima;
      ctx.lineWidth = 9;
      ctx.stroke();
    }
    ctx.fillStyle = k > 0.7 ? COLORS.lima : "rgba(255,255,255,0.75)";
    ctx.font = '900 13px "Archivo Black", Arial';
    ctx.textAlign = "center";
    ctx.fillText("RAYO", bx, BY - 6 - rad - 12);
    ctx.restore();
  }

  function draw() {
    const v = view();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background(v), 0, 0);
    const amp = opts.reducedMotion ? 0.3 : 1;
    const shx = shake > 0.01 ? (Math.random() - 0.5) * 14 * shake * amp : 0;
    const shy = shake > 0.01 ? (Math.random() - 0.5) * 10 * shake * amp : 0;
    ctx.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * (v.ox + shx * v.s), state.dpr * (v.oy + shy * v.s));

    // ventanas encendidas (las de arriba pasan a lima con lo automatizado)
    drawWindows(ctx, WINS, t, metricPct());

    // el equipo en la puerta
    TEAM.forEach((x, i) => {
      const sx = deskShake[i] > 0 ? Math.sin(t * 50) * 4 * deskShake[i] : 0;
      drawPerson(ctx, x + sx, FLOOR, deskMood[i], t, i);
    });

    // el Caos Operativo (detrás de las tareas que larga)
    const bossOn = clock.phase === 3 && boss.introT >= 0 && !boss.gone && boss.y > -300;
    if (bossOn)
      drawBoss(ctx, boss.x, boss.y, boss.tilt, {
        t,
        hp: boss.hp / BOSS_HP,
        flash: boss.flash,
        rage: boss.rage,
        gaze: Math.max(-1, Math.min(1, (bx - boss.x) / 600)),
        hatch: boss.hatch,
        mouth: boss.mouth,
        dying: boss.dying,
      });

    // tablero
    drawBoard(ctx, W - 190, 70, caught, total);

    // tareas que caen
    for (const d of drops) drawDrop(d);

    // disparos (sprite pre-dibujado: en el Caos hay decenas en pantalla)
    const bolt = boltSprite();
    for (const b of bolts) ctx.drawImage(bolt, b.x - 20, b.y - 37, 40, 74);

    // BGen en el piso, con sombra y los dos agentes del equipo cuando está activo
    const wide = t < wideUntil;
    const vis = !(t < invulnUntil && Math.floor(t * 12) % 2 === 0);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(bx, BY + R * 0.95, R * 1.1, R * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    if (vis) {
      const lean = Math.max(-0.25, Math.min(0.25, (targetX - bx) / 600));
      const bob = Math.sin(t * 6) * (Math.abs(targetX - bx) > 8 ? 3 : 1);
      ctx.save();
      ctx.translate(bx, BY + bob);
      ctx.rotate(lean);
      drawBGen(ctx, 0, 0, R * 2.3, { expr, t, blink: blink(t), gx: lean * 20, gy: -3, talk: 0 }, t < orqUntil || wide ? 1 : clock.phase >= 1 ? 0.4 : 0);
      ctx.restore();
      if (wide)
        for (const sx of [-1, 1]) drawBGen(ctx, bx + sx * 56, BY + 12, R * 1.5, { expr: "procesando", t, blink: blink(t + sx), gx: 0, gy: -3, talk: 0 }, 0.6);
    }
    if (boss.fight && boss.dying < 0 && !boss.gone && !ended) drawCharge();

    // rayo cargado: de BGen a la cara del jefe
    if (beamT >= 0) {
      const k = 1 - beamT / 0.6;
      const tx = boss.x, ty = boss.y + 40;
      ctx.save();
      ctx.lineJoin = "round";
      for (const [wdt, col] of [
        [26, `rgba(10,182,188,${0.5 * k})`],
        [13, `rgba(178,243,38,${k})`],
        [4, `rgba(255,255,255,${k})`],
      ] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = wdt;
        ctx.beginPath();
        ctx.moveTo(bx, BY - R);
        const n = 9;
        for (let i = 1; i <= n; i++) ctx.lineTo(bx + ((tx - bx) * i) / n + (i < n ? (Math.random() - 0.5) * 60 : 0), BY - R + ((ty - BY + R) * i) / n);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, s.r, s.r * 0.7);
    }
    ctx.globalAlpha = 1;
    popups.draw(ctx, 1 / 60, 1.2);

    // barra de vida (arriba a la izquierda: el tablero queda a la derecha y el torbellino al centro)
    if (bossOn && !boss.escaping) {
      const show = boss.fight ? 1 : Math.max(0, (boss.introT - 1.4) / 0.6);
      const fill = boss.fight ? boss.hp / BOSS_HP : Math.max(0, Math.min(1, (boss.introT - 1.9) / 1.2));
      drawBossBar(ctx, 386, 26, 520, fill, boss.fight ? boss.trail / BOSS_HP : fill, t, show, boss.rage);
    }

    // tensión: viñeta roja en la calma y mientras baja, y la franja de alerta
    const calmK = clock.phase === 2 && calmed ? Math.min(1, (clock.elapsed - (BOSS_AT - CALM)) / 1) : 0;
    const introK = clock.phase === 3 && !boss.fight && boss.introT >= 0 ? Math.min(1, (INTRO - boss.introT) / 0.6) : 0;
    const alert = Math.max(calmK, introK);
    if (alert > 0) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 900);
      vg.addColorStop(0, "rgba(120,0,10,0)");
      vg.addColorStop(1, `rgba(120,0,10,${0.45 * alert * (0.75 + 0.25 * Math.sin(t * 6))})`);
      ctx.fillStyle = vg;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    if (clock.phase === 3 && !boss.fight && boss.introT >= 0) drawWarning(ctx, W, 380, t, Math.min(1, boss.introT * 3, introK));

    // ¡derrotado!
    drawDefeated(ctx, W / 2, 300, killT, killPts);
    if (screenFlash > 0) {
      ctx.fillStyle = `rgba(255,250,235,${screenFlash * 0.85})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
  }

  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    pause(p: boolean) {
      paused = p;
      clock.paused = p;
    },
    skipTo(p) {
      if (p <= clock.phase) return;
      clock.jumpTo(p);
      powerSpawned = [false, p > 2, p > 2]; // el Equipo se entrega igual al entrar a Foundation
    },
    destroy() {
      cancelAnimationFrame(raf);
      unbind();
      dispose();
    },
  };
};

export default createGame;
export { PHASES };
