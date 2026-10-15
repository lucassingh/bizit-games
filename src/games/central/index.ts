import type { CreateGame, Expr, GameHooks } from "../types";
import { PHASES, type PhaseIndex } from "@/lib/games";
import { bindGestures, fitCanvas, PhaseClock, Popups, rng, Scorer } from "../shared/engine";
import { drawBGen, makeBlinker } from "../shared/bgenFace";
import { COLORS } from "@/lib/brand";
import { sfx } from "@/lib/audio";
import { Crown, Users, type IconNode } from "lucide";
import { drawIcon } from "../shared/icons";
import { CITY_IMG, drawEnemySprite, type EnemyKind } from "../deploy/art";
import { drawBoard, drawDesk, drawOfficeStatic } from "./office";

/**
 * Juego 3 · Bandeja BGen — "De manual a automático" (docs/05, v3).
 * La Casa Central por dentro. Los Problemones caen desde arriba sobre los
 * escritorios; BGen, abajo, se mueve a izquierda y derecha (arrastrar) y los
 * atrapa antes de que lleguen al equipo. Cada uno atrapado queda automatizado;
 * cada uno que cae frustra a alguien y cuesta una vida.
 *  Drive: mails y leads, despacio.
 *  Foundation: más tipos y ritmo; power-up Equipo (BGen más ancho 6 s).
 *  Evolution: lluvia densa, documentos VIP (×3) y bombas DELETE (no atrapar);
 *             power-up Orquestador (5 s: todo se atrapa solo).
 *  Caos: el jefe baja al centro y tira todo junto; tocar rápido carga el rayo.
 */

const W = 1600, H = 700;
const FLOOR = 590;
const BY = FLOOR + 58; // BGen en el piso, delante de los escritorios
const R = 40;
const BOLT_SPEED = 1100;
const FIRE_EVERY = 0.32;

type Drop = {
  kind: EnemyKind | "vip" | "bomb" | "team" | "orq";
  x: number;
  y: number;
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
  ["mail", "excel", "factura", "fantasma", "reporte", "bomb"],
];
const PHASE_EVERY = [1.15, 0.85, 0.62, 0.3];
const PHASE_FALL = [150, 200, 260, 330];
const ZONE_NAME = ["Ventas", "Operaciones", "Finanzas", "Casa Central"];
const DESKS = [330, 560, 800, 1040, 1270];

