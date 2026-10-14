"use client";

import { useEffect, useRef, useState } from "react";
import Hud, { SayOverlay } from "../hud/Hud";
import GestureIcon from "../GestureIcon";
import { accentVars, GAMES, PHASES, type GameId } from "@/lib/games";
import { useHud, useSession, type GameResult } from "@/lib/store";
import { hoursSaved, levelFor, rankOf } from "@/lib/scoring";
import { addEntry, displayName, todayEntries } from "@/lib/ranking";
import { putLead } from "@/lib/leads/queue";
import { syncNow } from "@/lib/leads/sync";
import type { KioskConfig } from "@/lib/config";
import type { CreateGame, GameHooks, GameInstance, GameOutcome } from "@/games/types";
import p from "./play.module.css";

async function loadGame(id: GameId): Promise<CreateGame> {
  if (id === "compania") return (await import("@/games/compania")).default;
  if (id === "deploy") return (await import("@/games/deploy")).default;
  return (await import("@/games/central")).default;
}

/** Pantalla de juego: escenario + HUD (lateral en TV, inferior en tablet). */
export default function Play({ config, layout }: { config: KioskConfig; layout: "tv" | "tablet" }) {
  const game = useSession((st) => st.game)!;
  const hostRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState<number | null>(3);
  const [banner, setBanner] = useState<{ title: string; subtitle: string; id: number } | null>(null);
  const [hint, setHint] = useState<{ text: string; id: number } | null>(null);
  const [showGestures, setShowGestures] = useState(true);
  const [loading, setLoading] = useState(true);
  const instRef = useRef<GameInstance | null>(null);
  const g = GAMES[game];

  useEffect(() => {
    let disposed = false;
    const hud = useHud.getState();
    hud.reset(config.durationSec);
    let n = 0;
    const hooks: GameHooks = {
      score: (score, combo) => useHud.getState().patch({ score, combo }),
      phase: (phase) => useHud.getState().patch({ phase }),
      time: (timeLeft) => useHud.getState().patch({ timeLeft: Math.round(timeLeft * 4) / 4 }),
      metric: (metricValue, metricPct) => useHud.getState().patch({ metricValue, metricPct: Math.round(metricPct * 50) / 50 }),
      bgen: (expr, say) => useHud.getState().patch(say ? { expr, say: { text: say, id: ++n } } : { expr }),
      banner: (title, subtitle) => setBanner({ title, subtitle, id: ++n }),
      hint: (text) => setHint({ text, id: ++n }),
      end: (outcome) => {
        if (!disposed) void finish(game, outcome);
      },
    };
    loadGame(game).then((create) => {
      if (disposed || !hostRef.current) return;
      instRef.current = create(hostRef.current, hooks, {
        durationSec: config.durationSec,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        layout,
      });
      instRef.current.pause?.(true);
      setLoading(false);
    });
    return () => {
      disposed = true;
      instRef.current?.destroy();
      instRef.current = null;
    };
    // el layout cambia solo si se rota/redimensiona: el juego se adapta solo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, config.durationSec]);

  // cuenta regresiva 3-2-1 antes de arrancar
  useEffect(() => {
    if (loading || count === null) return;
    if (count === 0) {
      instRef.current?.pause?.(false);
      const t = window.setTimeout(() => setCount(null), 600);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 800);
    return () => window.clearTimeout(t);
  }, [count, loading]);

  useEffect(() => {
    if (count !== null) return;
    const t = window.setTimeout(() => setShowGestures(false), 4500);
    return () => window.clearTimeout(t);
  }, [count]);

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 1700);
    return () => window.clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 2200);
    return () => window.clearTimeout(t);
  }, [hint]);

  return (
    <section className={`${p.play} ${layout === "tv" ? p.tv : p.tablet}`} style={accentVars(game) as React.CSSProperties}>
      <div className={`tech-shadow ${p.stageWrap}`}>
      <div className={`tech ${p.stage}`}>
        <div ref={hostRef} className={p.host} />
        <span className="tech-brackets" aria-hidden="true" />
        <span className="tech-line" aria-hidden="true" />
        {layout === "tablet" && <SayOverlay />}
        {loading && <div className={p.loading}>Cargando {g.name}…</div>}
        {count !== null && !loading && (
          <div className={p.countdown} aria-live="assertive">
            <span key={count} className={p.count}>
              {count === 0 ? "¡Ya!" : count}
            </span>
          </div>
        )}
        {count === null && showGestures && (
          <div className={p.gestures}>
            {g.controls.map((c) => (
              <div key={c.label} className={p.gesture}>
                <GestureIcon gesture={c.gesture} size={layout === "tv" ? 84 : 68} />
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        )}
        {banner && (
          <div key={banner.id} className={p.banner}>
            <span className={p.bannerPlan}>{banner.subtitle}</span>
            <strong>{banner.title}</strong>
          </div>
        )}
        {hint && (
          <div key={hint.id} className={p.hint}>
            {hint.text}
          </div>
        )}
      </div>
      </div>
      <Hud game={game} layout={layout} />
    </section>
  );
}

/** Cierra la partida: calcula nivel, guarda ranking, actualiza el lead y va al resultado. */
async function finish(game: GameId, outcome: GameOutcome) {
  const { player, setResult, go } = useSession.getState();
  const day = (await todayEntries(game).catch(() => [])).map((e) => e.score);
  const level = levelFor(outcome.score, day);
  const stars = level === "Evolution" ? 3 : level === "Foundation" ? 2 : 1;
  const result: GameResult = {
    game,
    score: outcome.score,
    metricLabel: GAMES[game].metricLabel,
    metricValue: outcome.metricValue,
    level,
    stars,
    hours: hoursSaved(outcome.score),
    rank: rankOf(outcome.score, day),
    total: day.length + 1,
  };
  setResult(result);
  if (player) {
    try {
      await addEntry({ name: displayName(player.firstName, player.lastName), score: outcome.score, game, at: new Date().toISOString() });
      // si re-juega, en Odoo queda su mejor partida
      const prevBest = player.score ?? -1;
      const best = outcome.score >= prevBest;
      const updated = best
        ? { ...player, game, score: outcome.score, level, hours: result.hours, metricLabel: result.metricLabel, metricValue: outcome.metricValue, playedAt: new Date().toISOString() }
        : player;
      useSession.getState().setPlayer(updated);
      await putLead(updated, { ready: true });
      void syncNow();
    } catch {
      /* el resultado se muestra igual */
    }
  }
  go("result");
}

export { PHASES };
