"use client";
/* eslint-disable @next/next/no-img-element -- sprites estáticos cacheados por el service worker: sin el optimizador de next/image, el kiosco funciona offline */

import { Ban } from "lucide-react";
import BGen from "./BGen";
import { Cloud, FlyerArt } from "./Flyer";
import { GAMES, type GameId } from "@/lib/games";
import st from "./gamestage.module.css";

/**
 * Escenario del briefing: un "tráiler" del juego que está por empezar, con su
 * mundo, BGen y los Problemones de ese juego (riel de datos, gomera y torre, o la
 * lluvia de tareas en la Casa Central). Todo en unidades del escenario (cq).
 */
export default function GameStage({ game, say }: { game: GameId; say: string }) {
  return (
    <div className={`${st.stage} ${st[game]}`}>
      <div className={st.art} aria-hidden="true">
        {game === "compania" && <Compania />}
        {game === "deploy" && <Deploy />}
        {game === "central" && <Central />}
      </div>
      <span className={st.title}>{GAMES[game].name}</span>
      <p className={`bubble bubble-left ${st.say}`}>{say}</p>
    </div>
  );
}

type Thing = { k: string; x: number; y: number; s: number; r?: number };

/** Un objeto quieto que flota (entra con un pop escalonado). */
function Float({ k, x, y, s, r = 0, i, className }: Thing & { i: number; className?: string }) {
  const style = { left: `${x}%`, top: `${y}%`, "--s": s, "--r": `${r}deg`, "--d": `${0.2 + i * 0.08}s`, "--t": `${2.6 + (i % 3) * 0.45}s` } as React.CSSProperties;
  return (
    <span className={`${st.float} ${className ?? ""}`} style={style}>
      <span className={st.bob}>
        {k === "conector" ? <img src="/sprites/home/conector.png" alt="" draggable={false} /> : <FlyerArt k={k} />}
      </span>
    </span>
  );
}

/* ---------- La Compañía: BGen corre por el riel de datos hacia la empresa ---------- */
const COMPANIA: Thing[] = [
  { k: "excel", x: 46, y: 54, s: 6, r: -6 },
  { k: "fantasma", x: 59, y: 59, s: 8.5, r: 8 },
  { k: "mail", x: 35, y: 66, s: 8, r: -8 },
  { k: "conector", x: 53, y: 51, s: 4 },
  { k: "conector", x: 86, y: 86, s: 9 },
  { k: "conector", x: 18, y: 82, s: 9 },
];

function Compania() {
  return (
    <>
      <div className={st.skyDay} />
      <div className={st.groundCity} />
      <img className={st.cityPan} src="/sprites/deploy/city.webp" alt="" draggable={false} />
      <svg className={st.rail} viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points="44,0 56,0 96,100 4,100" className={st.railBed} />
        <polyline points="44,0 4,100" className={st.railEdge} />
        <polyline points="56,0 96,100" className={st.railEdge} />
        <polyline points="48,0 34,100" className={st.railLane} />
        <polyline points="52,0 66,100" className={st.railLane} />
      </svg>
      {COMPANIA.map((t, i) => (
        <Float key={i} {...t} i={i} className={t.k === "conector" ? st.plug : undefined} />
      ))}
      <div className={`${st.hero} ${st.run}`}>
        <BGen expr="concentrado" size="var(--hero)" aura float={false} />
      </div>
    </>
  );
}

/* ---------- Torre del Caos: la gomera con BGen y la torre con Problemones ---------- */
function Deploy() {
  return (
    <>
      <div className={st.skyDay} />
      <Cloud className={st.cloud} style={{ left: "38%", top: "10%", width: "26%" }} />
      <Cloud className={st.cloud} style={{ left: "72%", top: "20%", width: "20%", animationDelay: "-6s" }} />
      <img className={st.cityPan} src="/sprites/deploy/city.webp" alt="" draggable={false} />
      <div className={st.ground} />
      <svg className={st.arc} viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M17 54 Q 42 2 66 40" />
      </svg>
      <svg className={st.sling} viewBox="0 0 60 100">
        <path d="M30 100V52" className={st.slingWood} />
        <path d="M30 56L14 12M30 56L46 12" className={st.slingWood} />
        <path d="M14 14L-4 38L46 14" className={st.slingBand} />
      </svg>
      <div className={`${st.hero} ${st.loaded}`}>
        <BGen expr="concentrado" size="var(--hero)" aura />
      </div>
      <div className={st.tower}>
        <img className={st.crateL1} src="/sprites/physics/wood-square.png" alt="" draggable={false} />
        <img className={st.crateL2} src="/sprites/physics/wood-square.png" alt="" draggable={false} />
        <img className={st.crateR2} src="/sprites/physics/glass-tall.png" alt="" draggable={false} />
        <img className={st.plank} src="/sprites/physics/wood-long.png" alt="" draggable={false} />
        <span className={st.onTop}>
          <span className={st.bob}>
            <FlyerArt k="mail" />
          </span>
          <span className={st.bob} style={{ animationDelay: "-1.2s" }}>
            <FlyerArt k="fantasma" />
          </span>
        </span>
        <span className={st.inside}>
          <FlyerArt k="caja" />
        </span>
      </div>
    </>
  );
}

/* ---------- Lluvia de Tareas: las tareas caen sobre la Casa Central y BGen dispara ---------- */
const RAIN: { k: string; x: number; s: number; t: number; d: number; spin: number }[] = [
  { k: "mail", x: 16, s: 8, t: 6.4, d: -1, spin: 40 },
  { k: "excel", x: 30, s: 7.5, t: 7.2, d: -4.2, spin: -50 },
  { k: "factura", x: 66, s: 9, t: 6, d: -2.6, spin: 30 },
  { k: "fantasma", x: 84, s: 8.5, t: 7.8, d: -5.6, spin: -30 },
  { k: "gold", x: 55, s: 5.5, t: 5.4, d: -0.4, spin: 60 },
  { k: "delete", x: 76, s: 5, t: 6.8, d: -3.8, spin: 0 },
  { k: "caja", x: 22, s: 7, t: 8.4, d: -6.8, spin: 25 },
  { k: "sobre", x: 92, s: 3.8, t: 5.8, d: -2, spin: -70 },
];

function Central() {
  return (
    <>
      <img className={st.hqNight} src="/sprites/deploy/hq-night.webp" alt="" draggable={false} />
      <div className={st.nightShade} />
      {RAIN.map((r, i) => (
        <span
          key={i}
          className={st.fall}
          // --y: dónde queda si no hay animaciones (la misma altura en la que arranca la caída)
          style={{ left: `${r.x}%`, "--s": r.s, "--t": `${r.t}s`, "--d": `${r.d}s`, "--spin": `${r.spin}deg`, "--y": `${((-r.d / r.t) * 120 - 16).toFixed(1)}cqh` } as React.CSSProperties}
        >
          {r.k === "delete" ? (
            <span className={st.delete}>
              <Ban strokeWidth={2.6} />
            </span>
          ) : r.k === "gold" ? (
            <FlyerArt k="doc" className={st.gold} />
          ) : (
            <FlyerArt k={r.k} />
          )}
        </span>
      ))}
      <span className={st.target}>
        <FlyerArt k="mail" />
        <b className={st.plus}>+100</b>
      </span>
      <span className={st.beam} />
      <div className={st.street} />
      <div className={`${st.hero} ${st.shooter}`}>
        <BGen expr="procesando" size="var(--hero)" aura />
      </div>
    </>
  );
}
