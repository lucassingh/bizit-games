"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import BGen from "../BGen";
import { BGenAILogo, BizitLogo } from "../Logos";
import { accentVars, GAMES } from "@/lib/games";
import { LEVEL_COPY } from "@/lib/scoring";
import { useSession } from "@/lib/store";
import { abandon } from "../Experience";
import s from "./screens.module.css";

const CTA_URL = process.env.NEXT_PUBLIC_CTA_URL || "https://bgenai.bizitglobal.com/";
const AUTO_MS = 30000;

function Star({ on, delay }: { on: boolean; delay: number }) {
  return (
    <svg viewBox="0 0 100 100" style={{ animationDelay: `${delay}s` }} aria-hidden="true">
      <path
        d="M50 6 L62 36 L94 38 L69 59 L77 92 L50 74 L23 92 L31 59 L6 38 L38 36 Z"
        fill={on ? "url(#star-g)" : "#E6E1DC"}
        stroke={on ? "#b84400" : "#d3cbc2"}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="star-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB13B" />
          <stop offset="1" stopColor="#F75D00" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Resultado con estética de "nivel completo" + diagnóstico + CTA comercial. */
export default function Result() {
  const { result, player, go } = useSession();
  const [qr, setQr] = useState("");

  useEffect(() => {
    QRCode.toString(CTA_URL, { type: "svg", margin: 0, color: { dark: "#212529", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
  }, []);

  if (!result) return null;
  const g = GAMES[result.game];
  const copy = LEVEL_COPY[result.level];
  return (
    <section className={s.screen} style={accentVars(result.game) as React.CSSProperties}>
      <div className={s.dots} />
      <header className={s.topbar}>
        <BizitLogo height={40} />
        <BGenAILogo height={30} />
      </header>
      <div className={s.resultGrid}>
        <div className={`panel ${s.resultPanel}`}>
          <div className={s.panelTitleWrap}>
            <span className="panel-title" style={{ fontSize: "calc(24 * var(--u))", padding: "calc(12 * var(--u)) calc(28 * var(--u))" }}>
              ¡Nivel completo!
            </span>
          </div>
          <div className={s.stars}>
            {[1, 2, 3].map((i) => (
              <Star key={i} on={result.stars >= i} delay={0.2 + i * 0.18} />
            ))}
          </div>
          <span className="eyebrow">{player ? `${player.firstName}, tu puntaje en ${g.name}` : `Tu puntaje en ${g.name}`}</span>
          <span className={s.bigScore}>{result.score.toLocaleString("es-AR")}</span>
          <p className={s.levelName}>
            Nivel <span>{copy.title}</span>
          </p>
          <p style={{ fontSize: "calc(20 * var(--u))", textAlign: "center", maxWidth: "36ch" }}>{copy.phrase}</p>
          <div className={s.statsRow}>
            <div className="stat">
              <span className="stat-icon">🏆</span>
              <span>
                <span className={s.statLabel}>Ranking de hoy</span>
                <span className="stat-value">
                  #{result.rank}
                  <small style={{ fontSize: "0.5em", color: "var(--muted)" }}> de {result.total}</small>
                </span>
              </span>
            </div>
            <div className="stat">
              <span className="stat-icon" style={{ background: "var(--grad-ia)", color: "var(--negro)" }}>
                ⏱
              </span>
              <span>
                <span className={s.statLabel}>Horas ahorradas/mes*</span>
                <span className="stat-value">{result.hours} h</span>
              </span>
            </div>
            <div className="stat">
              <span className="stat-icon">★</span>
              <span>
                <span className={s.statLabel}>{result.metricLabel}</span>
                <span className="stat-value">{result.metricValue}</span>
              </span>
            </div>
          </div>
          <small style={{ color: "var(--muted)" }}>*Estimación lúdica según tu puntaje.</small>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "calc(18 * var(--u))", alignItems: "center" }}>
          <BGen expr="logro" size="min(22vh, 220px)" aura talkKey="fin" />
          <div className={`panel ${s.cta}`}>
            <h3>Un especialista de Bizit te va a contactar para tu discovery gratuito</h3>
            {qr && <div className={s.qr} dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR a bgenai.bizitglobal.com" />}
            <span className="eyebrow">Escaneá y conocé BGenAI</span>
          </div>
          <div className={s.resultActions}>
            <button className="btn btn-light" onClick={() => go("select")}>
              Jugar de nuevo
            </button>
            <button className="btn" onClick={() => abandon()}>
              Terminar
            </button>
          </div>
        </div>
      </div>
      <div className={s.autoBar}>
        <i style={{ animationDuration: `${AUTO_MS}ms` }} />
      </div>
    </section>
  );
}
