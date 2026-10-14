"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BGen from "../BGen";
import { BGenAILogo, BizitLogo } from "../Logos";
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
  const router = useRouter();
  const [line, setLine] = useState(0);
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const press = useRef<number | undefined>(undefined);

  useEffect(() => {
    const t = window.setInterval(() => setLine((l) => (l + 1) % LINES.length), 4200);
    todayEntries().then((r) => setRanking(r.slice(0, 5)));
    return () => window.clearInterval(t);
  }, []);

  // mantener apretado el logo 3 s abre la configuración del kiosco
  const startPress = (e: React.PointerEvent) => {
    e.stopPropagation();
    press.current = window.setTimeout(() => router.push("/config"), 3000);
  };
  const endPress = () => window.clearTimeout(press.current);

  const current = LINES[line];
  return (
    <section className={`${s.screen} ${s.attract}`} onClick={() => go("register")} aria-label="Tocá para jugar">
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

      <header className={s.topbar}>
        <div className={s.brandRow} onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress} onClick={(e) => e.stopPropagation()}>
          <BizitLogo height={44} />
          <span className={s.presenta}>presenta</span>
          <BGenAILogo height={34} />
        </div>
        <span className="eyebrow">{config.stand}</span>
      </header>

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
        <div className={s.heroRight}>
          <p key={line} className={s.bubble}>
            {current.text}
          </p>
          <BGen expr={current.expr} size="min(34vh, 380px)" followPointer talkKey={line} />
          <div className={`panel ${s.ranking}`}>
            <h3>
              Ranking de hoy <span className="eyebrow">🏆 top 5</span>
            </h3>
            {ranking.length === 0 && <p className={s.empty}>Todavía nadie jugó hoy. ¡Sé el primero!</p>}
            {ranking.map((r, i) => (
              <div className={s.rankRow} key={`${r.name}-${r.at}`}>
                <span className={s.rankPos}>{i + 1}</span>
                <span>
                  {r.name} <span className="eyebrow" style={{ fontSize: "0.7em" }}>{GAMES[r.game]?.name}</span>
                </span>
                <span className={s.rankScore}>{r.score.toLocaleString("es-AR")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
