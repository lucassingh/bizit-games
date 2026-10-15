"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import BGen from "../BGen";
import Header from "../Header";
import { BIZIT_MARK_PATH } from "@/lib/brand";
import { useSession } from "@/lib/store";
import { todayEntries, type RankEntry } from "@/lib/ranking";
import { GAMES } from "@/lib/games";
import type { KioskConfig } from "@/lib/config";
import type { Expr } from "@/games/types";
import s from "./screens.module.css";

const LINES: { text: string; expr: Expr }[] = [
  { text: "¡Hola! Soy BGen, el agente de IA de Bizit.", expr: "reposo" },
  { text: "Yo no chateo: ejecuto. ¿Me ayudás?", expr: "curioso" },
  { text: "Mails, facturas, reportes… ¡los resuelvo yo!", expr: "procesando" },
  { text: "90 segundos y te digo qué tan lista está tu empresa.", expr: "logro" },
];

/** Pantalla de espera (attract loop): invita a jugar y muestra el ranking del día. */
export default function Attract({ config }: { config: KioskConfig }) {
  const go = useSession((st) => st.go);
  const [line, setLine] = useState(0);
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  void config;

  useEffect(() => {
    const t = window.setInterval(() => setLine((l) => (l + 1) % LINES.length), 4200);
    todayEntries().then((r) => setRanking(r.slice(0, 20)));
    return () => window.clearInterval(t);
  }, []);

  const current = LINES[line];
  return (
    <section className={`frame ${s.attract}`} onClick={() => go("register")} aria-label="Tocá para jugar">
      <div className="sheet">
        <div className={s.dots} />
        <svg className={s.bgLoop} viewBox="0 0 120 100" aria-hidden="true">
          <defs>
            <linearGradient id="loop-g" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FE8100" />
              <stop offset="1" stopColor="#E80000" />
            </linearGradient>
          </defs>
          <path d={BIZIT_MARK_PATH} fill="url(#loop-g)" />
        </svg>

        <Header />

        <div className={s.attractGrid}>
          <div className="rise">
            <p className={s.kicker}>¿Tu empresa está lista para la</p>
            <span className={s.giant}>IA?</span>
            <p className={s.lede}>
              Ayudá a <b>BGen</b> a ordenar una empresa en 90 segundos y descubrí tu nivel de madurez en IA.
            </p>
            <button className={`btn btn-lg ${s.ctaPulse}`} onClick={() => go("register")}>
              Tocá para jugar
            </button>
          </div>

          <div className={s.heroCenter}>
            <p key={line} className="bubble">
              {current.text}
            </p>
            <BGen expr={current.expr} size="min(36vh, 340px)" followPointer talkKey={line} />
          </div>

          <aside className={`panel ${s.rankPanel}`} onClick={(e) => e.stopPropagation()} aria-label="Ranking de hoy">
            <div className={s.rankHead}>
              <h3>Ranking de hoy</h3>
              <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Trophy size={14} strokeWidth={2.4} color="var(--orange)" /> Top 20
              </span>
            </div>
            <div className={`${s.rankList} scroll-subtle`}>
              {ranking.length === 0 && <p className={s.empty}>Todavía nadie jugó hoy. ¡Sé el primero!</p>}
              {ranking.map((r, i) => (
                <div className={s.rankRow} key={`${r.name}-${r.at}`}>
                  <span className={s.rankPos}>{i + 1}</span>
                  <span className={s.rankName}>
                    <span>{r.name}</span>
                    <span className={s.rankGame}>{GAMES[r.game]?.name}</span>
                  </span>
                  <span className={s.rankScore}>{r.score.toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
