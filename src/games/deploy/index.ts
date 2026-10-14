import Matter from "matter-js";
import type { CreateGame, Expr, GameHooks } from "../types";
import type { PhaseIndex } from "@/lib/games";
import { bindGestures, fitCanvas, PhaseClock, Popups, Scorer } from "../shared/engine";
import { drawBGen, makeBlinker } from "../shared/bgenFace";
import { COLORS } from "@/lib/brand";

/**
 * Juego 2 · Deploy BGen — "Derribá el Caos" (docs/04).
 * Física: Matter.js. Render: Canvas 2D con el estilo plano del kit.
 * 3 torres = Drive / Foundation / Evolution (con el jefe, el Caos Operativo).
 */

const { Engine, Bodies, Body, Composite, Events, Vector } = Matter;

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
const WORLD_H = 900;
const GROUND = 820;
const SLING = { x: 250, y: 640 };
const MAX_PULL = 170;
const POWER = 0.12;
const G_STEP = 0.001 * (1000 / 60) ** 2; // aceleración por paso (gravedad de Matter)

const AGENTS: Record<Agent, { name: string; color: string; icon: string; ability: string }> = {
  bgen: { name: "BGen", color: COLORS.niebla, icon: "", ability: "¡Apuntá bien!" },
  cobranzas: { name: "Agente Cobranzas", color: COLORS.lima, icon: "$", ability: "Tocá: se divide en 3" },
  voz: { name: "Agente Voz", color: COLORS.cian, icon: "◉", ability: "Tocá: onda expansiva" },
  integrador: { name: "Agente Integrador", color: "#5ED58A", icon: "⚯", ability: "Tocá: se engancha y embiste" },
  orquestador: { name: "BGen Orquestador", color: COLORS.lima, icon: "★", ability: "Tocá: despliega a todo el equipo" },
};

const LEVEL_SHOTS: Agent[][] = [
  ["bgen", "bgen", "bgen"],
  ["cobranzas", "voz", "integrador"],
  ["orquestador", "orquestador", "voz"],
];

const ENEMY_COLORS: Record<string, { fill: string; label: string }> = {
  mail: { fill: "#D9CBB0", label: "MAIL" },
  factura: { fill: "#E3C85A", label: "FACT." },
  excel: { fill: "#5E7F5A", label: "XLS" },
  fantasma: { fill: "#F3F1EE", label: "LEAD" },
  reporte: { fill: "#C8C2B8", label: "REP." },
  boss: { fill: "#8d8d93", label: "CAOS" },
};

