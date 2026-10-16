"use client";

import { Ban, Crown, Tornado } from "lucide-react";
import type { GameId } from "@/lib/games";
import { foesFor } from "@/lib/problemones";
import s from "./foecards.module.css";

/**
 * "A qué te enfrentás" en el briefing: los Problemones del juego en fila, como un
 * desfile de villanos (sin cartas), y aparte las reglas especiales (VIP vale ×3,
 * DELETE no se toca) y el jefe final, que cierra la fila.
 */
export default function FoeCards({ game, delay = 0.3 }: { game: GameId; delay?: number }) {
  const foes = foesFor(game);
  const crew = foes.filter((f) => f.kind === "problemon");
  const vip = foes.find((f) => f.kind === "vip");
  const trap = foes.find((f) => f.kind === "trampa");
  const boss = foes.find((f) => f.kind === "jefe");
  return (
    <section className={s.wrap} aria-label="A qué te enfrentás">
      <div className={s.crewBox}>
        <span className={s.title}>
          A qué te enfrentás: <em>los Problemones</em>
        </span>
        <ul className={s.crew}>
          {crew.map((f, i) => (
            <li key={f.id} className={s.member} style={{ animationDelay: `${delay + i * 0.07}s`, "--b": `${-i * 0.45}s` } as React.CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element -- sprite estático cacheado por el service worker */}
              <img src={f.sprite} alt="" draggable={false} />
              <b>{f.name}</b>
            </li>
          ))}
        </ul>
      </div>

      {(vip || trap) && (
        <ul className={s.rules} style={{ animationDelay: `${delay + crew.length * 0.07}s` }}>
          {vip && (
            <li className={`${s.rule} ${s.vip}`}>
              <Crown aria-hidden="true" />
              <span>
                <b>VIP</b> vale ×3
              </span>
            </li>
          )}
          {trap && (
            <li className={`${s.rule} ${s.trap}`}>
              <Ban aria-hidden="true" />
              <span>
                <b>DELETE</b> ¡no lo toques!
              </span>
            </li>
          )}
        </ul>
      )}

      {boss && (
        <div className={s.boss} style={{ animationDelay: `${delay + (crew.length + 1) * 0.07}s` }}>
          <span className={s.chip}>Jefe final</span>
          <Tornado aria-hidden="true" />
          <b>{boss.name}</b>
        </div>
      )}
    </section>
  );
}
