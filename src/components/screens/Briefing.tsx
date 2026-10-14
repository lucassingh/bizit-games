"use client";

import { useEffect, useState } from "react";
import BGen from "../BGen";
import GestureIcon from "../GestureIcon";
import Header, { Steps } from "../Header";
import { accentVars, GAMES, PHASES } from "@/lib/games";
import { useSession } from "@/lib/store";
import s from "./screens.module.css";

const AUTO_START = 15;

/** Pantalla intermedia: presenta a BGen, el objetivo y los gestos antes de jugar. */
export default function Briefing({ layout, durationSec }: { layout: "tv" | "tablet"; durationSec: number }) {
  const { game, player, go } = useSession();
  const [left, setLeft] = useState(AUTO_START);

  useEffect(() => {
    const t = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) go("play");
  }, [left, go]);

  if (!game) return null;
  const g = GAMES[game];
  return (
    <section className="frame" style={accentVars(game) as React.CSSProperties}>
      <div className="sheet">
        <div className={s.dots} />
        <Header right={<Steps current={3} />} />

        <div className={s.briefGrid}>
          <div className={s.briefHero}>
            <p className="bubble">
              {player ? `¡Vamos, ${player.firstName}! ` : ""}Acompañame a {g.mission}.
            </p>
            <BGen expr="logro" size={layout === "tv" ? "min(40vh, 400px)" : "min(36vh, 320px)"} talkKey="hola" aura followPointer />
          </div>
          <div className="rise">
            <span className="panel-title">{g.name}</span>
            <h1 className={s.mission}>
              Acompañá a BGen a <em>{g.mission}</em>
            </h1>
            <p className={s.howTo}>{g.howTo}</p>
            <div className={s.phases}>
              {g.steps.map((step, i) => (
                <div key={step} className={s.phaseCard} style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
                  <span className={s.planChip}>
                    {i + 1} · {PHASES[i].name}
                  </span>
                  <b>{step}</b>
                </div>
              ))}
            </div>
            <div className={s.controlsRow}>
              {g.controls.map((c) => (
                <div key={c.label} className={s.control}>
                  <GestureIcon gesture={c.gesture} size={48} />
                  {c.label}
                </div>
              ))}
            </div>
            <div className={s.goRow}>
              <button className="btn btn-lg" onClick={() => go("play")}>
                ¡Vamos!
              </button>
              <span className={s.countdown}>
                Empieza solo en {Math.max(0, left)} s · {durationSec} s de juego
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
