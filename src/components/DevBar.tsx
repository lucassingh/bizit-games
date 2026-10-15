"use client";

import { useEffect } from "react";
import { Camera, EyeOff, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { GAMES, PHASES, type GameId, type PhaseIndex } from "@/lib/games";
import { useDev } from "@/lib/devtools";
import { useHud, useSession } from "@/lib/store";
import d from "./devbar.module.css";

/**
 * Barra de desarrollo (solo con NEXT_PUBLIC_DEV_GAME o ?dev=juego, ver lib/dev.ts).
 * Teclas: P comenzar/pausar · R reiniciar · 1-4 saltar a fase · H ocultar/mostrar la barra.
 */
export default function DevBar({ game }: { game: GameId }) {
  const { status, inst, hidden, start, pause, restart, toggleHidden } = useDev();
  const screen = useSession((s) => s.screen);
  const phase = useHud((h) => h.phase);
  const go = useSession((s) => s.go);

  const toggle = () => {
    if (status === "ready") start();
    else if (status === "running") pause(true);
    else if (status === "paused") pause(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "p") toggle();
      else if (k === "r") {
        if (screen !== "play") go("play");
        restart();
      } else if (k === "h") toggleHidden();
      else if ("1234".includes(k) && k) inst?.skipTo?.((Number(k) - 1) as PhaseIndex);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const switchGame = (id: GameId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("dev", id);
    window.location.assign(url.toString());
  };

  if (hidden) {
    return (
      <button className={d.peek} onClick={toggleHidden} title="Mostrar barra de desarrollo (H)">
        DEV
      </button>
    );
  }

  const inPlay = screen === "play";
  return (
    <div className={d.bar} role="toolbar" aria-label="Barra de desarrollo">
      <span className={d.tag}>DEV</span>
      <div className={d.games}>
        {(Object.keys(GAMES) as GameId[]).map((id) => (
          <button key={id} className={`${d.btn} ${id === game ? d.on : ""}`} onClick={() => switchGame(id)} title={GAMES[id].name}>
            {id === "compania" ? "J1" : id === "deploy" ? "J2" : "J3"}
          </button>
        ))}
      </div>
      <span className={d.sep} />
      <button className={`${d.btn} ${d.main}`} onClick={toggle} disabled={!inPlay || status === "loading"} title="P">
        {status === "running" ? <Pause /> : <Play />}
        {status === "ready" ? "Comenzar" : status === "running" ? "Pausar" : status === "paused" ? "Reanudar" : "Cargando…"}
      </button>
      <button
        className={d.btn}
        onClick={() => {
          if (!inPlay) go("play");
          restart();
        }}
        title="R"
      >
        <RotateCcw /> Reiniciar
      </button>
      <span className={d.sep} />
      <div className={d.phases} title="1-4">
        <SkipForward />
        {PHASES.map((p, i) => (
          <button
            key={p.key}
            className={`${d.btn} ${d.small} ${i === phase ? d.on : ""}`}
            disabled={!inPlay || !inst?.skipTo || i <= phase}
            onClick={() => inst?.skipTo?.(i as PhaseIndex)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <span className={d.sep} />
      <button className={d.btn} onClick={toggleHidden} title="Ocultar la barra para capturas (H)">
        <EyeOff /> Ocultar
      </button>
      <span className={d.hint}>
        <Camera /> P · R · 1-4 · H
      </span>
    </div>
  );
}
