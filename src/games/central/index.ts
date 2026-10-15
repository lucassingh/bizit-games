import type { CreateGame, Expr, GameHooks } from "../types";
import { bindGestures, fitCanvas, PhaseClock, Popups, rng, Scorer } from "../shared/engine";
import { drawBGen, makeBlinker } from "../shared/bgenFace";
import { COLORS } from "@/lib/brand";
import { Angry, Bot, Briefcase, Check, ChevronUp, Coins, Flame, Frown, Headphones, Package, Smile, Star, Zap, type IconNode } from "lucide";
import { drawIcon } from "../shared/icons";

/**
 * Juego 3 · Central BGen — "De manual a automático" (docs/05).
 * Las tareas llegan a la bandeja central; se tocan las áreas para repartirlas.
 * Fase 2: se automatizan flujos; fase 3: solo excepciones; clímax: ORQUESTAR.
 *
 * Rendimiento: el fondo y las tarjetas se pre-renderizan en canvas aparte
 * (las sombras con blur y los emojis son caros si se dibujan cada frame).
 */

type AreaId = "ventas" | "finanzas" | "atencion" | "operaciones";

const AREAS: { id: AreaId; name: string; task: string; icon: IconNode; color: string }[] = [
  { id: "ventas", name: "Ventas", task: "Lead", icon: Briefcase, color: COLORS.naranja },
  { id: "finanzas", name: "Finanzas", task: "Factura", icon: Coins, color: COLORS.violeta },
  { id: "atencion", name: "Atención", task: "Reclamo", icon: Headphones, color: COLORS.rojo },
  { id: "operaciones", name: "Operaciones", task: "Pedido", icon: Package, color: COLORS.carbon },
];

interface Task {
  id: number;
  area: number;
  age: number;
  x: number;
  y: number;
  fly?: { tx: number; ty: number; t: number; auto: boolean; ok: boolean };
  escaped?: boolean;
  shake: number;
}

interface Exception {
  id: number;
  area: number;
  x: number;
  y: number;
  life: number;
  done?: boolean;
}

type Variant = "n" | "front" | "golden" | "gray";

