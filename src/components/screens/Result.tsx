"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Clock, Medal, Trophy } from "lucide-react";
import BGen from "../BGen";
import Header from "../Header";
import { accentVars, GAMES } from "@/lib/games";
import { LEVEL_COPY } from "@/lib/scoring";
import { useSession } from "@/lib/store";
import { abandon } from "../Experience";
import r from "./result.module.css";

const CTA_URL = process.env.NEXT_PUBLIC_CTA_URL || "https://bgenai.bizitglobal.com/";
const AUTO_MS = 40000;

/**
 * Secuencia (ms desde que entra la pantalla):
 *  0    sello "¡NIVEL COMPLETO!" cae con golpe
 *  500  estrellas, una por una, con destello
 *  1500 puntaje cuenta desde cero (1,4 s)
 *  3000 nivel + frase
 *  3500 medallas
 *  4000 CTA y botones
 */
const T = { stamp: 0, stars: 500, score: 1500, level: 3000, medals: 3500, cta: 4000 };

function useStage() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const e = performance.now() - t0;
      setMs(e);
      if (e < 6000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return ms;
}

function CountUp({ to, start, duration = 1400 }: { to: number; start: boolean; duration?: number }) {
  const [v, setV] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (!start || done.current) return;
    done.current = true;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(to * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, to, duration]);
  return <>{v.toLocaleString("es-AR")}</>;
}

const STAR = "M50 6 L62 36 L94 38 L69 59 L77 92 L50 74 L23 92 L31 59 L6 38 L38 36 Z";

function Star({ on, show }: { on: boolean; show: boolean }) {
  return (
    <span className={`${r.star} ${show ? r.starIn : ""}`}>
      <svg viewBox="0 0 100 106" aria-hidden="true">
        <defs>
          <linearGradient id="star-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFD166" />
            <stop offset="1" stopColor="#F75D00" />
          </linearGradient>
        </defs>
        {/* sombra dura, como los botones y placas del kit */}
        <path d={STAR} transform="translate(0 7)" fill={on ? "#B33F00" : "#D9D2CA"} />
        <path d={STAR} fill={on ? "url(#star-g)" : "#ECE7E1"} />
        {on && <circle cx="40" cy="36" r="5" fill="#fff" opacity=".85" />}
      </svg>
      {on && show && <i className={r.burst} aria-hidden="true" />}
    </span>
  );
}

/** Resultado con secuencia de "nivel completo", diagnóstico y CTA comercial. */
export default function Result() {
  const { result, player, go } = useSession();
  const [qr, setQr] = useState("");
  const ms = useStage();

  useEffect(() => {
    QRCode.toString(CTA_URL, { type: "svg", margin: 0, color: { dark: "#212529", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
  }, []);

  if (!result) return null;
  const g = GAMES[result.game];
  const copy = LEVEL_COPY[result.level];
  const at = (k: keyof typeof T) => ms >= T[k];

  return (
    <section className="frame" style={accentVars(result.game) as React.CSSProperties}>
      <div className="sheet">
        <Header />
        <div className={r.grid}>
          <div className={r.main}>
            <div className={`${r.stamp} ${at("stamp") ? r.stampIn : ""}`}>
              <span>¡Nivel completo!</span>
            </div>

            <div className={r.stars}>
              {[1, 2, 3].map((i) => (
                <Star key={i} on={result.stars >= i} show={ms >= T.stars + (i - 1) * 260} />
              ))}
            </div>

            <div className={`${r.scoreBlock} ${at("score") ? r.in : ""}`}>
              <span className={r.scoreLabel}>{player ? `${player.firstName}, tu puntaje en ${g.name}` : `Tu puntaje en ${g.name}`}</span>
              <span className={r.score}>
                <CountUp to={result.score} start={at("score")} />
              </span>
            </div>

            <div className={`${r.level} ${at("level") ? r.in : ""}`}>
              <span className={r.levelTag}>Nivel de madurez IA</span>
              <span className={r.levelName}>{copy.title}</span>
              <p className={r.phrase}>{copy.phrase}</p>
            </div>

            <div className={r.medals}>
              {[
                { icon: <Trophy />, label: "Ranking de hoy", value: `#${result.rank}`, sub: `de ${result.total}`, tone: r.toneOrange },
                { icon: <Clock />, label: "Horas ahorradas/mes", value: `${result.hours} h`, sub: "estimación", tone: r.toneIa },
                { icon: <Medal />, label: result.metricLabel, value: result.metricValue, sub: g.name, tone: r.toneInk },
              ].map((m, i) => (
                <div key={m.label} className={`${r.medal} ${m.tone} ${ms >= T.medals + i * 180 ? r.in : ""}`}>
                  <span className={r.medalIcon}>{m.icon}</span>
                  <span className={r.medalValue}>{m.value}</span>
                  <span className={r.medalLabel}>{m.label}</span>
                  <span className={r.medalSub}>{m.sub}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`${r.side} ${at("cta") ? r.in : ""}`}>
            <BGen expr="logro" size="min(20vh, 170px)" aura talkKey="fin" />
            <div className={`panel ${r.cta}`}>
              <h3>Un especialista de Bizit te va a contactar para tu discovery gratuito</h3>
              {qr && <div className={r.qr} dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR a bgenai.bizitglobal.com" />}
              <span className="eyebrow">Escaneá y conocé BGenAI</span>
            </div>
            <div className={r.actions}>
              <button className="btn btn-light" onClick={() => go("select")}>
                Jugar de nuevo
              </button>
              <button className="btn" onClick={() => abandon()}>
                Terminar
              </button>
            </div>
          </div>
        </div>
        {at("cta") && (
          <div className={r.autoBar}>
            <i style={{ animationDuration: `${AUTO_MS - T.cta}ms` }} />
          </div>
        )}
      </div>
    </section>
  );
}
