"use client";

import GameArt from "../GameArt";
import GestureIcon from "../GestureIcon";
import { accentVars, GAMES, type GameId } from "@/lib/games";
import { useSession } from "@/lib/store";
import { sfx } from "@/lib/audio";
import type { KioskConfig } from "@/lib/config";
import s from "./screens.module.css";

/** Modal de selección de juego (solo mientras dura el benchmark). */
export default function GameSelect({ config }: { config: KioskConfig }) {
  const { chooseGame, go, player } = useSession();
  const pick = (id: GameId) => {
    sfx("ui.confirm");
    chooseGame(id);
    go("briefing");
  };
  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="sel-title">
      <div className={`panel ${s.modal}`}>
        <div className={s.modalHead}>
          <div>
            <span className="eyebrow">Paso 2 · {player ? `¡Hola, ${player.firstName}!` : ""}</span>
            <h2 id="sel-title" className={s.h1} style={{ fontSize: "calc(36 * var(--u))", marginTop: "calc(6 * var(--u))" }}>
              Elegí tu <em>desafío</em>
            </h2>
          </div>
          <button className="btn btn-light" onClick={() => go("register")}>
            ← Mis datos
          </button>
        </div>
        <div className={s.cards}>
          {config.games.map((id) => {
            const g = GAMES[id];
            return (
              <button
                key={id}
                className={s.gameCard}
                onClick={() => pick(id)}
                style={accentVars(id) as React.CSSProperties}
              >
                <div className={s.cardArt}>
                  <GameArt id={id} />
                </div>
                <div className={s.cardBody}>
                  <h3>{g.name}</h3>
                  <p>{g.tagline}</p>
                  <div className={s.cardFoot}>
                    <GestureIcon gesture={g.controls[0].gesture} size={46} />
                    <span className={s.playTag}>Jugar</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
