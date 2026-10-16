"use client";

import { useEffect, useState } from "react";
import { Crosshair, Play, Plug, Zap } from "lucide-react";
import FoeCards from "../FoeCards";
import GameStage from "../GameStage";
import GestureIcon from "../GestureIcon";
import Header, { Steps } from "../Header";
import { accentVars, GAMES, type TipIcon } from "@/lib/games";
import { useSession } from "@/lib/store";
import { sfx } from "@/lib/audio";
import s from "./screens.module.css";

const AUTO_START = 15;
/** Perímetro del anillo de la cuenta regresiva (r = 19). */
const RING = 2 * Math.PI * 19;

/**
 * Pantalla intermedia: levanta el hype antes de jugar. A la izquierda, el
 * escenario del juego (su mundo, BGen y los Problemones); a la derecha, la misión,
 * cómo se juega en 3 golpes de vista, a qué te enfrentás y el CTA con la cuenta.
 */
export default function Briefing({ durationSec }: { layout: "tv" | "tablet"; durationSec: number }) {
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
  const secs = Math.max(0, left);
  return (
    <section className="frame" style={accentVars(game) as React.CSSProperties}>
      <div className="sheet">
        <div className={s.dots} />
        <Header right={<Steps current={3} />} />

        <div className={s.briefGrid}>
          <GameStage game={game} say={`${player ? `¡Vamos, ${player.firstName}! ` : ""}Acompañame a ${g.mission}.`} />

          <div className={s.briefMain}>
            <p className={s.briefKicker}>
              <Zap size="1.2em" strokeWidth={2.4} aria-hidden="true" /> ¡Estás por jugar!
            </p>
            <h1 className={s.mission}>
              Acompañá a BGen a <em>{g.mission}</em>
            </h1>

            <ol className={s.tips} aria-label="Cómo se juega" style={{ "--n": g.tips.length } as React.CSSProperties}>
              {g.tips.map((t, i) => (
                <li key={t.verb} className={s.tip} style={{ animationDelay: `${0.25 + i * 0.1}s` }}>
                  <span className={s.tipIcon}>
                    <span className={s.tipNum}>{i + 1}</span>
                    <TipGlyph icon={t.icon} />
                  </span>
                  <span className={s.tipText}>
                    <b>{t.verb}</b>
                    {t.text}
                  </span>
                </li>
              ))}
            </ol>

            <FoeCards game={game} delay={0.55} />

            <div className={s.goRow}>
              <button
                className={`btn btn-lg ${s.go}`}
                onClick={() => {
                  sfx("ui.start");
                  go("play");
                }}
              >
                <Play size="0.85em" fill="currentColor" strokeWidth={0} aria-hidden="true" /> ¡A jugar!
              </button>
              <span className={s.timer} aria-hidden="true">
                <svg viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="19" className={s.ringBg} />
                  <circle cx="22" cy="22" r="19" className={s.ringFg} style={{ strokeDashoffset: RING * (1 - secs / AUTO_START) }} />
                </svg>
                <b key={secs}>{secs}</b>
              </span>
              <span className={s.timerText}>
                Arranca solo en {secs} s<br />
                <b>{durationSec} s</b> de juego
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TipGlyph({ icon }: { icon: TipIcon }) {
  if (icon === "plug") return <Plug strokeWidth={2.2} aria-hidden="true" />;
  if (icon === "auto") return <Zap strokeWidth={2.2} aria-hidden="true" />;
  if (icon === "target") return <Crosshair strokeWidth={2.2} aria-hidden="true" />;
  return <GestureIcon gesture={icon} size={56} />;
}
