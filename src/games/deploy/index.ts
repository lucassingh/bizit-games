import Matter from "matter-js";
import type { CreateGame, Expr, GameHooks } from "../types";
import { PHASES, type PhaseIndex } from "@/lib/games";
import { bindGestures, fitCanvas, PhaseClock, Popups, Scorer } from "../shared/engine";
import { drawBGen, makeBlinker } from "../shared/bgenFace";
import { COLORS } from "@/lib/brand";
import { Cable, Coins, Crown, Radio, type IconNode } from "lucide";
import { drawIcon } from "../shared/icons";
import { music, rubber, sfx } from "@/lib/audio";
import { CITY_IMG, drawBackground, drawBands, drawEnemySprite, drawPlaque, drawSlingshot, type EnemyKind } from "./art";
import { drawCaosPod, POD_H, POD_W } from "./boss";
import { drawBossBar, drawDefeated, drawWarning } from "../shared/caos";

/**
 * Juego 2 · Deploy BGen — "Derribá el Caos" (docs/04).
 * Física: Matter.js. Render: Canvas 2D con el estilo plano del kit.
 * 3 torres = Drive / Foundation / Evolution (con el jefe, el Caos Operativo).
 * El jefe es el mismo Caos del juego 3 adaptado a la gomera: al llegar a la
 * tercera torre baja del cielo con la alerta y se apoya arriba de todo; está
 * blindado hasta que caen los Problemones (la barra lo muestra) y es un cuerpo
 * físico más: los golpes y las caídas le bajan vida. Al morir explota en cadena.
 */

const { Engine, Bodies, Body, Composite, Events, Sleeping, Vector } = Matter;

type Kind = "box" | "binder" | "plank" | "cpu" | "clock" | "mail" | "factura" | "excel" | "fantasma" | "reporte" | "boss";
type Agent = "bgen" | "cobranzas" | "voz" | "integrador" | "orquestador";

interface Meta {
  kind: Kind;
  hp: number;
  maxHp: number;
  enemy: boolean;
  w?: number;
  h?: number;
  r?: number;
  shield?: boolean;
  dead?: boolean;
}

const WORLD_W = 1600;
// mundo más bajo (menos cielo vacío): en la TV todo se ve un 28 % más grande
const WORLD_H = 700;
const GROUND = 620;
const SLING = { x: 250, y: GROUND - 180 };
const MAX_PULL = 185;
const POWER = 0.125;
const G_STEP = 0.001 * (1000 / 60) ** 2; // aceleración por paso (gravedad de Matter)

/* ---------- el jefe ---------- */
const BOSS_HP = 16;
/** Segundos que tarda en bajar del cielo hasta la torre (con la alerta); mientras, no se lanza. */
const BOSS_DESCENT = 2.3;
/** Segundos que explota en cadena antes del final. */
const BOSS_DYING = 1.4;
const BOSS_X = 1250;
/** Centro del núcleo apoyado sobre el tablón de arriba de la tercera torre. */
const BOSS_LAND_Y = GROUND - 294 - POD_H / 2;

const AGENTS: Record<Agent, { name: string; color: string; icon?: IconNode; ability: string }> = {
  bgen: { name: "BGen", color: COLORS.niebla, ability: "¡Apuntá bien!" },
  cobranzas: { name: "Agente Cobranzas", color: COLORS.lima, icon: Coins, ability: "en el aire se divide en 3" },
  voz: { name: "Agente Voz", color: COLORS.cian, icon: Radio, ability: "en el aire lanza una onda expansiva" },
  integrador: { name: "Agente Integrador", color: "#5ED58A", icon: Cable, ability: "en el aire se engancha y embiste" },
  orquestador: { name: "BGen Orquestador", color: COLORS.lima, icon: Crown, ability: "en el aire despliega a todo el equipo" },
};

const LEVEL_SHOTS: Agent[][] = [
  ["bgen", "bgen", "bgen"],
  ["cobranzas", "voz", "integrador"],
  ["orquestador", "orquestador", "voz"],
];


