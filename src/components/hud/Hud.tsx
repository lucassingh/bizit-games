"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Network, Users, Zap } from "lucide-react";
import BGen from "../BGen";
import GestureIcon from "../GestureIcon";
import TechFrame from "../TechFrame";
import { GAMES, PHASES, type GameId } from "@/lib/games";
import { useHud } from "@/lib/store";
import h from "./hud.module.css";

/**
 * HUD con lenguaje de videojuego: puntaje que salta al sumar (con el delta
 * flotando), combo como sello, tiempo en anillo que se enciende en rojo al
 * final, métrica en barra segmentada y las fases como un mapa de progreso.
 * Barra lateral en TV y barra inferior en tablet.
 */

const PHASE_ICONS = [Zap, Users, Network];

/** Puntaje: los dígitos "saltan" en cada suma y el delta sube flotando. */
function Score({ value }: { value: number }) {
  const prev = useRef(value);
  const [deltas, setDeltas] = useState<{ id: number; v: number }[]>([]);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (d <= 0) return;
    const id = Date.now() + Math.random();
    setDeltas((ds) => [...ds.slice(-2), { id, v: d }]);
    setBump((b) => b + 1);
    const t = window.setTimeout(() => setDeltas((ds) => ds.filter((x) => x.id !== id)), 800);
    return () => window.clearTimeout(t);
  }, [value]);
  return (
    <div className={h.scoreWrap}>
      <span key={bump} className={`${h.score} ${bump ? h.bump : ""}`}>
        {value.toLocaleString("es-AR")}
      </span>
      {deltas.map((d) => (
        <span key={d.id} className={h.delta}>
          +{d.v.toLocaleString("es-AR")}
        </span>
      ))}
    </div>
  );
}

/** Anillo de tiempo: se vacía en sentido horario y pulsa en rojo en los últimos 10 s. */
function TimeRing({ timeLeft, duration, size }: { timeLeft: number; duration: number; size: number }) {
  const secs = Math.max(0, Math.ceil(timeLeft));
  const frac = Math.max(0, Math.min(1, timeLeft / duration));
  const low = secs <= 10;
  const R = 29;
  const C = 2 * Math.PI * R;
  const onlySecs = secs < 60;
  return (
    <div className={`${h.ring} ${low ? h.ringLow : ""} ${onlySecs ? h.ringSecs : ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={R} className={h.ringTrack} />
        <circle cx="32" cy="32" r={R} className={h.ringFill} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      </svg>
      <span className={h.ringTime}>{onlySecs ? secs : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`}</span>
      <span className={h.ringUnit}>{onlySecs ? "seg" : "min"}</span>
    </div>
  );
}

