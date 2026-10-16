"use client";

import { Ban, Crown, Tornado } from "lucide-react";
import type { GameId } from "@/lib/games";
import { foesFor, type Foe } from "@/lib/problemones";
import s from "./foecards.module.css";

const KIND_LABEL = { problemon: "Problemón", vip: "VIP", trampa: "¡No tocar!", jefe: "Jefe final" } as const;

function Art({ foe }: { foe: Foe }) {
  if (foe.sprite) return <img src={foe.sprite} alt="" draggable={false} />;
  if (foe.kind === "vip") return <Crown />;
  if (foe.kind === "trampa") return <Ban />;
  return <Tornado />;
}

/** Fila de cartas "a qué te enfrentás": los Problemones del juego, el VIP, la trampa y el jefe. */
export default function FoeCards({ game, delay = 0.3 }: { game: GameId; delay?: number }) {
  const foes = foesFor(game);
  return (
    <div className={s.wrap}>
      <span className={s.title}>
        A qué te enfrentás: <em>los Problemones</em>
      </span>
      <ul className={s.row} style={{ "--n": foes.length } as React.CSSProperties}>
        {foes.map((f, i) => (
          <li key={f.id} className={`${s.card} ${s[f.kind]}`} style={{ animationDelay: `${delay + i * 0.07}s` }}>
            {f.kind !== "problemon" && <span className={s.chip}>{KIND_LABEL[f.kind]}</span>}
            <span className={s.art}>
              <Art foe={f} />
            </span>
            <b className={s.name}>{f.name}</b>
            <span className={s.blurb}>{f.blurb}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
