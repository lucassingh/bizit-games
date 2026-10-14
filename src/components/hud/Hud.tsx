"use client";

import BGen from "../BGen";
import GestureIcon from "../GestureIcon";
import { GAMES, PHASES, type GameId } from "@/lib/games";
import { useHud } from "@/lib/store";
import h from "./hud.module.css";

/**
 * HUD común: barra lateral en TV y barra inferior en tablet (según los
 * prototipos). Puntaje, tiempo, combo, fase, métrica estrella, BGen y gestos.
 */
export default function Hud({ game, layout }: { game: GameId; layout: "tv" | "tablet" }) {
  const g = GAMES[game];
  const { score, combo, phase, timeLeft, duration, metricValue, metricPct, expr, say } = useHud();
  const secs = Math.max(0, Math.ceil(timeLeft));
  const low = secs <= 10;

  const scoreBlock = (
    <div className={h.block}>
      <span className={h.label}>Puntaje</span>
      <div className={h.scoreRow}>
        <span className={h.score}>{score.toLocaleString("es-AR")}</span>
        {combo > 1 && (
          <span key={combo} className={h.combo}>
            x{combo}
          </span>
        )}
      </div>
    </div>
  );

  const timeBlock = (
    <div className={h.block}>
      <span className={h.label}>Tiempo</span>
      <div className={h.timeRow}>
        <span className={`${h.time} ${low ? h.low : ""}`}>
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
        </span>
        <div className="bar bizit" style={{ flex: 1 }}>
          <i style={{ width: `${(timeLeft / duration) * 100}%` }} />
        </div>
      </div>
    </div>
  );

  const phaseBlock = (
    <div className={h.block}>
      <span className={h.label}>Nivel de agentes</span>
      <span className="ticks" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < phase ? "on" : i === phase ? "now" : ""} />
        ))}
      </span>
      <ol className={h.phases}>
        {PHASES.slice(0, 3).map((p, i) => (
          <li key={p.key} className={i < phase ? h.done : i === phase ? h.now : ""}>
            <span>{i + 1}</span>
            {p.name}
          </li>
        ))}
      </ol>
      {phase === 3 && <span className={h.climax}>¡El Caos Operativo!</span>}
    </div>
  );

  const metricBlock = (
    <div className={h.block}>
      <span className={h.label}>{g.metricLabel}</span>
      <div className={h.metricRow}>
        <span className={h.metric}>{metricValue}</span>
      </div>
      <div className="bar">
        <i style={{ width: `${Math.round(metricPct * 100)}%` }} />
      </div>
    </div>
  );

  const bgenBlock = (
    <div className={h.bgen}>
      <BGen expr={expr} size={layout === "tv" ? 96 : 76} talkKey={say?.id} aura={phase >= 1} glow={false} float={false} />
      {say && layout === "tv" && (
        <p key={say.id} className={h.say}>
          {say.text}
        </p>
      )}
    </div>
  );

  const controls = (
    <div className={h.controls}>
      {g.controls.map((c) => (
        <div key={c.label} className={h.control}>
          <GestureIcon gesture={c.gesture} size={layout === "tv" ? 54 : 40} />
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  );

  if (layout === "tv") {
    return (
      <aside className={`tech-shadow ${h.wrap}`}>
        <div className={`tech ${h.sidebar}`}>
        <span className="tech-line" aria-hidden="true" />
        <span className="panel-title">{g.name}</span>
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
  return (
    <aside className={`tech-shadow ${h.wrap}`}>
      <div className={`tech ${h.bottom}`}>
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