const createGame: CreateGame = (host, hooks: GameHooks, opts) => {
  const { canvas, ctx, state, dispose } = fitCanvas(host);
  const scorer = new Scorer(hooks);
  const popups = new Popups();
  const blink = makeBlinker();
  const rand = rng(20261122);

  let paused = false;
  let ended = false;
  let t = 0;
  let bx = W / 2, targetX = W / 2;
  let expr: Expr = "curioso";
  let exprUntil = 0;
  let lives = 3;
  let invulnUntil = 0;
  let shake = 0;
  let wideUntil = 0, orqUntil = 0;
  let spawnIn = 1.2;
  let caught = 0, dropped = 0, total = 0;
  let charge = 0;
  let beamFired = false;
  let bossY = -200;
  let outroT = -1;
  const drops: Drop[] = [];
  const sparks: Spark[] = [];
  const bolts: Bolt[] = [];
  let holding = false;
  let fireIn = 0;
  const deskMood = DESKS.map(() => 0.2);
  const deskShake = DESKS.map(() => 0);
  let powerSpawned = [false, false];

  const say = (e: Expr, text?: string, hold = 1.2) => {
    expr = e;
    exprUntil = t + hold;
    hooks.bgen(e, text);
  };

  const clock = new PhaseClock(hooks, opts.durationSec, (p: PhaseIndex) => {
    if (p >= 1 && p <= 2) {
      const pts = scorer.hit(300, t, false);
      popups.add(W / 2, 250, `¡${ZONE_NAME[p - 1]} automatizada! +${pts}`, COLORS.naranja);
      sfx("g.phase");
      say("logro", p === 1 ? "¡Más tareas! Atento al power-up de equipo." : "¡Finanzas! Los dorados valen triple. ¡No toques los DELETE!", 3);
    }
    if (p === 3) {
      sfx("g.phase");
      say("concentrado", "¡Llegó el Caos! Atrapá lo que puedas y tocá rápido.", 3);
      hooks.stage("charge");
      window.setTimeout(() => hooks.hint("¡Tocá rápido para cargar el rayo!"), 1200);
    }
  });
  hooks.lives(lives);
  hooks.metric("0%", 0);
  say("curioso", "¡Llueven tareas! Movéme y disparo para automatizarlas.", 3);

  /* ---------- input ---------- */
  const toWorld = (px: number) => {
    const v = view();
    return (px - v.ox) / v.s;
  };
  const unbind = bindGestures(canvas, {
    onDragStart(x) {
      if (paused || ended) return false;
      targetX = toWorld(x);
      holding = true;
      fireIn = 0;
      return true;
    },
    onDragMove(x) {
      targetX = toWorld(x);
    },
    onDragEnd() {
      holding = false;
    },
    onTap(x) {
      if (paused || ended) return;
      holding = false;
      targetX = toWorld(x);
      fire();
    },
    onSwipe(dir) {
      if (dir === "left") targetX = Math.max(120, targetX - 220);
      if (dir === "right") targetX = Math.min(W - 120, targetX + 220);
    },
  });

  function fire() {
    if (ended || beamFired) return;
    bolts.push({ x: bx, y: BY - R });
    sfx("g.laser", { volume: 0.25, rate: 1.4 + Math.random() * 0.2 });
    if (clock.phase === 3) charge++;
  }

  /* ---------- mundo ---------- */
  function spawn(kind?: Drop["kind"]) {
    const p = clock.phase;
    const kinds = PHASE_KINDS[p];
    const k = kind ?? kinds[Math.floor(rand() * kinds.length)];
    const power = k === "team" || k === "orq";
    drops.push({
      kind: k,
      x: 170 + rand() * (W - 340),
      y: -60,
      vy: PHASE_FALL[p] * (0.85 + rand() * 0.3) * (power ? 0.8 : 1),
      rot: (rand() - 0.5) * 0.5,
      vr: (rand() - 0.5) * 1.2,
      r: k === "vip" ? 30 : k === "bomb" ? 28 : power ? 30 : 34,
    });
    if (!power && k !== "bomb") total++;
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

  /* ---------- simulación ---------- */
  function update(dt: number) {
    if (!clock.step(dt)) return;
    t += dt;
    const p = clock.phase;

    // BGen sigue el dedo con suavidad
    const tx = Math.max(120, Math.min(W - 120, targetX));
    bx += (tx - bx) * Math.min(1, dt * 14);
    // disparo automático mientras se mantiene apretado (más rápido con el equipo)
    if (holding) {
      fireIn -= dt;
      if (fireIn <= 0) {
        fire();
        if (t < wideUntil) {
          bolts.push({ x: bx - 46, y: BY - R * 0.6 }, { x: bx + 46, y: BY - R * 0.6 });
        }
        fireIn = FIRE_EVERY;
      }
    }
    for (const b of bolts) {
      b.y -= BOLT_SPEED * dt;
      if (b.y < -40) b.dead = true;
    }

    // caída de tareas
    spawnIn -= dt;
    if (spawnIn <= 0 && !beamFired) {
      spawn();
      spawnIn = PHASE_EVERY[p] * (0.8 + rand() * 0.4);
    }
    // power-ups una vez por fase (Foundation: equipo; Evolution: orquestador)
    if (p === 1 && !powerSpawned[0] && clock.phaseProgress() > 0.3) {
      powerSpawned[0] = true;
      spawn("team");
    }
    if (p === 2 && !powerSpawned[1] && clock.phaseProgress() > 0.35) {
      powerSpawned[1] = true;
      spawn("orq");
    }
    // el jefe baja en el Caos
    if (p === 3) bossY += ((beamFired ? -300 : 150) - bossY) * Math.min(1, dt * (beamFired ? 1.2 : 0.8));

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
          wideUntil = t + 6;
          sfx("g.power");
          say("logro", "¡Equipo de agentes! Disparo triple.", 3);
          hooks.hint("EQUIPO DE AGENTES");
          burst(d.x, d.y, 24, [COLORS.cian, COLORS.lima, "#fff"]);
          continue;
        }
        if (d.kind === "orq") {
          d.dead = true;
          orqUntil = t + 5;
          sfx("g.power2");
          say("logro", "¡Modo orquestador! Todo se automatiza solo.", 3);
          hooks.hint("ORQUESTADOR");
          burst(d.x, d.y, 30, [COLORS.naranja, COLORS.lima, "#fff"]);
          continue;
        }
        d.got = 0;
        caught++;
        const base = d.kind === "vip" ? 300 : 100;
        const pts = scorer.hit(base, t);
        popups.add(d.x, d.y - 40, d.kind === "vip" ? `¡VIP! +${pts}` : `+${pts}`, d.kind === "vip" ? "#D9A441" : COLORS.cian);
        sfx(`g.coin${Math.min(4, scorer.combo)}` as "g.coin1", { volume: 0.55 });
        burst(d.x, d.y, 10, [COLORS.cian, COLORS.lima]);
        say(caught % 6 === 0 ? "logro" : "procesando", caught % 6 === 0 ? "¡Automatizado!" : undefined, 0.8);
        continue;
      }
      // ¿llegó al escritorio?
      if (d.y + d.r >= FLOOR - 70) {
        d.dead = true;
        if (d.kind === "bomb") {
          // la bomba se desactiva sola en el piso
          burst(d.x, FLOOR - 70, 8, ["#999"]);
          continue;
        }
        dropped++;
        burst(d.x, FLOOR - 70, 12, ["#D9CBB0", "#BDB3A0"]);
        sfx("g.near", { volume: 0.4, rate: 0.7 });
        loseLife(["¡Uy! Se le cayó al equipo.", "¡Ay! Esa tarea quedó sin hacer.", "¡Otra más al escritorio!"][dropped % 3], nearestDesk(d.x));
      }
    }
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);
    for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].dead) bolts.splice(i, 1);

    // el ánimo de los escritorios mejora con lo automatizado
    const goal = Math.min(1, 0.2 + metricPct() * 0.9);
    for (let i = 0; i < deskMood.length; i++) {
      deskMood[i] += (goal - deskMood[i]) * Math.min(1, dt * 0.6);
      deskShake[i] = Math.max(0, deskShake[i] - dt * 2.5);
    }

    // rayo final
    if (p === 3 && !beamFired && clock.elapsed >= opts.durationSec - 2.6) {
      beamFired = true;
      hooks.stage(null);
      sfx("g.beam");
      window.setTimeout(() => sfx("g.bell", { volume: 0.7 }), 500);
      const pts = scorer.hit(1000 + charge * 15, t, false);
      popups.add(W / 2, 200, `¡Rayo! +${pts}`, COLORS.naranja);
      say("logro", "¡Caos disuelto! La bandeja quedó en cero.", 4);
      shake = 1;
      // todo lo que queda cayendo se automatiza
      for (const d of drops)
        if (d.got === undefined && d.kind !== "bomb") {
          d.got = 0;
          caught++;
        }
    }

    for (const s of sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 900 * dt;
      s.life -= dt * 1.6;
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);

    hooks.metric(`${Math.round(metricPct() * 100)}%`, metricPct());
    if (t > exprUntil && p < 3) expr = "concentrado";
    shake *= Math.exp(-dt * 5);

    if (clock.done && !ended) {
      ended = true;
      outroT = 0;
      expr = "logro";
      sfx("g.win");
      const pct = metricPct();
      const pc = Math.round(pct * 100);
      window.setTimeout(() => hooks.stage("outro", { title: `¡Empresa automatizada al ${pc}%!`, text: `Atrapaste ${caught} tareas antes de que lleguen al equipo y el Caos quedó en cero. Esto es lo que BGenAI puede hacer en tu empresa.` }), 900);
      window.setTimeout(() => {
        hooks.stage(null);
        hooks.end({ score: scorer.score, metricValue: `${pc}%`, metricPct: pct });
      }, 12000);
    }
    if (ended && outroT >= 0) outroT += dt;
  }

  function nearestDesk(x: number) {
    let best = 0;
    for (let i = 1; i < DESKS.length; i++) if (Math.abs(DESKS[i] - x) < Math.abs(DESKS[best] - x)) best = i;
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
    const key = `${state.w}x${state.h}@${state.dpr}:${CITY_IMG?.complete && CITY_IMG.naturalWidth ? 1 : 0}`;
    if (bg && bgKey === key) return bg;
    bgKey = key;
    bg = document.createElement("canvas");
    bg.width = Math.round(state.w * state.dpr);
    bg.height = Math.round(state.h * state.dpr);
    const g = bg.getContext("2d")!;
    g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    g.fillStyle = "#F4F1EC";
    g.fillRect(0, 0, state.w, state.h);
    g.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * v.ox, state.dpr * v.oy);
    // la pared y el piso se extienden fuera del mundo para cubrir cualquier proporción
    g.fillStyle = "#F4F1EC";
    g.fillRect(-W, -H, W * 3, FLOOR + H);
    g.fillStyle = "#C9BEB0";
    g.fillRect(-W, FLOOR, W * 3, H * 2);
    drawOfficeStatic(g, W, H, FLOOR, CITY_IMG);
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

  function draw() {
    const v = view();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background(v), 0, 0);
    const shx = shake > 0.01 ? (Math.random() - 0.5) * 14 * shake : 0;
    const shy = shake > 0.01 ? (Math.random() - 0.5) * 10 * shake : 0;
    ctx.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * (v.ox + shx * v.s), state.dpr * (v.oy + shy * v.s));

    // tablero
    drawBoard(ctx, W - 190, 70, caught, total);

    // escritorios con el equipo
    DESKS.forEach((x, i) => {
      const sx = deskShake[i] > 0 ? Math.sin(t * 50) * 4 * deskShake[i] : 0;
      drawDesk(ctx, x + sx, FLOOR, deskMood[i], t, i);
    });

    // el Caos
    if (clock.phase === 3 && bossY > -150) {
      ctx.save();
      ctx.translate(W / 2 + Math.sin(t * 1.3) * 180, bossY + Math.sin(t * 2.2) * 14);
      drawEnemySprite(ctx, "boss", 64, t, 0);
      ctx.restore();
    }

    // tareas que caen
    for (const d of drops) drawDrop(d);

    // disparos
    for (const b of bolts) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.shadowColor = COLORS.cian;
      ctx.shadowBlur = 14;
      ctx.fillStyle = COLORS.lima;
      ctx.beginPath();
      ctx.roundRect(-5, -22, 10, 44, 5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.roundRect(-2, -16, 4, 24, 2);
      ctx.fill();
      ctx.restore();
    }

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

    // relámpago final
    if (beamFired) {
      const k = Math.max(0, 1 - (clock.elapsed - (opts.durationSec - 2.6)) / 1.6);
      if (k > 0.03) {
        ctx.save();
        ctx.strokeStyle = `rgba(178,243,38,${k})`;
        ctx.lineWidth = 12;
        ctx.lineJoin = "round";
        ctx.shadowColor = COLORS.cian;
        ctx.shadowBlur = 26;
        ctx.beginPath();
        ctx.moveTo(bx, BY - R);
        const tx = W / 2 + Math.sin(t * 1.3) * 180, ty = bossY;
        const n = 8;
        for (let i = 1; i <= n; i++) ctx.lineTo(bx + ((tx - bx) * i) / n + (i < n ? (Math.random() - 0.5) * 70 : 0), BY - R + ((ty - BY + R) * i) / n);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, s.r, s.r * 0.7);
    }
    ctx.globalAlpha = 1;
    popups.draw(ctx, 1 / 60, 1.2);
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
      powerSpawned = [p > 1, p > 2];
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
