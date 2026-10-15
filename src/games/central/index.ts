import type { CreateGame, Expr, GameHooks } from "../types";
import { PHASES, type PhaseIndex } from "@/lib/games";
import { bindGestures, fitCanvas, PhaseClock, Popups, rng, Scorer } from "../shared/engine";
import { drawBGen, makeBlinker } from "../shared/bgenFace";
import { COLORS } from "@/lib/brand";
import { sfx } from "@/lib/audio";
import { CITY_IMG, drawEnemySprite, type EnemyKind } from "../deploy/art";

/**
 * Juego 3 · BGen Vuela — "Atravesá la empresa" (estilo Flappy Bird).
 * Tocar = aletear. BGen vuela por la compañía esquivando pilas de Problemones
 * (arriba y abajo, con un hueco) y juntando conectores en los huecos.
 * Fases por tramos: Drive (Ventas: mails) → Foundation (Operaciones: planillas
 * y cajas que se mueven) → Evolution (Finanzas: facturas, más rápido, huecos
 * más chicos) → Caos (Casa Central: tormenta de papeles, 10 s de esquive).
 * 3 vidas. Métrica: Problemones esquivados.
 */

const W = 1600, H = 700;
const GROUND = 620;
const BX = 380; // x fija de BGen
const R = 34; // radio de BGen
const GRAVITY = 1900;
const FLAP = -620;
const MAX_FALL = 820;

interface Gate {
  x: number;
  /** centro del hueco */
  gapY: number;
  gapH: number;
  kind: EnemyKind;
  /** movimiento vertical (Foundation en adelante) */
  amp: number;
  phase: number;
  passed: boolean;
  /** conector en el hueco */
  coin?: { taken: boolean };
  /** sacudida al chocar */
  shake: number;
}

interface Paper {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  c: string;
  hit?: boolean;
}

const PHASE_KINDS: EnemyKind[][] = [["mail"], ["excel", "reporte"], ["factura", "excel"], []];
const PHASE_SPEED = [230, 290, 350, 400];
const PHASE_GAP = [250, 220, 195, 0];
const PHASE_EVERY = [2.1, 1.85, 1.6, 0];
const ZONE_NAME = ["Ventas", "Operaciones", "Finanzas", "Casa Central"];