/** Niveles de agentes (Drive, Foundation, Evolution): nodos conectados; el tramo actual se llena con el tiempo. */
const LEVELS = PHASES.slice(0, 3);
function PhaseMap({ phase, elapsedFrac, vertical }: { phase: number; elapsedFrac: number; vertical: boolean }) {
  return (
    <ol className={`${h.map} ${vertical ? h.mapV : h.mapH}`}>
      {LEVELS.map((p, i) => {
        const Icon = PHASE_ICONS[i];
        // el tramo que llega a este nodo: lleno si ya pasamos, parcial (por tiempo) si es el próximo
        const prev = PHASES[i - 1];
        const start = i <= 1 ? 0 : PHASES[i - 2].until;
        const partial = prev ? Math.max(0, Math.min(1, (elapsedFrac - start) / (prev.until - start))) : 0;
        const link = i <= phase ? 1 : i === phase + 1 ? partial : 0;
        const state = i < phase ? h.done : i === phase ? h.now : "";
        return (
          <li key={p.key} className={state}>
            {i > 0 && (
              <span className={h.link} aria-hidden="true">
                <i style={{ transform: vertical ? `scaleY(${link})` : `scaleX(${link})` }} />
              </span>
            )}
            <span className={h.node}>
              <svg viewBox="0 0 40 44" className={h.hex} aria-hidden="true">
                <polygon points="20,2 37,11.5 37,32.5 20,42 3,32.5 3,11.5" />
              </svg>
              <Icon />
            </span>
            <span className={h.nodeName}>{p.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Hud({ game, layout }: { game: GameId; layout: "tv" | "tablet" }) {
  const g = GAMES[game];
  const { score, combo, phase, timeLeft, duration, metricValue, metricPct, expr, say, lives } = useHud();
  const tv = layout === "tv";
  const elapsedFrac = 1 - timeLeft / duration;
  const segs = 10;
  const lit = Math.round(metricPct * segs);

  const scoreBlock = (
    <div className={`${h.plaque} ${h.scorePlaque}`}>
      <div className={h.scoreHead}>
        <span className={h.label}>Puntaje</span>
        {lives !== null && (
          <span className={h.lives} aria-label={`${lives} vidas`}>
            {[0, 1, 2].map((i) => (
              <Heart key={i} className={i < lives ? h.lifeOn : h.lifeOff} />
            ))}
          </span>
        )}
      </div>
      <Score value={score} />
      {combo > 1 && (
        <span key={combo} className={h.combo}>
          <small>combo</small>x{combo}
        </span>
      )}
    </div>
  );

  const timeBlock = (
    <div className={`${h.plaque} ${h.timePlaque}`}>
      <span className={h.label}>Tiempo</span>
      <TimeRing timeLeft={timeLeft} duration={duration} size={tv ? 100 : 78} />
    </div>
  );

  const metricBlock = (
    <div className={`${h.plaque} ${h.metricPlaque}`}>
      <span className={h.label}>{g.metricLabel}</span>
      <span className={h.metric}>{metricValue}</span>
      <span className={h.segs} aria-hidden="true">
        {Array.from({ length: segs }, (_, i) => (
          <i key={i} className={i < lit ? h.on : ""} />
        ))}
      </span>
    </div>
  );

  const phaseBlock = (
    <div className={`${h.plaque} ${h.phasePlaque} ${phase === 3 ? h.phaseCaos : ""}`}>
      <span className={h.label}>{phase === 3 ? "¡Caos operativo!" : "Nivel de agentes"}</span>
      <PhaseMap phase={phase} elapsedFrac={elapsedFrac} vertical={tv} />
    </div>
  );

  const bgenBlock = (
    <div className={h.bgen}>
      <BGen expr={expr} size={tv ? 84 : 64} talkKey={say?.id} aura={phase >= 1} glow={false} float={false} />
      {say && tv && (
        <p key={say.id} className={`bubble bubble-left ${h.say}`}>
          {say.text}
        </p>
      )}
    </div>
  );

  // leyenda de controles: ícono + nombre corto (la explicación completa está en el briefing y al arrancar)
  const controls = (
    <div className={h.controls}>
      {g.controls.map((c) => (
        <div key={c.label} className={h.control} title={c.label}>
          <GestureIcon gesture={c.gesture} size={tv ? 44 : 36} />
          <span>{c.short}</span>
        </div>
      ))}
    </div>
  );

  if (tv) {
    return (
      <aside className={h.wrap}>
        <TechFrame tab={0.5} />
        <div className={h.sidebar}>
          <span className={h.title}>{g.name}</span>
          {bgenBlock}
          {scoreBlock}
          <div className={h.row2}>
            {timeBlock}
            {metricBlock}
          </div>
          {phaseBlock}
          {controls}
        </div>
      </aside>
    );
  }
  return (
    <aside className={h.wrap}>
      <TechFrame tab={0.3} />
      <div className={h.bottom}>
        {bgenBlock}
        {scoreBlock}
        {timeBlock}
        {metricBlock}
        {phaseBlock}
        {controls}
      </div>
    </aside>
  );
}

/** Globo de diálogo de BGen sobre el escenario (en tablet la barra inferior es muy baja). */
export function SayOverlay() {
  const say = useHud((st) => st.say);
  if (!say) return null;
  return (
    <p key={say.id} className={h.sayOverlay}>
      {say.text}
    </p>
  );
}
