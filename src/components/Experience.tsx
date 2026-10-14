"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/store";
import { loadConfig, type KioskConfig } from "@/lib/config";
import { startSync, syncNow } from "@/lib/leads/sync";
import { getLead, updateLead } from "@/lib/leads/queue";
import { warmCache } from "./ServiceWorker";
import Attract from "./screens/Attract";
import Register from "./screens/Register";
import GameSelect from "./screens/GameSelect";
import Briefing from "./screens/Briefing";
import Play from "./screens/Play";
import Result from "./screens/Result";
import ConnectionBadge from "./ConnectionBadge";

/** Tiempo sin tocar nada antes de volver a la pantalla de inicio. */
const IDLE_MS: Record<string, number> = { register: 90000, select: 45000, briefing: 45000, result: 30000 };

function detectLayout(pref: KioskConfig["layout"]): "tv" | "tablet" {
  if (pref !== "auto") return pref;
  const w = window.innerWidth, h = window.innerHeight;
  return w >= 1700 && w / h >= 1.6 ? "tv" : "tablet";
}

export default function Experience() {
  const screen = useSession((s) => s.screen);
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [layout, setLayout] = useState<"tv" | "tablet">("tablet");

  // configuración del kiosco + sincronización de leads
  useEffect(() => {
    const cfg = loadConfig();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la config vive en localStorage (solo cliente)
    setConfig(cfg);
    const apply = () => setLayout(detectLayout(cfg.layout));
    apply();
    addEventListener("resize", apply);
    startSync();
    return () => removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.layout = layout;
  }, [layout]);

  // precarga de los juegos en segundo plano (para que funcionen sin red)
  useEffect(() => {
    if (screen !== "attract") return;
    const t = window.setTimeout(() => {
      Promise.allSettled([import("@/games/compania"), import("@/games/deploy"), import("@/games/central")]).then(() =>
        window.setTimeout(warmCache, 1500),
      );
    }, 4000);
    return () => window.clearTimeout(t);
  }, [screen]);

  // vuelta al inicio por inactividad
  useEffect(() => {
    const ms = IDLE_MS[screen];
    if (!ms) return;
    let t = window.setTimeout(abandon, ms);
    const bump = () => {
      window.clearTimeout(t);
      t = window.setTimeout(abandon, ms);
    };
    const evs = ["pointerdown", "keydown", "input"] as const;
    evs.forEach((e) => addEventListener(e, bump));
    return () => {
      window.clearTimeout(t);
      evs.forEach((e) => removeEventListener(e, bump));
    };
  }, [screen]);

  if (!config) return <main style={{ height: "100%", background: "var(--bg)" }} />;

  return (
    <main data-screen={screen} style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      {screen === "attract" && <Attract config={config} />}
      {(screen === "register" || screen === "select") && <Register config={config} />}
      {screen === "select" && <GameSelect config={config} />}
      {screen === "briefing" && <Briefing layout={layout} durationSec={config.durationSec} />}
      {screen === "play" && <Play config={config} layout={layout} />}
      {screen === "result" && <Result />}
      <ConnectionBadge />
    </main>
  );
}

/** Cierra la sesión: el lead (si lo hay) queda listo para enviarse aunque no haya terminado de jugar. */
export async function abandon() {
  const { player, reset } = useSession.getState();
  if (player) {
    const rec = await getLead(player.id);
    if (rec && !rec.ready) await updateLead(player.id, { ready: true });
    void syncNow();
  }
  reset();
}