const createGame: CreateGame = (host, hooks: GameHooks, opts) => {
  const { canvas, ctx, state, dispose } = fitCanvas(host);
  const scorer = new Scorer(hooks);
  const popups = new Popups();
  const blink = makeBlinker();
  const rand = rng(20261121);

  let paused = false;
  let ended = false;
  let t = 0;
  let y = 320, vy = 0;
  let tilt = 0;
  let expr: Expr = "curioso";
  let exprUntil = 0;
  let lives = 3;
  let invulnUntil = 0;
  let shake = 0;
  let flapAnim = 0;
  let started = false;
  const gates: Gate[] = [];
  const papers: Paper[] = [];
  let spawnIn = 1.6;
  let passed = 0, totalGates = 0, dodgedCaos = 0;
  let scrollX = 0;
  let charge = 0;
  let beamFired = false;
  let outroT = -1;

  const say = (e: Expr, text?: string, hold = 1.2) => {
    expr = e;
    exprUntil = t + hold;
    hooks.bgen(e, text);
  };

  const clock = new PhaseClock(hooks, opts.durationSec, (p: PhaseIndex) => {
    if (p >= 1 && p <= 2) {
      const pts = scorer.hit(300, t, false);
      popups.add(BX, y - 60, `¡${ZONE_NAME[p - 1]} atravesada! +${pts}`, COLORS.naranja);
      sfx("g.phase");
      say("logro", p === 1 ? "¡Operaciones! Ojo que acá las pilas se mueven." : "¡Finanzas! Las facturas caen, volá fino.", 2.5);
    }
    if (p === 3) {
      sfx("g.phase");
      say("concentrado", "¡La Casa Central! Esquivá la tormenta del Caos.", 3);
      hooks.stage("charge");
      window.setTimeout(() => hooks.hint("¡Tocá rápido para cargar el rayo!"), 1200);
    }
  });
  hooks.lives(lives);
  hooks.metric("0%", 0);
  say("curioso", "¡Tocá para aletear y atravesar la empresa!", 3);

  /* ---------- input ---------- */
  function flap() {
    if (paused || ended) return;
    started = true;
    if (clock.phase === 3) {
      // en el Caos cada toque también carga el rayo
      charge++;
      sfx("g.tap", { volume: 0.4, rate: 0.9 + Math.min(1, charge * 0.02) });
    }
    vy = FLAP;
    flapAnim = 1;
    sfx("g.jump", { volume: 0.35, rate: 1.1 + Math.random() * 0.1 });
  }
  const unbind = bindGestures(canvas, {
    onTap: flap,
    onSwipe(dir) {
      if (dir === "up") flap();
    },
  });

  /* ---------- mundo ---------- */
  function spawnGate() {
    const p = clock.phase;
    const kinds = PHASE_KINDS[p];
    const gapH = PHASE_GAP[p] + (rand() - 0.5) * 30;
    const margin = 110;
    const gapY = margin + gapH / 2 + rand() * (GROUND - margin * 2 - gapH);
    const g: Gate = {
      x: W + 120,
      gapY,
      gapH,
      kind: kinds[Math.floor(rand() * kinds.length)],
      amp: p === 0 ? 0 : p === 1 ? 40 + rand() * 30 : 60 + rand() * 40,
      phase: rand() * 6.28,
      passed: false,
      coin: rand() < 0.75 ? { taken: false } : undefined,
      shake: 0,
    };
    gates.push(g);
    totalGates++;
  }
  function spawnPaper() {
    const fromTop = rand() < 0.5;
    papers.push({
      x: W + 60,
      y: fromTop ? 80 + rand() * 200 : GROUND - 80 - rand() * 200,
      vx: -(380 + rand() * 220),
      vy: (fromTop ? 1 : -1) * (40 + rand() * 120),
      rot: rand() * 6.28,
      vr: (rand() - 0.5) * 6,
      w: 34 + rand() * 24,
      h: 24 + rand() * 16,
      c: ["#D9CBB0", "#BDB3A0", "#EDE6DA", "#F6E7A8"][Math.floor(rand() * 4)],
    });
  }

  function hit(reason: string) {
    if (t < invulnUntil) return;
    invulnUntil = t + 1.4;
    shake = 0.8;
    lives--;
    hooks.lives(lives);
    scorer.miss();
    sfx("g.hit", { volume: 0.8 });
    if (lives <= 0) {
      ended = true;
      paused = true;
      clock.paused = true;
      say("mareado", "¡Uf! Demasiados Problemones en el camino…", 9);
      const pct = metricPct();
      hooks.gameOver({ score: scorer.score, metricValue: `${Math.round(pct * 100)}%`, metricPct: pct });
      return;
    }
    sfx("g.fail", { volume: 0.5 });
    say("mareado", reason, 1.2);
    // rebote hacia el centro para no encadenar choques
    vy = y > GROUND / 2 ? FLAP * 0.8 : 200;
  }

  function metricPct() {
    const denom = totalGates + (clock.phase === 3 || beamFired ? 12 : 0);
    return denom ? Math.min(1, (passed + dodgedCaos) / denom) : 0;
  }

  /* ---------- simulación ---------- */
  function update(dt: number) {
    if (!clock.step(dt)) return;
    t += dt;
    const p = clock.phase;
    const speed = PHASE_SPEED[p];
    scrollX += speed * dt;

    if (!started) {
      // antes del primer toque BGen flota en el lugar
      y = 320 + Math.sin(t * 3) * 10;
    } else if (!beamFired) {
      vy = Math.min(MAX_FALL, vy + GRAVITY * dt);
      y += vy * dt;
      if (y > GROUND - R) {
        y = GROUND - R;
        vy = 0;
        hit("¡Ay, el piso!");
        vy = FLAP * 0.9;
      }
      if (y < R + 10) {
        y = R + 10;
        vy = 0;
      }
    } else {
      // cierre: planea suave
      y += (300 - y) * Math.min(1, dt * 2);
    }
    tilt += ((started ? Math.max(-0.5, Math.min(0.9, vy / 900)) : 0) - tilt) * Math.min(1, dt * 10);
    flapAnim = Math.max(0, flapAnim - dt * 4);

    if (p < 3) {
      spawnIn -= dt;
      if (spawnIn <= 0 && started) {
        spawnGate();
        spawnIn = PHASE_EVERY[p];
      }
      for (const g of gates) {
        g.x -= speed * dt;
        g.shake = Math.max(0, g.shake - dt * 3);
        const gy = g.gapY + Math.sin(t * 1.6 + g.phase) * g.amp;
        // conector
        if (g.coin && !g.coin.taken && Math.abs(g.x - BX) < R + 18 && Math.abs(gy - y) < R + 18) {
          g.coin.taken = true;
          const pts = scorer.hit(50, t);
          popups.add(BX + 20, y - 50, `+${pts}`, COLORS.cian);
          sfx(`g.coin${Math.min(4, scorer.combo)}` as "g.coin1", { volume: 0.55 });
        }
        // colisión con las pilas (rectángulos verticales)
        const half = 44;
        if (Math.abs(g.x - BX) < half + R * 0.8) {
          const top = gy - g.gapH / 2, bot = gy + g.gapH / 2;
          if (y - R * 0.75 < top || y + R * 0.75 > bot) {
            if (t >= invulnUntil) {
              g.shake = 1;
              hit(["¡Uy! Chocaste una pila.", "¡Ay! Esquivá los Problemones.", "¡Otra vez!"][Math.floor(rand() * 3)]);
            }
          }
        }
        if (!g.passed && g.x < BX - half) {
          g.passed = true;
          passed++;
          const pts = scorer.hit(100, t);
          popups.add(BX, y - 70, `+${pts}`, COLORS.naranja);
          if (passed % 5 === 0) say("logro", "¡Vas muy bien!", 1);
        }
      }
      while (gates.length && gates[0].x < -200) gates.shift();
    } else {
      // Caos: tormenta de papeles durante toda la fase; el rayo sale a los 7,4 s
      spawnIn -= dt;
      if (spawnIn <= 0 && !beamFired) {
        spawnPaper();
        spawnIn = 0.16;
      }
      for (const pp of papers) {
        pp.x += pp.vx * dt;
        pp.y += pp.vy * dt;
        pp.rot += pp.vr * dt;
        if (!pp.hit && !beamFired && Math.abs(pp.x - BX) < R + pp.w * 0.35 && Math.abs(pp.y - y) < R + pp.h * 0.35) {
          pp.hit = true;
          if (t >= invulnUntil) {
            hit("¡El Caos pega fuerte!");
          }
        } else if (!pp.hit && pp.x < BX - 60) {
          pp.hit = true;
          dodgedCaos++;
        }
      }
      while (papers.length && papers[0].x < -100) papers.shift();
      const e = clock.elapsed;
      if (!beamFired && e >= opts.durationSec - 2.6) {
        beamFired = true;
        hooks.stage(null);
        sfx("g.beam");
        window.setTimeout(() => sfx("g.bell", { volume: 0.7 }), 500);
        const pts = scorer.hit(1000 + charge * 15, t, false);
        popups.add(W * 0.7, 200, `¡Rayo! +${pts}`, COLORS.naranja);
        say("logro", "¡Caos disuelto! La empresa vuela.", 4);
        shake = 1;
      }
    }
    hooks.metric(`${Math.round(metricPct() * 100)}%`, metricPct());

    if (t > exprUntil && clock.phase < 3) expr = started ? "concentrado" : "curioso";
    shake *= Math.exp(-dt * 5);

    if (clock.done && !ended) {
      ended = true;
      outroT = 0;
      expr = "logro";
      sfx("g.win");
      const pct = metricPct();
      const pc = Math.round(pct * 100);
      window.setTimeout(() => hooks.stage("outro", { title: `¡Atravesaste la empresa al ${pc}%!`, text: `Esquivaste ${passed + dodgedCaos} Problemones y llegaste a la Casa Central con ${lives} ${lives === 1 ? "vida" : "vidas"}. Esto es lo que BGenAI puede hacer en tu empresa.` }), 900);
      window.setTimeout(() => {
        hooks.stage(null);
        hooks.end({ score: scorer.score, metricValue: `${pc}%`, metricPct: pct });
      }, 12000);
    }
    if (ended && outroT >= 0) outroT += dt;
  }

  /* ---------- dibujo ---------- */
  let bg: HTMLCanvasElement | null = null;
  let bgKey = "";
  function view() {
    const s = Math.min(state.w / W, state.h / H);
    return { s, ox: (state.w - W * s) / 2, oy: state.h - H * s };
  }
  function background() {
    const key = `${state.w}x${state.h}@${state.dpr}:${CITY_IMG?.complete && CITY_IMG.naturalWidth ? 1 : 0}`;
    if (bg && bgKey === key) return bg;
    bgKey = key;
    bg = document.createElement("canvas");
    bg.width = Math.round(state.w * state.dpr);
    bg.height = Math.round(state.h * state.dpr);
    const g = bg.getContext("2d")!;
    g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, state.h);
    sky.addColorStop(0, "#8EC9EC");
    sky.addColorStop(0.6, "#C9E4F3");
    sky.addColorStop(1, "#EEF3F6");
    g.fillStyle = sky;
    g.fillRect(0, 0, state.w, state.h);
    return bg;
  }

  function drawCity(g: CanvasRenderingContext2D) {
    if (!CITY_IMG || !CITY_IMG.complete || !CITY_IMG.naturalWidth) return;
    // parallax: la ciudad se repite y se desplaza a un cuarto de la velocidad
    const iw = W * 1.4, ih = iw * (CITY_IMG.naturalHeight / CITY_IMG.naturalWidth);
    const off = -((scrollX * 0.25) % iw);
    for (let k = -1; k <= 1; k++) g.drawImage(CITY_IMG, off + k * iw, GROUND - ih * 0.88, iw, ih);
    const haze = g.createLinearGradient(0, GROUND - ih * 1.4, 0, GROUND);
    haze.addColorStop(0, "rgba(226,238,247,0)");
    haze.addColorStop(0.5, "rgba(226,238,247,0.45)");
    haze.addColorStop(1, "rgba(240,236,230,0.6)");
    g.fillStyle = haze;
    g.fillRect(-W, -H, W * 3, GROUND + H);
    // nubes en primer plano (más rápidas)
    g.fillStyle = "rgba(255,255,255,0.85)";
    const co = -((scrollX * 0.5) % (W * 1.2));
    for (const [cx, cy, s] of [
      [200, 110, 1],
      [700, 70, 0.7],
      [1200, 150, 1.1],
      [1700, 90, 0.8],
    ]) {
      for (let k = 0; k <= 1; k++) {
        const x = co + cx + k * W * 1.2;
        for (const [dx, dy, r] of [
          [0, 0, 34],
          [36, -16, 44],
          [80, 0, 32],
          [42, 12, 30],
        ]) {
          g.beginPath();
          g.arc(x + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  function drawGround(g: CanvasRenderingContext2D) {
    g.fillStyle = "#8CC45C";
    g.beginPath();
    g.moveTo(-W, GROUND + 60);
    g.lineTo(-W, GROUND - 2);
    const o = -(scrollX % 60);
    for (let x = -W + o; x <= W * 2; x += 60) g.quadraticCurveTo(x + 30, GROUND - 12, x + 60, GROUND - 2);
    g.lineTo(W * 2, GROUND + 60);
    g.closePath();
    g.fill();
    g.fillStyle = "#6FAE47";
    g.fillRect(-W, GROUND + 14, W * 3, 8);
    g.fillStyle = "#8B6A4A";
    g.fillRect(-W, GROUND + 22, W * 3, 200);
  }

  function drawPile(g: CanvasRenderingContext2D, gate: Gate, gy: number) {
    const top = gy - gate.gapH / 2, bot = gy + gate.gapH / 2;
    const sx = gate.shake > 0 ? Math.sin(t * 60) * 4 * gate.shake : 0;
    // columna de Problemones apilados: arriba (hasta el techo) y abajo (hasta el piso)
    const unit = 76;
    const draw = (cy: number, i: number) => {
      g.save();
      g.translate(gate.x + sx, cy);
      g.rotate((i % 2 ? 1 : -1) * 0.04);
      drawEnemySprite(g, gate.kind, 34, t, gate.phase + i);
      g.restore();
    };
    let i = 0;
    for (let cy = top - unit * 0.5; cy > -unit; cy -= unit) draw(cy, i++);
    for (let cy = bot + unit * 0.5; cy < GROUND + unit; cy += unit) draw(cy, i++);
    // conector en el hueco
    if (gate.coin && !gate.coin.taken) {
      g.save();
      g.translate(gate.x, gy + Math.sin(t * 4 + gate.phase) * 6);
      g.fillStyle = COLORS.cian;
      g.strokeStyle = COLORS.carbon;
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(-13, -15, 26, 30, 6);
      g.fill();
      g.stroke();
      g.fillStyle = COLORS.lima;
      g.fillRect(-9, -24, 5, 12);
      g.fillRect(4, -24, 5, 12);
      g.strokeStyle = COLORS.lima;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, 24, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }

  function draw() {
    const v = view();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background(), 0, 0);
    const shx = shake > 0.01 ? (Math.random() - 0.5) * 14 * shake : 0;
    const shy = shake > 0.01 ? (Math.random() - 0.5) * 10 * shake : 0;
    ctx.setTransform(state.dpr * v.s, 0, 0, state.dpr * v.s, state.dpr * (v.ox + shx * v.s), state.dpr * (v.oy + shy * v.s));
    drawCity(ctx);
    drawGround(ctx);

    // pilas
    for (const g of gates) drawPile(ctx, g, g.gapY + Math.sin(t * 1.6 + g.phase) * g.amp);
    // papeles del Caos
    for (const pp of papers) {
      ctx.save();
      ctx.translate(pp.x, pp.y);
      ctx.rotate(pp.rot);
      ctx.fillStyle = pp.c;
      ctx.strokeStyle = "rgba(33,37,41,0.5)";
      ctx.lineWidth = 2;
      ctx.fillRect(-pp.w / 2, -pp.h / 2, pp.w, pp.h);
      ctx.strokeRect(-pp.w / 2, -pp.h / 2, pp.w, pp.h);
      ctx.restore();
    }
    // el Caos (jefe) a la derecha durante la fase final
    if (clock.phase === 3) {
      const k = beamFired ? Math.max(0, 1 - (clock.elapsed - (opts.durationSec - 2.6)) / 1.6) : 1;
      if (k > 0) {
        ctx.save();
        ctx.translate(W - 170, 300 + Math.sin(t * 2) * 18);
        ctx.scale(k, k);
        drawEnemySprite(ctx, "boss", 70, t, 0);
        ctx.restore();
      }
      if (beamFired && k > 0.05) {
        // relámpago dentado desde BGen al Caos
        ctx.save();
        ctx.strokeStyle = `rgba(178,243,38,${k})`;
        ctx.lineWidth = 10;
        ctx.lineJoin = "round";
        ctx.shadowColor = COLORS.cian;
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.moveTo(BX + R, y);
        const n = 9;
        for (let i = 1; i <= n; i++) {
          const kx = BX + R + ((W - 170 - BX - R) * i) / n;
          const ky = y + (300 - y) * (i / n) + (i < n ? (Math.random() - 0.5) * 70 : 0);
          ctx.lineTo(kx, ky);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // BGen
    const vis = !(t < invulnUntil && Math.floor(t * 12) % 2 === 0);
    if (vis) {
      ctx.save();
      ctx.translate(BX, y);
      ctx.rotate(tilt);
      const sq = 1 + flapAnim * 0.12;
      ctx.scale(1 / sq, sq);
      // sombra
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.ellipse(BX, GROUND - 4, 26 * (1 - (GROUND - y) / 1400), 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(BX, y);
      ctx.rotate(tilt);
      // estela
      ctx.strokeStyle = "rgba(10,182,188,0.35)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-R - 8 - i * 14, (i - 1) * 9);
        ctx.lineTo(-R - 26 - i * 14, (i - 1) * 9);
        ctx.stroke();
      }
      drawBGen(ctx, 0, 0, R * 2.4, { expr, t, blink: blink(t), gx: 5, gy: Math.max(-3, Math.min(3, vy / 300)), talk: 0 }, clock.phase >= 1 ? 0.5 : 0);
      ctx.restore();
    }

    popups.draw(ctx, 1 / 60, 1.2);
    if (!started && !ended) {
      ctx.save();
      ctx.font = '900 34px "Archivo Black", Arial';
      ctx.textAlign = "center";
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(33,37,41,0.9)";
      ctx.fillStyle = "#fff";
      const bob = Math.sin(t * 4) * 4;
      ctx.strokeText("¡TOCÁ PARA ALETEAR!", W / 2, 150 + bob);
      ctx.fillText("¡TOCÁ PARA ALETEAR!", W / 2, 150 + bob);
      ctx.restore();
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
      gates.length = 0;
      spawnIn = 0.5;
      started = true;
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