const createGame: CreateGame = (host, hooks: GameHooks, opts) => {
  const { canvas, ctx, state, dispose } = fitCanvas(host);
  const engine = Engine.create({ enableSleeping: false });
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
  let settleTimer = 0;
  let levelStartedAt = 0;
  let killed = 0;
  let totalEnemies = 0;
  let expr: Expr = "curioso";
  let ended = false;
  let cable: { from: Matter.Vector; to: Matter.Vector; life: number } | null = null;
  let wave: { x: number; y: number; life: number } | null = null;
  const particles: { x: number; y: number; vx: number; vy: number; life: number; c: string; r: number }[] = [];

  const say = (e: Expr, text?: string) => {
    expr = e;
    hooks.bgen(e, text);
  };

  const clock = new PhaseClock(hooks, opts.durationSec, undefined, true);

  /* ---------- mundo ---------- */
  const ground = Bodies.rectangle(WORLD_W / 2, GROUND + 60, WORLD_W * 3, 120, { isStatic: true, friction: 1, label: "ground" });
  Composite.add(world, ground);

  const meta = (b: Matter.Body) => (b.plugin as { meta?: Meta }).meta;

  function addBlock(kind: Kind, x: number, y: number, w: number, h: number, hp: number, density = 0.0012) {
    const b = Bodies.rectangle(x, y, w, h, { friction: 0.9, frictionStatic: 1.2, restitution: 0.02, density, chamfer: { radius: 4 } });
    b.plugin = { meta: { kind, hp, maxHp: hp, enemy: false, w, h } satisfies Meta };
    Composite.add(world, b);
    return b;
  }
  function addRound(kind: Kind, x: number, y: number, r: number, hp: number, enemy: boolean, density = 0.001) {
    const b = Bodies.circle(x, y, r, { friction: 0.8, restitution: 0.1, density, frictionAir: 0.004 });
    b.plugin = { meta: { kind, hp, maxHp: hp, enemy, r, shield: kind === "boss" } satisfies Meta };
    Composite.add(world, b);
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
      addRound("boss", 1250, GROUND - 350, 56, 10, true, 0.0016);
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
    const b = Bodies.circle(SLING.x, SLING.y, 34, { density: 0.004, restitution: 0.25, friction: 0.6, frictionAir: 0.005 });
    b.plugin = { agent, launched: false };
    // en la gomera no choca con nada (no empuja al agente que acaba de salir)
    b.isSensor = true;
    Body.setStatic(b, true);
    Composite.add(world, b);
    current = b;
    abilityUsed = false;
    say(agent === "bgen" ? "concentrado" : "curioso", shotIndex === 0 && level > 0 ? `${AGENTS[agent].name}: ${AGENTS[agent].ability}` : undefined);
  }

  /* ---------- daño por choques ---------- */
  Events.on(engine, "collisionStart", (ev) => {
    for (const pair of ev.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
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
        let dmg = base * (proj(other) ? 1.7 : 1) * (other === ground ? 0.8 : 1);
        if (m.kind === "boss" && m.shield) {
          if (minis.includes(other) || (other.plugin as { agent?: Agent }).agent === "orquestador") {
            m.shield = false;
            popups.add(self.position.x, self.position.y - 80, "¡ESCUDO ROTO!", COLORS.cian);
          } else dmg *= 0.25;
        }
        m.hp -= dmg;
        if (m.hp <= 0) destroy(self);
      }
    }
  });

  function burst(x: number, y: number, n: number, colors: string[]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 7;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, life: 1, c: colors[i % colors.length], r: 3 + Math.random() * 5 });
    }
  }

  function destroy(b: Matter.Body) {
    const m = meta(b);
    if (!m || m.dead) return;
    m.dead = true;
    Composite.remove(world, b);
    const { x, y } = b.position;
    if (m.enemy) {
      killed++;
      const pts = m.kind === "boss" ? 1000 : 100;
      const g = scorer.hit(pts, t);
      popups.add(x, y - 40, `+${g}`, m.kind === "boss" ? COLORS.naranja : COLORS.violeta);
      burst(x, y, m.kind === "boss" ? 70 : 24, ["#bdb3a0", "#d9cbb0", COLORS.cian, COLORS.lima]);
      say("logro", m.kind === "boss" ? "¡Caos eliminado! Tu equipo ahora se enfoca en lo importante." : killed % 3 === 0 ? "¡Uno menos!" : undefined);
      metric();
      if (m.kind === "boss") {
        // fin: bonus por tiempo restante
        const bonus = Math.round(clock.left * 25);
        if (bonus > 0) {
          scorer.hit(bonus, t, false);
          popups.add(WORLD_W / 2, 300, `+${bonus} por tiempo`, COLORS.naranja);
        }
        finishGame(1.6);
      }
    } else {
      const pts = m.kind === "cpu" ? 50 : m.kind === "box" || m.kind === "plank" ? 25 : 10;
      scorer.hit(pts, t, false);
      burst(x, y, 10, m.kind === "binder" ? ["#7FB7C9", "#fff"] : ["#C9A77A", "#E6D3B3"]);
      if (m.kind === "clock") explode(x, y, 220, 0.09);
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
        m.hp -= (1 - dist / radius) * 2.2 * (m.kind === "boss" && m.shield ? 0.3 : 1);
        if (m.hp <= 0) destroy(b);
      }
    }
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
      if (!current || w.x > WORLD_W * 0.55) return false;
      aiming = { x: SLING.x, y: SLING.y };
      say("concentrado");
      return true;
    },
    onDragMove(x, y) {
      if (!aiming || !current) return;
      const w = toWorld(x, y);
      let d = Vector.sub(w, SLING);
      if (Vector.magnitude(d) > MAX_PULL) d = Vector.mult(Vector.normalise(d), MAX_PULL);
      aiming = Vector.add(SLING, d);
      Body.setPosition(current, aiming);
    },
    onDragEnd() {
      if (!aiming || !current) return;
      const pull = Vector.sub(SLING, aiming);
      aiming = null;
      if (Vector.magnitude(pull) < 25) {
        Body.setPosition(current, SLING);
        return;
      }
      Body.setStatic(current, false);
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
  function nextLevel(reason: "clear" | "time" | "shots") {
    if (level >= 2) {
      finishGame(1.2);
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
  say("curioso", "¡Hora de hacer un deploy! Arrastrá hacia atrás y soltá.");

  /* ---------- simulación ---------- */
  const LEVEL_END = [25, 55, opts.durationSec];
  function update(dt: number) {
    if (!clock.step(dt)) return;
    t += dt;
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
    if (level === 2 && clock.phase === 2 && (bossOnly || clock.elapsed >= (80 / 90) * opts.durationSec)) clock.setPhase(3);

    if (!ended) {
      if (left.length === 0) {
        settleTimer += dt;
        if (settleTimer > 0.8) nextLevel("clear");
      } else if (!current && shotIndex >= LEVEL_SHOTS[level].length) {
        // sin tiros: esperar a que se acomode todo
        const moving = projectiles.some((p) => p.speed > 0.6) || minis.some((p) => p.speed > 0.6);
        settleTimer += moving ? 0 : dt;
        if (settleTimer > 1.4) nextLevel("shots");
      } else settleTimer = 0;
      if (clock.elapsed >= LEVEL_END[level]) nextLevel("time");
    }
    if (clock.done && !ended) finishGame(0.4);
    void levelStartedAt;

    // partículas
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.life -= dt * 1.2;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    if (cable) cable.life -= dt * 2;
    if (wave) wave.life -= dt * 2;
  }

  /* ---------- dibujo ---------- */
  function view() {
    const s = Math.min(state.w / WORLD_W, state.h / WORLD_H);
    return { s, ox: (state.w - WORLD_W * s) / 2, oy: state.h - WORLD_H * s };
  }

  function drawEnemy(b: Matter.Body, m: Meta) {
    const r = m.r!;
    const c = ENEMY_COLORS[m.kind];
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    if (m.kind === "boss") {
      // torbellino de papeles
      for (let k = 0; k < 14; k++) {
        const a = t * 3 + k;
        ctx.fillStyle = k % 2 ? "#d9cbb0" : "#bdb3a0";
        ctx.save();
        ctx.rotate(a);
        ctx.fillRect(r * 0.9, -4, 16, 10);
        ctx.restore();
      }
      if (m.shield) {
        ctx.beginPath();
        ctx.arc(0, 0, r + 14 + Math.sin(t * 6) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(10,182,188,.55)";
        ctx.lineWidth = 6;
        ctx.setLineDash([10, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.rotate(b.angle);
    ctx.beginPath();
    if (m.kind === "fantasma") {
      ctx.moveTo(-r, 4);
      ctx.arc(0, 0, r, Math.PI, 0);
      ctx.lineTo(r, r);
      for (let k = 0; k < 4; k++) ctx.lineTo(r - (k + 0.5) * (r / 2), r - (k % 2 ? 0 : 8));
      ctx.closePath();
    } else if (m.kind === "mail" || m.kind === "factura" || m.kind === "excel" || m.kind === "reporte") {
      ctx.roundRect(-r, -r * 0.8, r * 2, r * 1.6, 8);
    } else ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(33,37,41,.55)";
    ctx.stroke();
    if (m.kind === "mail") {
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.8);
      ctx.lineTo(0, 0);
      ctx.lineTo(r, -r * 0.8);
      ctx.stroke();
    }
    if (m.kind === "excel") {
      ctx.strokeStyle = "rgba(255,255,255,.4)";
      ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(k * r * 0.5, -r * 0.8);
        ctx.lineTo(k * r * 0.5, r * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r, k * r * 0.4);
        ctx.lineTo(r, k * r * 0.4);
        ctx.stroke();
      }
    }
    // cara enojada
    const er = m.kind === "boss" ? 9 : 5;
    const ey = m.kind === "mail" ? 6 : -4;
    ctx.fillStyle = "#fff";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * r * 0.33, ey, er + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.carbon;
      ctx.beginPath();
      ctx.arc(sx * r * 0.33 + Math.sin(t * 2) * 1.5, ey + 1, er * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
    }
    ctx.strokeStyle = COLORS.carbon;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, ey - er - 5);
    ctx.lineTo(-r * 0.12, ey - er);
    ctx.moveTo(r * 0.55, ey - er - 5);
    ctx.lineTo(r * 0.12, ey - er);
    ctx.stroke();
    ctx.fillStyle = "rgba(33,37,41,.7)";
    ctx.font = `800 ${m.kind === "boss" ? 16 : 10}px Inter, Arial`;
    ctx.textAlign = "center";
    ctx.fillText(c.label, 0, r * (m.kind === "boss" ? 0.55 : 0.6));
    ctx.restore();
    // vida
    if (m.hp < m.maxHp && m.hp > 0) {
      const w = r * 1.6;
      ctx.fillStyle = "#E6E1DC";
      ctx.fillRect(b.position.x - w / 2, b.position.y - r - 18, w, 6);
      ctx.fillStyle = m.kind === "boss" ? COLORS.rojo : COLORS.naranja;
      ctx.fillRect(b.position.x - w / 2, b.position.y - r - 18, (w * m.hp) / m.maxHp, 6);
    }
  }

  function drawBlock(b: Matter.Body, m: Meta) {
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    const dmg = 1 - Math.max(0, m.hp) / m.maxHp;
    if (m.kind === "clock") {
      ctx.beginPath();
      ctx.arc(0, 0, m.r!, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = COLORS.rojo;
      ctx.stroke();
      ctx.strokeStyle = COLORS.carbon;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -m.r! * 0.6);
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(t * 4) * m.r! * 0.5, Math.sin(t * 4) * m.r! * 0.5);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const w = m.w!, h = m.h!;
    const fills: Partial<Record<Kind, string>> = { box: "#C9A77A", binder: "#7FB7C9", plank: "#D9CBB0", cpu: "#D6CFBF" };
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 5);
    ctx.fillStyle = fills[m.kind] || "#ccc";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(33,37,41,.35)";
    ctx.stroke();
    if (m.kind === "box") {
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.fillRect(-w / 2, -6, w, 12);
      ctx.fillStyle = "rgba(33,37,41,.25)";
      ctx.fillRect(-14, -h / 2 + 10, 28, 12);
    } else if (m.kind === "binder") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(-w / 2 + 6, -h / 2 + 14, w - 12, 26);
      ctx.beginPath();
      ctx.arc(0, h / 2 - 18, 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(33,37,41,.4)";
      ctx.stroke();
    } else if (m.kind === "cpu") {
      ctx.fillStyle = "rgba(33,37,41,.25)";
      for (let k = 0; k < 3; k++) ctx.fillRect(-w / 2 + 10, -h / 2 + 12 + k * 12, w - 20, 5);
      ctx.fillStyle = COLORS.lima;
      ctx.fillRect(w / 2 - 16, h / 2 - 16, 6, 6);
    }
    if (dmg > 0.3) {
      ctx.strokeStyle = "rgba(33,37,41,.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, -h * 0.3);
      ctx.lineTo(0, 0);
      ctx.lineTo(w * 0.2, -h * 0.1);
      ctx.moveTo(0, 0);
      ctx.lineTo(-w * 0.1, h * 0.35);
      ctx.stroke();
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
      ctx.arc(b.position.x + size * 0.42, b.position.y - size * 0.42, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.negro;
      ctx.font = "900 16px Inter, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(a.icon, b.position.x + size * 0.42, b.position.y - size * 0.42 + 1);
    }
  }

  let bg: HTMLCanvasElement | null = null;
  let bgKey = "";
  function background(v: ReturnType<typeof view>) {
    const key = `${state.w}x${state.h}@${state.dpr}`;
    if (bg && bgKey === key) return bg;
    bgKey = key;
    bg = document.createElement("canvas");
    bg.width = Math.round(state.w * state.dpr);
    bg.height = Math.round(state.h * state.dpr);
    const g = bg.getContext("2d")!;
    g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    // cielo claro a toda la pantalla
    const sky = g.createLinearGradient(0, 0, 0, state.h);
    sky.addColorStop(0, "#FFF6EE");
    sky.addColorStop(1, "#EEF5F6");
    g.fillStyle = sky;
    g.fillRect(0, 0, state.w, state.h);
    g.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * v.ox, state.dpr * v.oy);

    // skyline de la compañía (mundo compartido)
    const bld = [
      [60, 260, 140],
      [230, 180, 90],
      [340, 330, 120],
      [480, 220, 100],
      [600, 380, 150],
      [770, 240, 110],
      [900, 300, 130],
      [1500, 340, 140],
      [1660, 220, 120],
    ];
    for (const [x, h, w] of bld) {
      g.fillStyle = "#E9E2DA";
      g.fillRect(x - 60, GROUND - h, w, h);
      g.fillStyle = "rgba(236,114,3,.28)";
      for (let yy = GROUND - h + 18; yy < GROUND - 20; yy += 26) for (let xx = x - 48; xx < x - 60 + w - 14; xx += 22) g.fillRect(xx, yy, 9, 12);
    }
    // HQ Bizit al fondo
    g.fillStyle = "#D9D2CA";
    g.fillRect(1010 - 60, GROUND - 520, 130, 520);
    g.fillStyle = COLORS.naranja;
    g.fillRect(1010 - 60, GROUND - 520, 130, 10);

    // piso
    g.fillStyle = "#E6E1DC";
    g.fillRect(-WORLD_W, GROUND, WORLD_W * 3, 200);
    g.fillStyle = "#D7EBCB";
    g.fillRect(-WORLD_W, GROUND, WORLD_W * 3, 10);

    return bg;
  }

  function draw() {
    const v = view();
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    // fondo estático (cielo, skyline de la compañía y piso) cacheado en un canvas aparte
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background(v), 0, 0);
    ctx.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * v.ox, state.dpr * v.oy);

    // gomera "Deploy"
    ctx.strokeStyle = COLORS.carbon;
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(SLING.x, GROUND);
    ctx.lineTo(SLING.x, SLING.y + 60);
    ctx.lineTo(SLING.x - 34, SLING.y - 10);
    ctx.moveTo(SLING.x, SLING.y + 60);
    ctx.lineTo(SLING.x + 34, SLING.y - 10);
    ctx.stroke();
    ctx.fillStyle = COLORS.naranja;
    ctx.fillRect(SLING.x - 26, SLING.y + 40, 52, 14);
    ctx.font = '900 13px "Archivo Black", Arial';
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText("DEPLOY", SLING.x, SLING.y + 52);

    // bandas elásticas + trayectoria
    if (current) {
      const p = current.position;
      ctx.strokeStyle = COLORS.naranja;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(SLING.x - 34, SLING.y - 10);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(SLING.x + 34, SLING.y - 10);
      ctx.stroke();
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
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.r, p.r * 0.7);
    }
    ctx.globalAlpha = 1;

    // fila de agentes que quedan
    const shots = LEVEL_SHOTS[Math.min(level, 2)];
    const queue = shots.slice(shotIndex + (current ? 1 : 0));
    queue.forEach((ag, i) => {
      const x = SLING.x - 110 - i * 64, y = GROUND - 30;
      drawBGen(ctx, x, y, 50, { expr: "reposo", t, blink: blink(t + i), gx: 4, gy: 0, talk: 0 }, ag === "orquestador" ? 1 : 0);
      if (AGENTS[ag].icon) {
        ctx.fillStyle = AGENTS[ag].color;
        ctx.beginPath();
        ctx.arc(x + 20, y - 20, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (current && !aiming) {
      const ag = (current.plugin as { agent: Agent }).agent;
      ctx.font = '800 18px Inter, Arial';
      ctx.fillStyle = COLORS.carbon;
      ctx.textAlign = "center";
      ctx.fillText(AGENTS[ag].name.toUpperCase(), SLING.x, SLING.y - 70);
      ctx.font = '500 15px "JetBrains Mono", monospace';
      ctx.fillStyle = COLORS.gris;
      ctx.fillText(AGENTS[ag].ability, SLING.x, SLING.y - 48);
    }
    popups.draw(ctx, 1 / 60, 1.2);
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
