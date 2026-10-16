"use client";

import { useEffect, useState } from "react";
import { Gamepad2, Play, Trophy, Users } from "lucide-react";
import BGen from "../BGen";
import Header from "../Header";
import { Cloud, FlyerArt } from "../Flyer";
import { DECAGON_PATH } from "@/lib/brand";
import { useSession } from "@/lib/store";
import { todayEntries, type RankEntry } from "@/lib/ranking";
import { GAMES } from "@/lib/games";
import type { KioskConfig } from "@/lib/config";
import type { Expr } from "@/games/types";
import h from "./home.module.css";

const LINES: { text: string; expr: Expr }[] = [
  { text: "¡Hola! Soy BGen, el agente de IA de Bizit.", expr: "reposo" },
  { text: "¡Me encanta automatizar procesos en las empresas!", expr: "logro" },
  { text: "Mails, facturas, reportes… ¡los resuelvo yo!", expr: "procesando" },
  { text: "90 segundos y te digo qué tan lista está tu empresa.", expr: "logro" },
];

/** Centro de BGen en la portada (% del ancho y del alto): de ahí "explota" todo. */
const BX = 57, BY = 50;

/**
 * Lo que vuela en la portada. `k`: un Problemón (nombre del sprite), una hoja
 * ("doc" | "sobre" | "grafico"), un escombro ("wood" | "glass") o una chispa de
 * color ("bit-o" | "bit-c" | "bit-l"). `s`: alto en % de la portada.
 * Capas: `far` queda dentro del recorte diagonal (lejos, desenfocado); `back` y
 * `front` van por detrás / delante de BGen y pueden salirse del marco.
 */
type Layer = "far" | "back" | "front";
type Item = { k: string; x: number; y: number; s: number; r: number; l: Layer; hit?: boolean };
const ITEMS: Item[] = [
  // lejos
  { k: "botella", x: 12, y: 10, s: 4.5, r: -18, l: "far" },
  { k: "mail", x: 50, y: 7, s: 4, r: 8, l: "far" },
  { k: "caja", x: 27, y: 47, s: 4.5, r: -10, l: "far" },
  { k: "excel", x: 84, y: 36, s: 4.5, r: 12, l: "far" },
  { k: "factura", x: 41, y: 25, s: 4, r: -16, l: "far" },
  { k: "doc", x: 66, y: 17, s: 2.6, r: 30, l: "far" },
  { k: "doc", x: 19, y: 58, s: 2.4, r: -20, l: "far" },
  { k: "sobre", x: 79, y: 43, s: 2.2, r: 16, l: "far" },
  // detrás de BGen
  { k: "fantasma", x: 10, y: 31, s: 21, r: -11, l: "back" },
  { k: "mail", x: 90, y: 12, s: 10, r: 14, l: "back" },
  { k: "excel", x: 36, y: 9, s: 6, r: -20, l: "back" },
  { k: "factura", x: 73, y: 25, s: 6.5, r: 22, l: "back" },
  { k: "doc", x: 32, y: 17, s: 5.5, r: -24, l: "back" },
  { k: "grafico", x: 70, y: 6, s: 4.5, r: 18, l: "back" },
  { k: "sobre", x: 22, y: 22, s: 3.6, r: 40, l: "back" },
  { k: "doc", x: 47, y: 33, s: 3.2, r: -12, l: "back" },
  { k: "glass", x: 4, y: 21, s: 3, r: -10, l: "back" },
  { k: "bit-c", x: 44, y: 20, s: 1.4, r: 20, l: "back" },
  { k: "bit-l", x: 77, y: 36, s: 1.2, r: 45, l: "back" },
  { k: "bit-o", x: 30, y: 40, s: 1.3, r: 10, l: "back" },
  // delante de BGen
  { k: "caja", x: 93, y: 47, s: 12, r: 10, l: "front" },
  { k: "botella", x: 79, y: 66, s: 4.5, r: 28, l: "front" },
  { k: "mail", x: 29, y: 63, s: 5.5, r: -28, l: "front" },
  { k: "factura", x: 62, y: 80, s: 6.5, r: -14, l: "front" },
  { k: "excel", x: 11, y: 85, s: 30, r: -15, l: "front", hit: true },
  { k: "factura", x: 86, y: 86, s: 32, r: 12, l: "front" },
  { k: "doc", x: 3, y: 55, s: 5, r: -38, l: "front" },
  { k: "doc", x: 42, y: 91, s: 5.5, r: 14, l: "front" },
  { k: "sobre", x: 96, y: 29, s: 4.2, r: 32, l: "front" },
  { k: "grafico", x: 90, y: 70, s: 5, r: -18, l: "front" },
  { k: "doc", x: 97, y: 58, s: 3.6, r: -22, l: "front" },
  { k: "sobre", x: 30, y: 77, s: 4, r: -32, l: "front" },
  { k: "doc", x: 52, y: 71, s: 3.2, r: 10, l: "front" },
  { k: "wood", x: 31, y: 56, s: 4.5, r: 30, l: "front" },
  { k: "wood", x: 63, y: 93, s: 4, r: -22, l: "front" },
  { k: "wood", x: 21, y: 96, s: 3.6, r: 40, l: "front" },
  { k: "glass", x: 77, y: 57, s: 3.5, r: 12, l: "front" },
  { k: "bit-o", x: 67, y: 62, s: 1.5, r: 30, l: "front" },
  { k: "bit-c", x: 24, y: 70, s: 1.3, r: 15, l: "front" },
  { k: "bit-l", x: 88, y: 57, s: 1.4, r: 60, l: "front" },
  { k: "bit-o", x: 50, y: 87, s: 1.2, r: 0, l: "front" },
  { k: "bit-c", x: 97, y: 40, s: 1.2, r: 30, l: "front" },
  { k: "bit-l", x: 37, y: 50, s: 1.1, r: 20, l: "front" },
];