const createGame: CreateGame = (host, hooks: GameHooks, opts) => {
  const { canvas, ctx, state, dispose } = fitCanvas(host);
  // más iteraciones y "sueño": las torres quedan quietas hasta que algo las golpea
  const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8, constraintIterations: 4 });
  engine.gravity.y = 1;
  const world = engine.world;
  const scorer = new Scorer(hooks);
  const popups = new Popups();
  const blink = makeBlinker();
  let t = 0;
  let paused = false;
  let level = 0;
  let shotIndex = 0;
  let projectiles: Matter.Body[] = [];
  let minis: Matter.Body[] = [];
  let current: Matter.Body | null = null;
  let aiming: { x: number; y: number } | null = null;
  let abilityUsed = false;
  let lastHitSfx = -1;
  let noShotsFor = 0;
  let lastShieldMsg = -9;
  let settleTimer = 0;
  let levelStartedAt = 0;
  let killed = 0;
  let totalEnemies = 0;
  let expr: Expr = "curioso";
  let ended = false;
  let cable: { from: Matter.Vector; to: Matter.Vector; life: number } | null = null;
  let wave: { x: number; y: number; life: number } | null = null;
  // jefe
  let bossBody: Matter.Body | null = null;
  /** Segundos desde que empezó a bajar (-1: no está bajando). */
  let bossIntro = -1;
  let bossFlash = 0, bossShieldHit = 0, bossMouth = 0, bossTrail = 1;
  let bossExposedAt = -9, lastBossPopup = -9, lastBoomSfx = -9;
  let bossKilled = false;
  /** El Caos explotando en cadena (ya no es un cuerpo físico). */
  let corpse: { x: number; y: number; angle: number; t: number; boomIn: number } | null = null;
  let killT = -1, killPts = 0, screenFlash = 0, shake = 0;
  const particles: { x: number; y: number; vx: number; vy: number; life: number; c: string; r: number; img?: HTMLImageElement; rot?: number; vr?: number }[] = [];

  // sprites de bloques (Kenney Physics Assets, CC0): intacto y rajado por material
  const SPR_NAMES = ["wood-square", "wood-long", "glass-tall", "metal-tall", "explosive", "debris-wood-1", "debris-wood-2", "debris-wood-3", "debris-glass-1", "debris-glass-2", "debris-glass-3"];
  const SPR: Record<string, HTMLImageElement> = {};
  for (const n of SPR_NAMES) {
    for (const suf of n.startsWith("debris") ? [""] : ["", "-x"]) {
      const im = new Image();
      im.src = `/sprites/physics/${n}${suf}.png`;
      SPR[n + suf] = im;
    }
  }
  const BLOCK_SPRITE: Partial<Record<Kind, string>> = { box: "wood-square", plank: "wood-long", binder: "glass-tall", cpu: "metal-tall", clock: "explosive" };
  const debrisFor = (kind: Kind) => (kind === "binder" ? ["debris-glass-1", "debris-glass-2", "debris-glass-3"] : ["debris-wood-1", "debris-wood-2", "debris-wood-3"]);

  const say = (e: Expr, text?: string) => {
    expr = e;
    hooks.bgen(e, text);
  };

  // el cartel "¡El Caos Operativo!" lo reemplazan la alerta y la barra del jefe (como en el juego 3)
  const clockHooks: GameHooks = {
    ...hooks,
    banner: (title, subtitle) => {
      if (title !== PHASES[3].title) hooks.banner(title, subtitle);
    },
  };
  const clock = new PhaseClock(clockHooks, opts.durationSec, undefined, true);

  /* ---------- mundo ---------- */
  const ground = Bodies.rectangle(WORLD_W / 2, GROUND + 60, WORLD_W * 3, 120, { isStatic: true, friction: 1, label: "ground" });
  Composite.add(world, ground);

  const meta = (b: Matter.Body) => (b.plugin as { meta?: Meta }).meta;

  function addBlock(kind: Kind, x: number, y: number, w: number, h: number, hp: number, density = 0.0012) {
    const b = Bodies.rectangle(x, y, w, h, { friction: 0.9, frictionStatic: 1.4, restitution: 0.01, density, slop: 0.02, sleepThreshold: 30 });
    b.plugin = { meta: { kind, hp, maxHp: hp, enemy: false, w, h } satisfies Meta };
    Composite.add(world, b);
    return b;
  }
  function addRound(kind: Kind, x: number, y: number, r: number, hp: number, enemy: boolean, density = 0.001) {
    const b = Bodies.circle(x, y, r, { friction: 0.8, restitution: 0.1, density, frictionAir: 0.004, slop: 0.02, sleepThreshold: 30 });
    b.plugin = { meta: { kind, hp, maxHp: hp, enemy, r, shield: kind === "boss" } satisfies Meta };
    Composite.add(world, b);
    return b;
  }

  function addBoss(x: number, y: number) {
    const b = Bodies.rectangle(x, y, POD_W, POD_H, { chamfer: { radius: 18 }, friction: 0.9, frictionStatic: 1.2, restitution: 0.05, density: 0.0009, slop: 0.02, sleepThreshold: 30 });
    b.plugin = { meta: { kind: "boss", hp: BOSS_HP, maxHp: BOSS_HP, enemy: true, w: POD_W, h: POD_H, shield: true } satisfies Meta };
    Composite.add(world, b);
    bossBody = b;
    return b;
  }

  function buildLevel(i: number) {
    // limpiar lo anterior (menos el piso)
    for (const b of Composite.allBodies(world)) if (b !== ground) Composite.remove(world, b);
    projectiles = [];
    minis = [];
    current = null;
    shotIndex = 0;
    settleTimer = 0;
    levelStartedAt = clock.elapsed;
    const box = (x: number, y: number) => addBlock("box", x, y, 70, 70, 2.6);
    const binder = (x: number, y: number) => addBlock("binder", x, y, 30, 110, 1, 0.0009);
    const plank = (x: number, y: number, w: number) => addBlock("plank", x, y, w, 22, 2.2);
    const cpu = (x: number, y: number) => addBlock("cpu", x, y, 60, 90, 7, 0.004);
    const clk = (x: number, y: number) => addRound("clock", x, y, 26, 0.6, false);
    const enemy = (k: Kind, x: number, y: number) => addRound(k, x, y, 30, 1.6, true);
    if (i === 0) {
      box(1150, GROUND - 35);
      box(1150, GROUND - 105);
      box(1350, GROUND - 35);
      box(1350, GROUND - 105);
      plank(1250, GROUND - 151, 280);
      enemy("mail", 1200, GROUND - 192);
      enemy("fantasma", 1300, GROUND - 192);
      enemy("reporte", 1250, GROUND - 30);
    } else if (i === 1) {
      cpu(1110, GROUND - 45);
      cpu(1390, GROUND - 45);
      binder(1185, GROUND - 55);
      binder(1315, GROUND - 55);
      plank(1250, GROUND - 121, 340);
      box(1180, GROUND - 167);
      box(1320, GROUND - 167);
      clk(1250, GROUND - 158);
      plank(1250, GROUND - 213, 240);
      enemy("factura", 1180, GROUND - 254);
      enemy("excel", 1320, GROUND - 254);
      enemy("mail", 1250, GROUND - 30);
      enemy("fantasma", 1480, GROUND - 30);
    } else {
      cpu(1070, GROUND - 45);
      cpu(1430, GROUND - 45);
      box(1180, GROUND - 35);
      box(1180, GROUND - 105);
      box(1320, GROUND - 35);
      box(1320, GROUND - 105);
      plank(1250, GROUND - 151, 420);
      binder(1110, GROUND - 217);
      binder(1390, GROUND - 217);
      box(1200, GROUND - 197);
      box(1300, GROUND - 197);
      clk(1250, GROUND - 188);
      plank(1250, GROUND - 283, 330);
      // el Caos todavía no está: baja del cielo con la alerta (ver update) y se apoya arriba de todo
      bossIntro = 0;
      bossTrail = 1;
      enemy("excel", 1070, GROUND - 120);
      enemy("factura", 1430, GROUND - 120);
      enemy("reporte", 1500, GROUND - 30);
    }
    loadNext();
  }

  function loadNext() {
    const shots = LEVEL_SHOTS[level];
    if (shotIndex >= shots.length) {
      current = null;
      return;
    }
    const agent = shots[shotIndex];
    hooks.lives(shots.length - shotIndex);
    const b = Bodies.circle(SLING.x, SLING.y, 34, { density: 0.004, restitution: 0.25, friction: 0.6, frictionAir: 0.0012 });
    b.plugin = { agent, launched: false };
    // en la gomera no choca con nada (no empuja al agente que acaba de salir)
    b.isSensor = true;
    Body.setStatic(b, true);
    Composite.add(world, b);
    current = b;
    abilityUsed = false;
    say(agent === "bgen" ? "concentrado" : "curioso", shotIndex === 0 && level > 0 ? `${AGENTS[agent].name}: tocá ${AGENTS[agent].ability}` : undefined);
  }

  /* ---------- daño por choques ---------- */
  Events.on(engine, "collisionStart", (ev) => {
    for (const pair of ev.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      if (a.isSleeping && !b.isStatic) Sleeping.set(a, false);
      if (b.isSleeping && !a.isStatic) Sleeping.set(b, false);
      const rel = Vector.magnitude(Vector.sub(a.velocity, b.velocity));
      if (rel < 2.2) continue;
      const proj = (x: Matter.Body) => !!(x.plugin as { agent?: Agent }).agent || minis.includes(x);
      const base = (rel - 2.2) * 0.42;
      for (const [self, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const m = meta(self);
        if (!m || m.dead) continue;
        const dmg = base * (proj(other) ? 1.7 : 1) * (other === ground ? (m.enemy ? 1.6 : 0.8) : 1);
        if (m.kind === "boss" && m.shield) {
          // el Caos se alimenta de los Problemones: mientras quede alguno, no se lo puede dañar
          if (dmg > 1) bossShieldHit = 1;
          if (dmg > 1 && t - lastShieldMsg > 1.5) {
            lastShieldMsg = t;
            popups.add(self.position.x, self.position.y - 80, "¡Primero los Problemones!", COLORS.cian);
          }
          continue;
        }
        m.hp -= dmg;
        if (m.kind === "boss") hurtBoss(self, dmg);
        if (dmg > 0.6 && t - lastHitSfx > 0.06) {
          lastHitSfx = t;
          sfx(m.kind === "binder" || m.kind === "clock" ? "g.near" : "g.hit", { volume: Math.min(0.9, 0.25 + dmg * 0.15), rate: 0.85 + Math.random() * 0.3 });
        }
        if (m.hp <= 0) destroy(self);
      }
    }
  });

  function burst(x: number, y: number, n: number, colors: string[], debris?: string[]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 7;
      const img = debris && i % 2 === 0 ? SPR[debris[i % debris.length]] : undefined;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, life: 1, c: colors[i % colors.length], r: img ? 14 + Math.random() * 10 : 3 + Math.random() * 5, img, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
  }

  function destroy(b: Matter.Body) {
    const m = meta(b);
    if (!m || m.dead) return;
    m.dead = true;
    Composite.remove(world, b);
    const { x, y } = b.position;
    // lo que estaba apoyado o cerca se despierta: si le sacaron el piso, cae
    for (const o of Composite.allBodies(world)) {
      if (o.isStatic || !o.isSleeping) continue;
      const dx = o.position.x - x, dy = o.position.y - y;
      if (Math.abs(dx) < 260 && Math.abs(dy) < 260) Sleeping.set(o, false);
    }
    if (m.enemy) {
      killed++;
      metric();
      if (m.kind === "boss") {
        // explota en cadena (como en el juego 3); los puntos y el cierre llegan al final (bossDown)
        bossBody = null;
        corpse = { x, y, angle: b.angle, t: 0, boomIn: 0 };
        sfx("g.beam");
        shake = 1;
        say("logro", "¡Se está desarmando!");
        return;
      }
      sfx("g.bell", { volume: 0.6, rate: 1.3 + Math.random() * 0.3 });
      const g = scorer.hit(100, t);
      popups.add(x, y - 40, `+${g}`, COLORS.violeta);
      burst(x, y, 24, ["#bdb3a0", "#d9cbb0", COLORS.cian, COLORS.lima]);
      say("logro", killed % 3 === 0 ? "¡Uno menos!" : undefined);
    } else {
      const pts = m.kind === "cpu" ? 50 : m.kind === "box" || m.kind === "plank" ? 25 : 10;
      scorer.hit(pts, t, false);
      burst(x, y, 12, m.kind === "binder" ? ["#7FB7C9", "#fff"] : ["#C9A77A", "#E6D3B3"], debrisFor(m.kind));
      if (m.kind === "clock") {
        sfx("g.fail", { volume: 0.8, rate: 1.6 });
        explode(x, y, 220, 0.09);
      }
    }
  }

  function explode(x: number, y: number, radius: number, force: number) {
    wave = { x, y, life: 1 };
    for (const b of Composite.allBodies(world)) {
      if (b.isStatic) continue;
      const d = Vector.sub(b.position, { x, y });
      const dist = Vector.magnitude(d);
      if (dist > radius || dist < 1) continue;
      const k = (1 - dist / radius) * force * b.mass;
      Body.applyForce(b, b.position, Vector.mult(Vector.normalise(d), k));
      const m = meta(b);
      if (m) {
        if (m.kind === "boss" && m.shield) {
          bossShieldHit = 1;
          continue;
        }
        const d = (1 - dist / radius) * 2.2;
        m.hp -= d;
        if (m.kind === "boss") hurtBoss(b, d);
        if (m.hp <= 0) destroy(b);
      }
    }
  }

  /** Feedback de cada golpe al Caos: destello, grito y cuánta vida le sacó. */
  function hurtBoss(b: Matter.Body, dmg: number) {
    if (dmg <= 0.05) return;
    bossFlash = Math.min(1, bossFlash + 0.4 + dmg * 0.06);
    bossMouth = 1;
    if (dmg >= 0.8 && t - lastBossPopup > 0.3) {
      lastBossPopup = t;
      popups.add(b.position.x + (Math.random() - 0.5) * 90, b.position.y - 135, `−${Math.max(1, Math.round((dmg / BOSS_HP) * 100))}%`, COLORS.rojo);
      sfx("g.hit", { volume: 0.9, rate: 0.6 });
    }
  }

  /** Terminó de explotar: puntos, cartel y cierre (o, si quedan Problemones, se sigue jugando). */
  function bossDown(c: { x: number; y: number }) {
    bossKilled = true;
    screenFlash = 1;
    shake = 1.2;
    burst(c.x, c.y, 60, [COLORS.naranja, "#ffd27a", "#fff", COLORS.rojo, COLORS.lima]);
    burst(c.x, c.y - 60, 30, ["#D9CBB0", "#EDE6DA", "#BDB3A0"]);
    sfx("g.bell", { volume: 0.9 });
    const g = scorer.hit(1000, t);
    if (enemiesLeft().length > 0) {
      popups.add(c.x, c.y - 60, `+${g}`, COLORS.naranja);
      say("logro", "¡Cayó el Caos! Terminá con los Problemones.");
      return;
    }
    victory(g);
  }

  function victory(pts: number) {
    if (ended) return;
    const bonus = Math.round(clock.left * 25);
    killPts = pts + (bonus > 0 ? scorer.hit(bonus, t, false) : 0);
    killT = 0;
    say("logro", "¡Caos eliminado! Tu equipo ahora se enfoca en lo importante.");
    sfx("g.win");
    window.setTimeout(() => hooks.stage("outro", { title: "¡Caos derrotado!", text: `Eliminaste ${killed} de ${totalEnemies} Problemones y derribaste al Caos Operativo. Esto es lo que BGenAI puede hacer en tu empresa.` }), 2200);
    window.setTimeout(() => hooks.stage(null), 11800);
    finishGame(12);
  }

  function metric() {
    const pct = totalEnemies ? killed / totalEnemies : 0;
    hooks.metric(`${killed}/${totalEnemies}`, pct);
  }

  function enemiesLeft() {
    return Composite.allBodies(world).filter((b) => meta(b)?.enemy && !meta(b)?.dead);
  }

  /* ---------- habilidades ---------- */
  function ability() {
    const p = projectiles[projectiles.length - 1];
    if (!p || abilityUsed || p.speed < 1.5) return;
    sfx("g.power", { volume: 0.7 });
    const agent = (p.plugin as { agent: Agent }).agent;
    abilityUsed = true;
    if (agent === "bgen") {
      hooks.hint("BGen básico no tiene habilidad ¡apuntá bien!");
      return;
    }
    if (agent === "cobranzas") {
      for (const ang of [-0.22, 0.22]) {
        const c = Bodies.circle(p.position.x, p.position.y, 24, { density: 0.004, restitution: 0.2, friction: 0.6 });
        c.plugin = { agent: "cobranzas" };
        Body.setVelocity(c, Vector.rotate(p.velocity, ang));
        Composite.add(world, c);
        projectiles.push(c);
      }
      say("procesando", "¡Proceso en paralelo!");
    } else if (agent === "voz") {
      explode(p.position.x, p.position.y, 300, 0.12);
      say("logro", "¡Onda de voz!");
    } else if (agent === "integrador") {
      const targets = Composite.allBodies(world).filter((b) => meta(b) && !meta(b)!.dead && b.position.x > p.position.x);
      targets.sort((a, b) => Vector.magnitude(Vector.sub(a.position, p.position)) - Vector.magnitude(Vector.sub(b.position, p.position)));
      const tg = targets.find((b) => meta(b)!.enemy) || targets[0];
      if (tg) {
        const dir = Vector.normalise(Vector.sub(tg.position, p.position));
        Body.setVelocity(p, Vector.mult(dir, 30));
        Body.setDensity(p, 0.016);
        cable = { from: { ...p.position }, to: { ...tg.position }, life: 1 };
        say("concentrado", "¡Integración directa!");
      }
    } else if (agent === "orquestador") {
      Body.setVelocity(p, { x: 0, y: 0 });
      const targets = enemiesLeft()
        .sort((a, b) => Vector.magnitude(Vector.sub(a.position, p.position)) - Vector.magnitude(Vector.sub(b.position, p.position)))
        .slice(0, 5);
      const list = targets.length ? targets : [];
      for (let k = 0; k < 5; k++) {
        const tg = list[k % Math.max(1, list.length)];
        const aim = tg ? tg.position : { x: p.position.x + 400, y: p.position.y + (k - 2) * 60 };
        const m = Bodies.circle(p.position.x, p.position.y, 16, { density: 0.006, frictionAir: 0, restitution: 0.1 });
        m.plugin = { mini: true, color: [COLORS.lima, COLORS.cian, "#5ED58A", COLORS.lima, COLORS.cian][k] };
        const dir = Vector.normalise(Vector.sub(aim, p.position));
        Body.setVelocity(m, Vector.mult(Vector.rotate(dir, (k - 2) * 0.03), 26));
        Composite.add(world, m);
        minis.push(m);
      }
      say("logro", "¡Orquestando a todo el equipo!");
    }
  }

  /* ---------- input ---------- */
  const toWorld = (x: number, y: number) => {
    const v = view();
    return { x: (x - v.ox) / v.s, y: (y - v.oy) / v.s };
  };

  const unbind = bindGestures(canvas, {
    onDragStart(x, y) {
      if (paused || ended) return false;
      const w = toWorld(x, y);
      // si hay un agente volando, el toque es habilidad
      const flying = projectiles[projectiles.length - 1];
      if (flying && !abilityUsed && flying.speed > 1.5 && flying.position.x < WORLD_W + 200) {
        ability();
        return false;
      }
      if (!current || w.x > WORLD_W * 0.55 || bossIntro >= 0) return false;
      aiming = { x: SLING.x, y: SLING.y };
      say("concentrado");
      rubber.start();
      music.duck(0.45, 0.3);
      return true;
    },
    onDragMove(x, y) {
      if (!aiming || !current) return;
      const w = toWorld(x, y);
      let d = Vector.sub(w, SLING);
      if (Vector.magnitude(d) > MAX_PULL) d = Vector.mult(Vector.normalise(d), MAX_PULL);
      aiming = Vector.add(SLING, d);
      Body.setPosition(current, aiming);
      rubber.set(Vector.magnitude(d) / MAX_PULL);
    },
    onDragEnd() {
      if (!aiming || !current) return;
      const pull = Vector.sub(SLING, aiming);
      aiming = null;
      music.duck(1, 1.5);
      if (Vector.magnitude(pull) < 25) {
        Body.setPosition(current, SLING);
        rubber.release(0);
        return;
      }
      rubber.release(Vector.magnitude(pull) / MAX_PULL);
      sfx("g.jump", { volume: 0.5, rate: 0.9 });
      Body.setStatic(current, false);
      Sleeping.set(current, false);
      current.isSensor = false;
      Body.setVelocity(current, Vector.mult(pull, POWER));
      (current.plugin as { launched: boolean }).launched = true;
      projectiles.push(current);
      current = null;
      shotIndex++;
      say("logro");
      const lvl = level;
      window.setTimeout(() => {
        if (!ended && level === lvl && !current) loadNext();
      }, 1600);
    },
    onTap() {
      ability();
    },
  });

  /* ---------- flujo de niveles ---------- */
  function gameOver() {
    if (ended) return;
    ended = true;
    paused = true;
    clock.paused = true;
    say("mareado", "Me quedé sin agentes… ¡y el Caos sigue ahí!");
    const pct = totalEnemies ? killed / totalEnemies : 0;
    hooks.gameOver({ score: scorer.score, metricValue: `${killed}/${totalEnemies}`, metricPct: pct });
  }

  function nextLevel(reason: "clear" | "time" | "shots") {
    if (level >= 2) {
      // el último nivel termina cuando cae el Caos (ver bossDown); si cayó antes que el último Problemón, acá
      if (!ended) {
        if (bossKilled) victory(0);
        else finishGame(1.2);
      }
      return;
    }
    if (reason === "clear") {
      const left = LEVEL_SHOTS[level].length - shotIndex + (current ? 0 : 0);
      if (left > 0) {
        const bonus = scorer.hit(left * 300, t, false);
        popups.add(WORLD_W / 2, 260, `+${bonus} tiros sobrantes`, COLORS.naranja);
      }
    }
    level++;
    sfx("g.phase");
    clock.setPhase(level as PhaseIndex);
    buildLevel(level);
  }

  function finishGame(delay: number) {
    if (ended) return;
    ended = true;
    clock.finish();
    const pct = totalEnemies ? killed / totalEnemies : 0;
    window.setTimeout(() => hooks.end({ score: scorer.score, metricValue: `${killed}/${totalEnemies}`, metricPct: pct }), delay * 1000);
  }

  // los Problemones de las 3 torres cuentan para el total desde el inicio
  totalEnemies = 3 + 4 + 4;
  buildLevel(0);
  metric();
  say("curioso", "¡A derribar la torre! Arrastrá hacia atrás y soltá.");

  /* ---------- simulación ---------- */
  const LEVEL_END = [25, 55, opts.durationSec];
  function update(dt: number) {
    if (!clock.step(dt)) {
      if (ended) afterEnd(dt);
      return;
    }
    t += dt;
    // el Caos baja del cielo con la alerta y se apoya arriba de la torre
    if (bossIntro >= 0) {
      if (bossIntro === 0) {
        sfx("g.phase", { rate: 0.7 });
        music.duck(0.4, 0.6);
        say("concentrado", "¡Cuidado! Se viene el Caos Operativo…");
      }
      bossIntro += dt;
      shake = Math.max(shake, 0.15);
      if (bossIntro >= BOSS_DESCENT) {
        bossIntro = -1;
        addBoss(BOSS_X, BOSS_LAND_Y);
        shake = 0.9;
        sfx("g.hit", { volume: 1, rate: 0.45 });
        sfx("g.bell", { volume: 0.5, rate: 0.6 });
        burst(BOSS_X, BOSS_LAND_Y + POD_H / 2, 26, ["#d9cbb0", "#bdb3a0", "#efe9e2"]);
        music.duck(1, 0.8);
        say("concentrado", "¡Está blindado! Primero eliminá a los Problemones.");
      }
    }
    if (corpse) {
      corpse.t += dt;
      shake = Math.max(shake, 0.5);
      corpse.boomIn -= dt;
      if (corpse.boomIn <= 0) {
        corpse.boomIn = 0.09;
        burst(corpse.x + (Math.random() - 0.5) * POD_W, corpse.y + (Math.random() - 0.5) * POD_H, 10, [COLORS.naranja, "#ffd27a", "#fff", COLORS.rojo]);
        if (t - lastBoomSfx > 0.18) {
          lastBoomSfx = t;
          sfx("g.hit", { volume: 0.6, rate: 0.6 + Math.random() * 0.5 });
        }
      }
      if (corpse.t >= BOSS_DYING) {
        const c = corpse;
        corpse = null;
        bossDown(c);
      }
    }
    Engine.update(engine, 1000 / 60);
    // los mini-agentes vuelan recto (anulan la gravedad)
    for (const m of minis) Body.applyForce(m, m.position, { x: 0, y: -m.mass * engine.gravity.y * 0.001 });

    // fuera del mundo
    for (const b of Composite.allBodies(world)) {
      if (b === ground) continue;
      if (b.position.y > WORLD_H + 200 || b.position.x < -300 || b.position.x > WORLD_W + 400) {
        const m = meta(b);
        if (m && !m.dead) {
          if (m.enemy) destroy(b);
          else Composite.remove(world, b);
        } else Composite.remove(world, b);
      }
    }
    // Problemones que caen al piso con fuerza o quedan muy inclinados ya los cuenta el daño por choque

    const left = enemiesLeft();
    const bossOnly = level === 2 && left.length === 1 && meta(left[0])?.kind === "boss";
    if (bossOnly) {
      const bm = meta(left[0])!;
      if (bm.shield) {
        bm.shield = false;
        bossExposedAt = t;
        burst(left[0].position.x, left[0].position.y - 8, 30, [COLORS.cian, "#bff3f5", "#fff"]);
        sfx("g.power2");
        popups.add(left[0].position.x, left[0].position.y - 90, "¡EL CAOS QUEDÓ EXPUESTO!", COLORS.naranja);
        say("logro", "¡Ahora sí! Tirale con todo al Caos.");
        Sleeping.set(left[0], false);
      }
    }
    if (level === 2 && clock.phase === 2 && (bossOnly || clock.elapsed >= (80 / 90) * opts.durationSec)) clock.setPhase(3);

    if (!ended) {
      if (corpse) {
        // el Caos está explotando: se espera el final de la secuencia
      } else if (left.length === 0) {
        settleTimer += dt;
        if (settleTimer > 0.8) nextLevel("clear");
      } else if (!current && shotIndex >= LEVEL_SHOTS[level].length) {
        // sin agentes para lanzar y todavía quedan Problemones: se acabaron las vidas
        const alive = new Set(Composite.allBodies(world));
        const moving = projectiles.some((p) => alive.has(p) && p.speed > 0.6) || minis.some((p) => alive.has(p) && p.speed > 0.6);
        settleTimer += moving ? 0 : dt;
        noShotsFor += dt;
        if (settleTimer > 1.6 || noShotsFor > 6) gameOver();
      } else {
        settleTimer = 0;
        noShotsFor = 0;
      }
    }
    if (clock.done && !ended) {
      // se terminó el tiempo justo mientras el Caos explotaba: cuenta como derrotado
      if (corpse) {
        const c = corpse;
        corpse = null;
        bossDown(c);
      }
      if (!ended) finishGame(0.4);
    }
    void levelStartedAt;
    void LEVEL_END;

    stepFx(dt);
  }

  /** Efectos que siguen aunque el juego haya terminado (partículas, destellos, cartel final). */
  function stepFx(dt: number) {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.rot = (p.rot || 0) + (p.vr || 0);
      p.life -= dt * 1.2;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    if (cable) cable.life -= dt * 2;
    if (wave) wave.life -= dt * 2;
    bossFlash = Math.max(0, bossFlash - dt * 4);
    bossShieldHit = Math.max(0, bossShieldHit - dt * 3);
    bossMouth = Math.max(0, bossMouth - dt * 2.2);
    const bm = bossBody && meta(bossBody);
    if (bm) bossTrail += (Math.max(0, bm.hp / bm.maxHp) - bossTrail) * Math.min(1, dt * 2.5);
    screenFlash = Math.max(0, screenFlash - dt * 1.8);
    if (killT >= 0) killT += dt;
    shake *= Math.exp(-dt * 5);
  }

  function afterEnd(dt: number) {
    if (paused) return;
    t += dt;
    stepFx(dt);
  }

  /* ---------- dibujo ---------- */
  function view() {
    const s = Math.min(state.w / WORLD_W, state.h / WORLD_H);
    return { s, ox: (state.w - WORLD_W * s) / 2, oy: state.h - WORLD_H * s };
  }

  /** Cómo se ve el Caos ahora: mira al agente que vuela (o a la gomera). */
  function podLook(x: number, hp: number, shield: number, thrust = 0, dying = -1) {
    const fly = projectiles[projectiles.length - 1];
    const tx = fly && fly.speed > 1.5 ? fly.position.x : SLING.x;
    return { t, hp, flash: bossFlash, rage: hp < 0.35, gaze: Math.max(-1, Math.min(1, (tx - x) / 600)), mouth: bossMouth, shield, shieldHit: bossShieldHit, thrust, dying };
  }

  function drawEnemy(b: Matter.Body, m: Meta) {
    if (m.kind === "boss") {
      const shield = m.shield ? 1 : Math.max(0, 1 - (t - bossExposedAt) / 0.5);
      drawCaosPod(ctx, b.position.x, b.position.y, b.angle, podLook(b.position.x, Math.max(0, m.hp / m.maxHp), shield));
      return;
    }
    const r = m.r!;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    drawEnemySprite(ctx, m.kind as EnemyKind, r, t, b.id * 0.37);
    ctx.restore();
    // vida
    if (m.hp < m.maxHp && m.hp > 0) {
      const w = r * 1.8;
      ctx.fillStyle = COLORS.carbon;
      ctx.fillRect(b.position.x - w / 2 - 1, b.position.y - r - 24, w + 2, 8);
      ctx.fillStyle = COLORS.naranja;
      ctx.fillRect(b.position.x - w / 2, b.position.y - r - 23, (w * m.hp) / m.maxHp, 6);
    }
  }

  function drawBlock(b: Matter.Body, m: Meta) {
    const dmg = 1 - m.hp / m.maxHp;
    const name = BLOCK_SPRITE[m.kind];
    const img = name ? SPR[name + (dmg > 0.45 ? "-x" : "")] : undefined;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    if (m.kind === "clock") {
      const d = m.r! * 2.1;
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -d / 2, -d / 2, d, d);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, m.r!, 0, Math.PI * 2);
        ctx.fillStyle = "#E3B23C";
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    const w = m.w!, h = m.h!;
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -w / 2, -h / 2, w, h);
    else {
      ctx.fillStyle = m.kind === "binder" ? "#7FB7C9" : m.kind === "cpu" ? "#9AA3AD" : "#C9A77A";
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  function drawAgent(b: Matter.Body, agent: Agent, size = 68) {
    const a = AGENTS[agent];
    ctx.save();
    if (agent !== "bgen") {
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, size * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    ctx.restore();
    const fly = b.speed > 2;
    drawBGen(ctx, b.position.x, b.position.y, size, { expr: fly ? "logro" : expr === "mareado" ? "mareado" : "concentrado", t, blink: blink(t), gx: fly ? 5 : 3, gy: 0, talk: 0 }, agent === "orquestador" ? 1 : 0);
    if (a.icon) {
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.arc(b.position.x + size * 0.42, b.position.y - size * 0.42, 15, 0, Math.PI * 2);
      ctx.fill();
      drawIcon(ctx, a.icon, b.position.x + size * 0.42, b.position.y - size * 0.42, 18, COLORS.negro, 2.4);
    }
  }

  let bg: HTMLCanvasElement | null = null;
  let bgKey = "";
  function background(v: ReturnType<typeof view>) {
    const key = `${state.w}x${state.h}@${state.dpr}:${CITY_IMG?.complete && CITY_IMG.naturalWidth ? 1 : 0}`;
    if (bg && bgKey === key) return bg;
    bgKey = key;
    bg = document.createElement("canvas");
    bg.width = Math.round(state.w * state.dpr);
    bg.height = Math.round(state.h * state.dpr);
    const g = bg.getContext("2d")!;
    g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    // cielo a toda la pantalla y patio de la compañía en coordenadas del mundo
    g.fillStyle = "#BFE0F3";
    g.fillRect(0, 0, state.w, state.h);
    g.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * v.ox, state.dpr * v.oy);
    drawBackground(g, WORLD_W, WORLD_H, GROUND);
    return bg;
  }

  function draw() {
    const v = view();
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    // fondo estático (cielo, skyline de la compañía y piso) cacheado en un canvas aparte
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background(v), 0, 0);
    const amp = opts.reducedMotion ? 0.3 : 1;
    const shx = shake > 0.01 ? (Math.random() - 0.5) * 14 * shake * amp : 0;
    const shy = shake > 0.01 ? (Math.random() - 0.5) * 10 * shake * amp : 0;
    ctx.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * (v.ox + shx * v.s), state.dpr * (v.oy + shy * v.s));

    // gomera (parte de atrás; la horquilla delantera y la banda delantera van sobre el proyectil)
    drawSlingshot(ctx, SLING.x, SLING.y, GROUND, "back");
    drawSlingshot(ctx, SLING.x, SLING.y, GROUND, "front");
    if (current) {
      drawBands(ctx, SLING.x, SLING.y, current.position.x, current.position.y, "back");
      drawBands(ctx, SLING.x, SLING.y, current.position.x, current.position.y, "pouch");
    }

    // trayectoria
    if (current) {
      const p = current.position;
      if (aiming) {
        const vel = Vector.mult(Vector.sub(SLING, aiming), POWER);
        let x = p.x, y = p.y, vx = vel.x, vy = vel.y;
        ctx.fillStyle = "rgba(102,45,145,.55)";
        for (let i = 0; i < 46; i++) {
          x += vx;
          y += vy;
          vy += G_STEP;
          vx *= 0.995;
          vy *= 0.995;
          if (i % 3 === 0) {
            ctx.beginPath();
            ctx.arc(x, y, 5 - i * 0.07, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // cuerpos
    for (const b of Composite.allBodies(world)) {
      if (b === ground) continue;
      const m = meta(b);
      if (m) {
        if (m.enemy) drawEnemy(b, m);
        else drawBlock(b, m);
        continue;
      }
      const ag = (b.plugin as { agent?: Agent }).agent;
      if (ag) drawAgent(b, ag, ag === "cobranzas" && b.circleRadius! < 30 ? 50 : 68);
      else if ((b.plugin as { mini?: boolean }).mini) {
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, 16, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.bgenBody;
        ctx.fill();
        ctx.strokeStyle = (b.plugin as { color: string }).color;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }

    // el Caos bajando del cielo (todavía no es un cuerpo) o explotando
    if (bossIntro >= 0) {
      const k = Math.min(1, bossIntro / BOSS_DESCENT);
      const e = 1 - Math.pow(1 - k, 3);
      const y = -260 + (BOSS_LAND_Y + 260) * e;
      drawCaosPod(ctx, BOSS_X, y, Math.sin(bossIntro * 2.4) * 0.05 * (1 - k), podLook(BOSS_X, 1, 1, 1 - k * 0.6));
    }
    if (corpse) drawCaosPod(ctx, corpse.x, corpse.y, corpse.angle, podLook(corpse.x, 0, 0, 0, corpse.t / BOSS_DYING));

    // efectos
    if (cable && cable.life > 0) {
      ctx.strokeStyle = `rgba(10,182,188,${cable.life})`;
      ctx.lineWidth = 5;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(cable.from.x, cable.from.y);
      ctx.lineTo(cable.to.x, cable.to.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (wave && wave.life > 0) {
      ctx.strokeStyle = `rgba(10,182,188,${wave.life})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, (1 - wave.life) * 300, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.img && p.img.complete && p.img.naturalWidth) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.drawImage(p.img, -p.r / 2, -p.r / 2, p.r, p.r);
        ctx.restore();
      } else {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, p.r, p.r * 0.7);
      }
    }
    ctx.globalAlpha = 1;

    // fila de agentes que quedan
    const shots = LEVEL_SHOTS[Math.min(level, 2)];
    const queue = shots.slice(shotIndex + (current ? 1 : 0));
    if (queue.length) {
      // banco de espera: placa clara con borde oscuro detrás de los agentes
      const bw = queue.length * 66 + 24, bx = SLING.x - 110 - (queue.length - 1) * 64 - 33 - 12;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.strokeStyle = COLORS.carbon;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(bx, GROUND - 76, bw, 70, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.naranja;
      ctx.fillRect(bx + 10, GROUND - 76, 40, 4);
      ctx.fillStyle = COLORS.carbon;
      ctx.font = '800 9px Inter, Arial';
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("EN ESPERA", bx + 10, GROUND - 64);
    }
    queue.forEach((ag, i) => {
      const x = SLING.x - 110 - i * 64, y = GROUND - 36;
      drawBGen(ctx, x, y, 54, { expr: "reposo", t, blink: blink(t + i), gx: 4, gy: 0, talk: 0 }, ag === "orquestador" ? 1 : 0);
      const ic = AGENTS[ag].icon;
      if (ic) {
        ctx.fillStyle = AGENTS[ag].color;
        ctx.beginPath();
        ctx.arc(x + 20, y - 20, 11, 0, Math.PI * 2);
        ctx.fill();
        drawIcon(ctx, ic, x + 20, y - 20, 13, COLORS.negro, 2.6);
      }
    });
    // banda delantera (fina, sobre el proyectil; no tapa la cara)
    if (current && aiming) drawBands(ctx, SLING.x, SLING.y, current.position.x, current.position.y, "front");
    if (current && !aiming) {
      const ag = (current.plugin as { agent: Agent }).agent;
      drawPlaque(ctx, SLING.x, SLING.y - 120, AGENTS[ag].name, ag === "bgen" ? "arrastrá hacia atrás y soltá" : `tocá ${AGENTS[ag].ability}`);
    }
    popups.draw(ctx, 1 / 60, 1.2);
    // la interfaz del jefe va en coordenadas de pantalla: el mundo se apoya abajo y arriba sobra cielo
    ctx.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * (v.ox + shx * v.s), state.dpr * shy * v.s);
    drawBossUi(state.h / v.s);
  }

  /** Barra de vida (la misma del juego 3), alerta mientras baja, cartel final y destello. VH: alto visible. */
  function drawBossUi(VH: number) {
    if (level === 2 && (bossIntro >= 0 || bossBody) && killT < 0) {
      const intro = bossIntro >= 0 ? bossIntro : BOSS_DESCENT;
      const show = Math.max(0, Math.min(1, (intro - 0.5) / 0.5));
      const m = bossBody && meta(bossBody);
      const hp = bossIntro >= 0 ? Math.max(0, Math.min(1, (intro - 0.9) / 1.1)) : m ? Math.max(0, m.hp / m.maxHp) : 0;
      const shielded = bossIntro >= 0 || !!m?.shield;
      const n = enemiesLeft().filter((b) => meta(b)?.kind !== "boss").length;
      const state = shielded
        ? { shielded: true, tag: "PROTEGIDO", tagColor: "#7fe3e7", caption: bossIntro >= 0 ? undefined : `Eliminá ${n === 1 ? "el último Problemón" : `los ${n} Problemones`} para dañarlo` }
        : t - bossExposedAt < 2.5
          ? { tag: "¡EXPUESTO!", tagColor: Math.sin(t * 14) > 0 ? "#ffb020" : "#fff", caption: "¡Tirale con todo!" }
          : {};
      drawBossBar(ctx, 386, 26, 520, hp, bossIntro >= 0 ? hp : bossTrail, t, show, !shielded && hp < 0.35, state);
    }
    if (bossIntro >= 0) {
      const k = Math.min(1, bossIntro * 3, (BOSS_DESCENT + 0.3 - bossIntro) * 3);
      const vg = ctx.createRadialGradient(WORLD_W / 2, VH / 2, 240, WORLD_W / 2, VH / 2, 900);
      vg.addColorStop(0, "rgba(150,20,30,0)");
      vg.addColorStop(1, `rgba(150,20,30,${0.3 * k * (0.75 + 0.25 * Math.sin(t * 6))})`);
      ctx.fillStyle = vg;
      ctx.fillRect(-20, -20, WORLD_W + 40, VH + 40);
      drawWarning(ctx, WORLD_W, VH * 0.42, t, k);
    }
    drawDefeated(ctx, WORLD_W / 2, VH * 0.34, killT, killPts);
    if (screenFlash > 0) {
      ctx.fillStyle = `rgba(255,250,235,${screenFlash * 0.85})`;
      ctx.fillRect(-20, -20, WORLD_W + 40, VH + 40);
    }
  }

  // depuración: /?debug expone el estado de la física en window.__deploy
  if (typeof location !== "undefined" && location.search.includes("debug")) {
    (window as unknown as { __deploy: unknown }).__deploy = { get projectiles() { return projectiles.map((b) => ({ x: b.position.x, y: b.position.y, vx: b.velocity.x, vy: b.velocity.y, static: b.isStatic })); }, get current() { return current && { x: current.position.x, y: current.position.y }; } };
  }

  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
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
    /** Modo desarrollo: salta a la torre p (el Caos es la tercera: 2 y 3 llevan ahí). */
    skipTo(p) {
      const target = Math.min(2, p) as PhaseIndex;
      if (ended || target <= level) return;
      clock.jumpTo(target);
      level = target;
      buildLevel(level);
    },
    destroy() {
      cancelAnimationFrame(raf);
      unbind();
      Events.off(engine, "collisionStart");
      Engine.clear(engine);
      dispose();
    },
  };
};

export default createGame;