const createGame: CreateGame = (host, hooks: GameHooks, opts) => {
  const { canvas, ctx, state, dispose } = fitCanvas(host);
  const rand = rng(20261120);
  const scorer = new Scorer(hooks);
  const popups = new Popups();
  const blink = makeBlinker();
  let t = 0;
  let paused = false;
  let nextId = 1;
  let queue: Task[] = [];
  let flying: Task[] = [];
  let exceptions: Exception[] = [];
  let spawnTimer = 0.6;
  let excTimer = 2;
  let saturation = 0;
  const manualCount = [0, 0, 0, 0];
  const routed = [0, 0, 0, 0];
  const done = [0, 0, 0, 0];
  const automated = [false, false, false, false];
  const glowSince: (number | null)[] = [null, null, null, null];
  let autoTotal = 0;
  let manualTotal = 0;
  let lost = 0;
  let climaxTaps = 0;
  let freezeUntil = 0;
  let expr: Expr = "curioso";
  let ended = false;
  const scale = () => Math.max(0.7, Math.min(state.w, state.h * 1.6) / 1100);

  const say = (e: Expr, text?: string) => {
    expr = e;
    hooks.bgen(e, text);
  };

  const clock = new PhaseClock(hooks, opts.durationSec, (p) => {
    if (p === 1) {
      freezeUntil = t + 1.6;
      say("logro", "¿Y si esto lo hago yo? Tocá el rayo para automatizar.");
    }
    if (p === 2) {
      say("procesando", "¡Cierre de mes! Yo me encargo de lo repetitivo.");
      hooks.hint("¡CIERRE DE MES! Atendé solo las tareas VIP");
      for (let i = 0; i < 4; i++) automate(i, true);
    }
    if (p === 3) {
      say("concentrado", "¡El Caos Operativo! Tocá ORQUESTAR rápido.");
      hooks.hint("¡Tocá ORQUESTAR muchas veces!");
    }
  });
  say("curioso", "Repartí cada tarea en su área. ¡Ojo que se acumulan!");

  /* ---------- geometría (se recalcula con el tamaño) ---------- */
  const layout = () => {
    const W = state.w, H = state.h, s = scale();
    const m = 22 * s;
    const aw = Math.min(W * 0.27, 330 * s), ah = Math.min(H * 0.34, 210 * s);
    const rooms = [
      { x: m, y: m },
      { x: W - m - aw, y: m },
      { x: m, y: H - m - ah },
      { x: W - m - aw, y: H - m - ah },
    ].map((p) => ({ ...p, w: aw, h: ah, cx: p.x + aw / 2, cy: p.y + ah / 2 }));
    const tray = { x: W / 2, y: H * 0.62, w: Math.min(W * 0.4, 520 * s), h: 92 * s };
    // botón de agente en la esquina interior de abajo de cada área (nunca tapa el título)
    const btn = rooms.map((r, i) => ({ x: i % 2 === 0 ? r.x + r.w - 40 * s : r.x + 40 * s, y: r.y + r.h - 38 * s, r: 30 * s }));
    // las cintas terminan en la esquina interior del área (no cruzan la tarjeta)
    const dock = rooms.map((r, i) => ({ x: i % 2 === 0 ? r.x + r.w : r.x, y: i < 2 ? r.y + r.h : r.y }));
    const orch = { x: W / 2, y: H * 0.62, r: 78 * s };
    return { W, H, s, rooms, tray, btn, dock, orch, card: 64 * s };
  };
  type Layout = ReturnType<typeof layout>;

  const slotPos = (i: number) => {
    const L = layout();
    const gap = L.card * 1.12;
    const startX = L.tray.x - L.tray.w / 2 + L.card * 0.7;
    return { x: startX + i * gap, y: L.tray.y };
  };

  function spawn() {
    const a = Math.floor(rand() * 4);
    const L = layout();
    queue.push({ id: nextId++, area: a, age: 0, x: L.tray.x - L.tray.w / 2 - 80 * L.s, y: L.tray.y, shake: 0 });
  }

  function automate(i: number, silent = false) {
    if (automated[i]) return;
    automated[i] = true;
    glowSince[i] = null;
    const n = automated.filter(Boolean).length;
    if (!silent) {
      say("logro", `¡${AREAS[i].name} automatizada! Ya no la toques.`);
      scorer.hit(150, t, false);
      const r = layout().rooms[i];
      popups.add(r.cx, r.cy, "+150 automatizado", COLORS.cian);
      if (n === 3) hooks.banner("¡Equipo de agentes!", "3 flujos automáticos");
    }
  }

  function routeFront(area: number, auto: boolean) {
    const task = auto ? queue.find((q) => automated[q.area] && q.age > 0.35) : queue[0];
    if (!task) return;
    const L = layout();
    const target = auto ? task.area : area;
    const r = L.rooms[target];
    const ok = auto || task.area === area;
    if (!ok) {
      task.shake = 0.4;
      scorer.miss();
      say("mareado");
      saturation = Math.min(1, saturation + 0.04);
      return;
    }
    queue = queue.filter((q) => q !== task);
    task.fly = { tx: r.cx, ty: r.cy, t: 0, auto, ok };
    flying.push(task);
    done[target]++;
    if (auto) {
      autoTotal++;
      scorer.hit(20, t, false);
    } else {
      manualTotal++;
      manualCount[area]++;
      routed[area]++;
      const fast = task.age < 1.2;
      const g = scorer.hit(fast ? 75 : 50, t);
      popups.add(r.cx, r.y + 20 * L.s, `+${g}`, AREAS[area].color);
      if (clock.phase >= 1 && !automated[area] && glowSince[area] === null && routed[area] >= 3) glowSince[area] = t;
      if (expr !== "concentrado" && clock.phase === 0) say("concentrado");
    }
    saturation = Math.max(0, saturation - 0.02);
  }

  function tap(x: number, y: number) {
    if (paused || ended) return;
    const L = layout();
    if (clock.phase === 3) {
      if (Math.hypot(x - L.orch.x, y - L.orch.y) < L.orch.r * 1.3) {
        climaxTaps++;
        for (let k = 0; k < 3; k++) {
          const a = Math.floor(rand() * 4);
          const r = L.rooms[a];
          flying.push({ id: nextId++, area: a, age: 0, x: L.orch.x, y: L.orch.y, shake: 0, fly: { tx: r.cx, ty: r.cy, t: 0, auto: true, ok: true } });
          done[a]++;
          autoTotal++;
        }
        scorer.hit(30, t);
        saturation = Math.max(0, saturation - 0.05);
      }
      return;
    }
    // excepciones (VIP): prioridad
    for (const e of exceptions) {
      if (!e.done && Math.hypot(x - e.x, y - e.y) < L.card * 0.8) {
        e.done = true;
        const g = scorer.hit(200, t);
        popups.add(e.x, e.y, `VIP +${g}`, COLORS.naranja);
        manualTotal++;
        say("logro", "¡Eso es criterio humano! Lo importante lo hacés vos.");
        return;
      }
    }
    // botón de agente
    for (let i = 0; i < 4; i++) {
      const b = L.btn[i];
      if (clock.phase >= 1 && !automated[i] && glowSince[i] !== null && Math.hypot(x - b.x, y - b.y) < b.r * 1.5) {
        automate(i);
        return;
      }
    }
    // tocar un área reparte la tarea que está primera en la bandeja
    for (let i = 0; i < 4; i++) {
      const r = L.rooms[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        if (automated[i]) {
          hooks.hint(`${AREAS[i].name} ya es automática`);
          return;
        }
        routeFront(i, false);
        return;
      }
    }
  }

  const unbind = bindGestures(canvas, { onTap: tap, onSwipe: () => undefined });

  /* ---------- simulación ---------- */
  function update(dt: number) {
    if (!clock.step(dt)) return;
    t += dt;
    const frozen = t < freezeUntil;
    const L = layout();
    const ph = clock.phase;

    if (!frozen && ph < 3) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawn();
        const pp = clock.phaseProgress();
        spawnTimer = ph === 0 ? 1.7 - pp * 1.2 : ph === 1 ? 0.75 : 0.32;
      }
    }

    if (!frozen) {
      for (const q of queue) q.age += dt;
      for (let k = 0; k < 3; k++) {
        if (queue.some((q) => automated[q.area] && q.age > 0.35)) routeFront(0, true);
        else break;
      }
    }

    // BGen automatiza solo si el jugador no toca el botón en 6 s
    for (let i = 0; i < 4; i++) {
      const since = glowSince[i];
      if (since !== null && t - since > 6) automate(i);
    }
    // en fase 2 garantizamos que haya algo para automatizar
    if (ph === 1 && clock.phaseProgress() > 0.25 && !automated.some(Boolean) && !glowSince.some((g) => g !== null)) {
      const most = manualCount.indexOf(Math.max(...manualCount));
      glowSince[most] = t;
    }

    // paciencia: la tarea vieja se vuelve Problemón y escapa
    const patience = ph === 0 ? 6.5 : 5;
    for (const q of queue) {
      if (q.age > patience && !automated[q.area]) {
        q.escaped = true;
        lost++;
        saturation = Math.min(1, saturation + 0.12);
        scorer.miss();
        popups.add(q.x, q.y - 40 * L.s, "¡Se escapó!", COLORS.gris);
        flying.push({ ...q, fly: { tx: q.x + (rand() - 0.5) * 300, ty: -100, t: 0, auto: false, ok: false } });
      }
    }
    queue = queue.filter((q) => !q.escaped);

    // excepciones (fase 3)
    if (ph === 2 && !frozen) {
      excTimer -= dt;
      if (excTimer <= 0) {
        excTimer = 2.2 + rand() * 1.2;
        exceptions.push({ id: nextId++, area: Math.floor(rand() * 4), x: L.W / 2 + (rand() - 0.5) * L.W * 0.3, y: L.H * 0.3 + rand() * L.H * 0.14, life: 4.2 });
      }
    }
    for (const e of exceptions) {
      e.life -= dt;
      if (e.life <= 0 && !e.done) {
        e.done = true;
        lost++;
        scorer.miss();
      }
    }
    exceptions = exceptions.filter((e) => !e.done || e.life > -0.4);

    queue.forEach((q, i) => {
      const p = slotPos(Math.min(i, 9));
      q.x += (p.x - q.x) * Math.min(1, dt * 10);
      q.y += (p.y - q.y) * Math.min(1, dt * 10);
      if (q.shake > 0) q.shake -= dt;
    });
    for (const f of flying) f.fly!.t += dt * (f.fly!.auto ? 1.6 : 2.4);
    flying = flying.filter((f) => f.fly!.t < 1);

    const load = Math.max(0, queue.length - 5) * 0.02;
    saturation = Math.max(0, Math.min(1, saturation + (load - 0.03) * dt * 3));
    if (ph < 3 && !frozen) {
      if (saturation > 0.7 && expr !== "mareado") say("mareado", "¡Me desbordo! Hay demasiadas tareas…");
      else if (saturation < 0.4 && expr === "mareado") say(ph === 0 ? "concentrado" : "procesando");
    }

    const total = autoTotal + manualTotal;
    const pct = total ? autoTotal / total : 0;
    hooks.metric(`${Math.round(pct * 100)}%`, pct);

    if (clock.done && !ended) {
      ended = true;
      say("logro", "¡Empresa en calma! La IA hace lo repetitivo, ustedes lo importante.");
      const processed = autoTotal + manualTotal;
      scorer.hit(Math.max(0, 600 - lost * 30), t, false);
      window.setTimeout(() => hooks.end({ score: scorer.score, metricValue: `${Math.round(pct * 100)}% · ${processed} tareas`, metricPct: pct }), 900);
    }
  }

  /* ---------- sprites y fondo cacheados ---------- */
  const sprites = new Map<string, HTMLCanvasElement>();
  function taskSprite(area: number, s: number, v: Variant) {
    const key = `${area}|${v}|${s}|${state.dpr}`;
    const hit = sprites.get(key);
    if (hit) return hit;
    const a = AREAS[area];
    const size = 64 * s * (v === "front" ? 1.18 : 1);
    const pad = 16 * s;
    const c = document.createElement("canvas");
    c.width = Math.ceil((size + pad * 2) * state.dpr);
    c.height = Math.ceil((size + pad * 2) * state.dpr);
    const g = c.getContext("2d")!;
    g.scale(state.dpr, state.dpr);
    g.translate(size / 2 + pad, size / 2 + pad);
    g.shadowColor = "rgba(0,0,0,.12)";
    g.shadowBlur = 10 * s;
    g.shadowOffsetY = 5 * s;
    g.beginPath();
    g.roundRect(-size / 2, -size / 2, size, size, 16 * s);
    g.fillStyle = v === "gray" ? "#bdb3a0" : v === "golden" ? "#FFF4D6" : "#fff";
    g.fill();
    g.shadowColor = "transparent";
    g.lineWidth = 4 * s;
    g.strokeStyle = v === "golden" ? "#F5B400" : v === "gray" ? "#8d8579" : a.color;
    g.stroke();
    const ic = v === "gray" ? Angry : v === "golden" ? Star : a.icon;
    const icColor = v === "gray" ? "#5a544c" : v === "golden" ? "#D99A00" : a.color;
    drawIcon(g, ic, 0, -5 * s, 28 * s * (v === "front" ? 1.18 : 1), icColor, 2.2);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `800 ${Math.round(11 * s)}px Inter, Arial`;
    g.fillStyle = v === "gray" ? "#5a544c" : COLORS.carbon;
    g.fillText(v === "golden" ? "VIP" : a.task.toUpperCase(), 0, size / 2 - 12 * s);
    sprites.set(key, c);
    return c;
  }

  function drawTask(x: number, y: number, area: number, s: number, o: { age?: number; patience?: number; golden?: boolean; gray?: boolean; front?: boolean; shake?: number } = {}) {
    const v: Variant = o.gray ? "gray" : o.golden ? "golden" : o.front ? "front" : "n";
    const q = Math.max(0.2, Math.round(s * 20) / 20);
    const sp = taskSprite(area, q, v);
    const sx = o.shake ? Math.sin(o.shake * 60) * 6 * s : 0;
    const w = sp.width / state.dpr, h = sp.height / state.dpr;
    ctx.drawImage(sp, x + sx - w / 2, y - h / 2, w, h);
    if (o.age !== undefined && o.patience) {
      const size = 64 * q * (o.front ? 1.18 : 1);
      const f = Math.min(1, o.age / o.patience);
      ctx.beginPath();
      ctx.arc(x + sx + size / 2 - 6 * s, y - size / 2 + 6 * s, 9 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - f));
      ctx.strokeStyle = f > 0.7 ? COLORS.rojo : COLORS.cian;
      ctx.lineWidth = 4 * s;
      ctx.stroke();
    }
  }

  let bg: HTMLCanvasElement | null = null;
  let bgKey = "";
  function background(L: Layout) {
    const key = `${state.w}x${state.h}@${state.dpr}`;
    if (bg && key === bgKey) return bg;
    bgKey = key;
    sprites.clear();
    bg = document.createElement("canvas");
    bg.width = Math.round(state.w * state.dpr);
    bg.height = Math.round(state.h * state.dpr);
    const g = bg.getContext("2d")!;
    g.scale(state.dpr, state.dpr);
    const { W, H, s } = L;
    g.fillStyle = "#FBF9F7";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#EFE9E2";
    g.lineWidth = 1;
    const gs = 40 * s;
    g.beginPath();
    for (let x = (W / 2) % gs; x < W; x += gs) {
      g.moveTo(x, 0);
      g.lineTo(x, H);
    }
    for (let y = (H / 2) % gs; y < H; y += gs) {
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
    g.lineCap = "round";
    g.lineWidth = 16 * s;
    g.strokeStyle = "#ECE5DD";
    for (const d of L.dock) {
      g.beginPath();
      g.moveTo(L.tray.x, L.tray.y);
      g.lineTo(d.x, d.y);
      g.stroke();
    }
    L.rooms.forEach((r, i) => {
      const a = AREAS[i];
      g.save();
      g.shadowColor = "rgba(0,0,0,.08)";
      g.shadowBlur = 20 * s;
      g.shadowOffsetY = 8 * s;
      g.beginPath();
      g.roundRect(r.x, r.y, r.w, r.h, 22 * s);
      g.fillStyle = "#fff";
      g.fill();
      g.restore();
      g.lineWidth = 3 * s;
      g.strokeStyle = "#E6E1DC";
      g.beginPath();
      g.roundRect(r.x, r.y, r.w, r.h, 22 * s);
      g.stroke();
      g.save();
      g.beginPath();
      g.roundRect(r.x, r.y, r.w, r.h, 22 * s);
      g.clip();
      g.fillStyle = a.color;
      g.fillRect(r.x, r.y, r.w, 46 * s);
      g.restore();
      g.fillStyle = "#fff";
      g.font = `900 ${Math.round(22 * s)}px "Archivo Black", Arial`;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(a.name, r.x + 18 * s, r.y + 24 * s);
      drawIcon(g, a.icon, r.cx, r.cy + 14 * s, 60 * s, a.color, 1.8);
    });
    const tr = L.tray;
    g.beginPath();
    g.roundRect(tr.x - tr.w / 2, tr.y - tr.h / 2, tr.w, tr.h, 24 * s);
    g.fillStyle = "#F1ECE6";
    g.fill();
    g.strokeStyle = "#E1D9D0";
    g.lineWidth = 3 * s;
    g.stroke();
    g.font = `800 ${Math.round(12 * s)}px Inter, Arial`;
    g.fillStyle = COLORS.gris;
    g.textAlign = "left";
    g.fillText("BANDEJA DE ENTRADA", tr.x - tr.w / 2 + 16 * s, tr.y - tr.h / 2 - 12 * s);
    return bg;
  }
  // las fuentes pueden llegar después del primer frame: rehacer el fondo cuando estén
  document.fonts?.ready.then(() => {
    bgKey = "";
  });

  /* ---------- dibujo por frame ---------- */
  function draw() {
    const L = layout();
    const { W, H, s } = L;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background(L), 0, 0);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    // cintas de los flujos automatizados
    L.dock.forEach((r, i) => {
      if (!(automated[i] || clock.phase === 3)) return;
      ctx.save();
      ctx.lineCap = "round";
      const grad = ctx.createLinearGradient(L.tray.x, L.tray.y, r.x, r.y);
      grad.addColorStop(0, COLORS.cian);
      grad.addColorStop(1, COLORS.lima);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 8 * s;
      ctx.setLineDash([14 * s, 12 * s]);
      ctx.lineDashOffset = -t * 60 * s;
      ctx.beginPath();
      ctx.moveTo(L.tray.x, L.tray.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
      ctx.restore();
    });

    // áreas: lo dinámico (borde activo, contador, botón de agente)
    L.rooms.forEach((r, i) => {
      if (automated[i]) {
        ctx.lineWidth = 4 * s;
        ctx.strokeStyle = COLORS.cian;
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 22 * s);
        ctx.stroke();
      }
      ctx.font = `500 ${Math.round(16 * s)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${done[i]}`, r.x + r.w - 34 * s, r.y + 24 * s);
      drawIcon(ctx, Check, r.x + r.w - 20 * s, r.y + 24 * s, 16 * s, "#fff", 3);
      const b = L.btn[i];
      if (clock.phase >= 1 && clock.phase < 3) {
        const ready = glowSince[i] !== null && !automated[i];
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (ready ? 1 + Math.sin(t * 8) * 0.08 : 1), 0, Math.PI * 2);
        if (automated[i]) {
          const gg = ctx.createLinearGradient(b.x - b.r, b.y + b.r, b.x + b.r, b.y - b.r);
          gg.addColorStop(0, COLORS.cian);
          gg.addColorStop(1, COLORS.lima);
          ctx.fillStyle = gg;
        } else ctx.fillStyle = ready ? COLORS.noche : "#EFE9E2";
        ctx.fill();
        if (ready) {
          ctx.strokeStyle = COLORS.lima;
          ctx.lineWidth = 4 * s;
          ctx.stroke();
        }
        drawIcon(ctx, automated[i] ? Bot : Zap, b.x, b.y, 28 * s, automated[i] ? COLORS.negro : ready ? COLORS.lima : "#b9b1a8", 2.4);
        ctx.textAlign = "center";
        if (!automated[i] && !ready) {
          ctx.font = `500 ${Math.round(12 * s)}px "JetBrains Mono", monospace`;
          ctx.fillStyle = COLORS.gris;
          ctx.fillText(`${Math.min(3, routed[i])}/3`, b.x, b.y + b.r + 14 * s);
        }
        if (ready) {
          ctx.font = `800 ${Math.round(13 * s)}px Inter, Arial`;
          ctx.fillStyle = COLORS.noche;
          ctx.fillText("¡AUTOMATIZAR!", b.x, b.y - b.r - 12 * s);
        }
      }
    });

    // tareas
    const patience = clock.phase === 0 ? 6.5 : 5;
    if (clock.phase < 3) {
      for (let i = queue.length - 1; i >= 0; i--) {
        const q = queue[i];
        drawTask(q.x, q.y, q.area, s, { age: automated[q.area] ? undefined : q.age, patience, front: i === 0, shake: q.shake > 0 ? q.shake : 0 });
      }
      if (queue[0]) {
        ctx.font = `800 ${Math.round(13 * s)}px Inter, Arial`;
        ctx.fillStyle = COLORS.naranja;
        ctx.textAlign = "center";
        ctx.fillText("SIGUIENTE", queue[0].x + 8 * s, queue[0].y + 58 * s);
        drawIcon(ctx, ChevronUp, queue[0].x - 36 * s, queue[0].y + 56 * s, 14 * s, COLORS.naranja, 3);
      }
    }
    for (const f of flying) {
      const k = f.fly!.t, e = 1 - Math.pow(1 - k, 3);
      const x = f.x + (f.fly!.tx - f.x) * e;
      const y = f.y + (f.fly!.ty - f.y) * e - Math.sin(k * Math.PI) * 60 * s;
      ctx.globalAlpha = 1 - k * 0.6;
      drawTask(x, y, f.area, s * (1 - k * 0.4), { gray: !f.fly!.ok });
      ctx.globalAlpha = 1;
    }
    for (const e of exceptions) {
      if (e.done) continue;
      drawTask(e.x, e.y + Math.sin(t * 4 + e.id) * 4 * s, e.area, s * 1.1, { golden: true, age: 4.2 - e.life, patience: 4.2 });
    }

    // clímax: torbellino + botón ORQUESTAR
    if (clock.phase === 3) {
      const o = L.orch;
      for (let k = 0; k < 26; k++) {
        const a = t * 3 + k * 0.6;
        const rr = (60 + (k % 6) * 22) * s * Math.max(0.2, 1 - climaxTaps / 40);
        drawTask(o.x + Math.cos(a) * rr * 1.6, o.y - 130 * s + Math.sin(a) * rr * 0.5 - k * 2 * s, k % 4, s * 0.55, { gray: true });
      }
      ctx.beginPath();
      ctx.arc(o.x, o.y + 8 * s, o.r, 0, Math.PI * 2);
      ctx.fillStyle = "#b84400";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * (1 + Math.sin(t * 10) * 0.04), 0, Math.PI * 2);
      ctx.fillStyle = COLORS.naranja;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${Math.round(22 * s)}px "Archivo Black", Arial`;
      ctx.textAlign = "center";
      ctx.fillText("ORQUESTAR", o.x, o.y + 2 * s);
      ctx.font = `500 ${Math.round(14 * s)}px "JetBrains Mono", monospace`;
      ctx.fillText(`x${climaxTaps}`, o.x, o.y + 28 * s);
    }

    // saturación del equipo
    const bw = Math.min(W * 0.3, 360 * s);
    const bx = W / 2 - bw / 2, by = H * 0.83;
    ctx.font = `800 ${Math.round(12 * s)}px Inter, Arial`;
    ctx.fillStyle = COLORS.gris;
    ctx.textAlign = "left";
    ctx.fillText("SATURACIÓN DEL EQUIPO", bx, by - 12 * s);
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 18 * s, 9 * s);
    ctx.fillStyle = "#EFE9E2";
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(bx, by, Math.max(18 * s, bw * saturation), 18 * s, 9 * s);
    ctx.fillStyle = saturation > 0.7 ? COLORS.rojo : saturation > 0.4 ? COLORS.naranjaCalido : COLORS.cian;
    ctx.fill();
    drawIcon(ctx, saturation > 0.7 ? Flame : saturation > 0.4 ? Frown : Smile, bx + bw + 24 * s, by + 9 * s, 26 * s, saturation > 0.7 ? COLORS.rojo : saturation > 0.4 ? COLORS.naranjaCalido : COLORS.cian, 2.2);

    drawBGen(ctx, W / 2, H * 0.24 + Math.sin(t * 2) * 5 * s, 130 * s, { expr, t, blink: blink(t), gx: 0, gy: 2, talk: 0 }, automated.some(Boolean) ? 1 : 0);
    popups.draw(ctx, 1 / 60, s);
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
    skipTo(p) {
      if (p > clock.phase) clock.jumpTo(p);
    },
    destroy() {
      cancelAnimationFrame(raf);
      unbind();
      dispose();
    },
  };
};

export default createGame;