/** Rayo de BGen al Excel Zombie (coordenadas en % de la portada). */
const ZAP = "47,60 40,64 42,66 33,69.5 34.5,71.5 21,75";

/** Pantalla de espera (attract loop): portada de juego a la izquierda; copy, CTA y ranking a la derecha. */
export default function Attract({ config }: { config: KioskConfig }) {
  const go = useSession((st) => st.go);
  const [line, setLine] = useState(0);
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [played, setPlayed] = useState(0);
  void config;

  useEffect(() => {
    const t = window.setInterval(() => setLine((l) => (l + 1) % LINES.length), 4200);
    todayEntries().then((r) => {
      setPlayed(r.length);
      setRanking(r.slice(0, 100));
    });
    return () => window.clearInterval(t);
  }, []);

  const current = LINES[line];
  const layer = (l: Layer) => ITEMS.map((it, i) => (it.l === l ? <Fly key={i} it={it} i={i} /> : null));
  return (
    <section className={`frame ${h.home}`} onClick={() => go("register")} aria-label="Tocá para jugar">
      <div className={`sheet ${h.sheet}`}>
        <div className={h.coverArea} style={{ "--bx": `${BX}%`, "--by": `${BY}%` } as React.CSSProperties}>
          {/* fondo, recortado en diagonal */}
          <div className={h.coverClip} aria-hidden="true">
            <div className={h.cover}>
              <div className={h.sky} />
              <div className={h.rays} />
              <Cloud className={h.cloud} style={{ left: "-4%", top: "5%", width: "34%" }} />
              <Cloud className={h.cloud} style={{ left: "62%", top: "22%", width: "26%", animationDelay: "-7s" }} />
              <Cloud className={h.cloud} style={{ left: "36%", top: "3%", width: "15%", animationDelay: "-3s" }} />
              <img className={h.city} src="/sprites/home/cover-city.webp" alt="" draggable={false} />
              <div className={h.halo} />
              <Burst />
              {layer("far")}
            </div>
          </div>

          {/* lo que explota: sin recorte, puede salirse del marco */}
          <div className={h.pop} aria-hidden="true">
            {layer("back")}
            <svg className={h.ring} viewBox="-4 -4 136 136">
              <path d={DECAGON_PATH} />
            </svg>
            <svg className={h.zap} viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="home-zap" x1="1" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0AB6BC" />
                  <stop offset="1" stopColor="#B2F326" />
                </linearGradient>
              </defs>
              <polyline className={h.zapGlow} points={ZAP} />
              <polyline className={h.zapCore} points={ZAP} />
              <polyline className={h.zapHot} points={ZAP} />
            </svg>
            <div className={h.hero}>
              <BGen expr={current.expr} size="var(--hero)" followPointer talkKey={line} aura />
            </div>
            {layer("front")}
            <svg className={h.spark} viewBox="-12 -12 24 24">
              {Array.from({ length: 8 }, (_, i) => (
                <line key={i} x1="0" y1="-4" x2="0" y2="-11" transform={`rotate(${i * 45})`} />
              ))}
            </svg>
          </div>

          <div className={h.say}>
            <p key={line} className="bubble">
              {current.text}
            </p>
          </div>
        </div>

        <div className={h.side}>
          <div className={h.dots} />
          <Header
            compact
            right={
              <span className={h.eyebrow}>
                <Gamepad2 size="1.3em" strokeWidth={2.2} aria-hidden="true" /> BGen vs. los Problemones
              </span>
            }
          />

          <div className={h.copy}>
            <h1 className={h.title}>
              <span style={{ "--i": 1 } as React.CSSProperties}>¿Tu empresa</span>
              <span style={{ "--i": 2 } as React.CSSProperties}>está lista</span>
              <span style={{ "--i": 3 } as React.CSSProperties}>
                para la <em>IA?</em>
              </span>
            </h1>
            <p className={h.lede} style={{ "--i": 4 } as React.CSSProperties}>
              Ayudá a <b>BGen</b> a ordenar una empresa en 90 segundos y descubrí tu nivel de madurez en IA.
            </p>
            <button className={`btn btn-lg ${h.cta}`} style={{ "--i": 5 } as React.CSSProperties} onClick={() => go("register")}>
              <Play size="0.9em" fill="currentColor" strokeWidth={0} aria-hidden="true" /> Tocá para jugar
            </button>
          </div>

          <aside className={`panel ${h.rank}`} aria-label="Ranking de hoy" onClick={(e) => e.stopPropagation()}>
            <div className={h.rankHead}>
              <h2>
                <Trophy size="1.1em" strokeWidth={2.4} color="var(--orange)" aria-hidden="true" /> Ranking de hoy
              </h2>
              {played > 0 && (
                <span className={h.played}>
                  <Users size="1.15em" strokeWidth={2.4} aria-hidden="true" /> {played} {played === 1 ? "jugó" : "jugaron"} hoy
                </span>
              )}
            </div>
            {ranking.length === 0 ? (
              <p className={h.empty}>Todavía nadie jugó hoy. ¡Sé el primero!</p>
            ) : (
              <ol className={h.rankList} tabIndex={0} aria-label="Posiciones de hoy">
                {ranking.map((r, i) => (
                  <li className={h.rankRow} key={`${r.name}-${r.at}`}>
                    <span className={h.rankPos}>{i + 1}</span>
                    <span className={h.rankName}>
                      <span>{r.name}</span>
                      <span className={h.rankGame}>{GAMES[r.game]?.name}</span>
                    </span>
                    <span className={h.rankScore}>{r.score.toLocaleString("es-AR")}</span>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

/** Un objeto volando: sale disparado desde BGen y queda flotando en su lugar. */
function Fly({ it, i }: { it: Item; i: number }) {
  const { k, x, y, s, r, l, hit } = it;
  const dist = Math.hypot(x - BX, y - BY);
  const style = {
    left: `${x}%`,
    top: `${y}%`,
    "--s": s,
    "--r": `${r}deg`,
    "--fx": `${BX - x}cqw`,
    "--fy": `${BY - y}cqh`,
    "--d": `${(0.3 + dist * 0.005 + (i % 5) * 0.03).toFixed(2)}s`,
    "--t": `${(2.8 + ((i * 7) % 10) * 0.22).toFixed(2)}s`,
  } as React.CSSProperties;
  return (
    <span className={`${h.fly} ${h[l]} ${s >= 10 ? h.big : ""}`} style={style}>
      <span className={h.bob}>
        <Art k={k} i={i} hit={hit} />
      </span>
    </span>
  );
}

function Art({ k, i, hit }: { k: string; i: number; hit?: boolean }) {
  if (k.startsWith("bit-")) return <span className={`${h.bit} ${h[k.replace("-", "")]}`} />;
  if (k === "wood" || k === "glass") return <img src={`/sprites/physics/debris-${k}-${(i % 3) + 1}.png`} alt="" draggable={false} />;
  return <FlyerArt k={k} className={hit ? h.hit : undefined} />;
}

/** Estallido tipo historieta detrás de BGen. */
function Burst() {
  const spikes = (n: number, ro: number, ri: number) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const a = (i / (n * 2)) * Math.PI * 2;
      const rr = i % 2 ? ri : ro * (i % 4 === 0 ? 1 : 0.84);
      return `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`;
    }).join(" ");
  return (
    <svg className={h.burst} viewBox="-50 -50 100 100">
      <polygon points={spikes(14, 50, 30)} fill="#fff" />
      <polygon points={spikes(14, 40, 25)} fill="#FFE6CC" transform="rotate(6)" />
    </svg>
  );
}
