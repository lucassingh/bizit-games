"use client";

import { ALL_GAMES, envEnabledGames, type GameId } from "./games";

/** Configuración del kiosco, por dispositivo (se edita en /config). */
export interface KioskConfig {
  deviceName: string;
  stand: string;
  layout: "auto" | "tv" | "tablet";
  durationSec: number;
  games: GameId[];
  campaign: string;
}

const KEY = "bgc:config";

export function defaultConfig(): KioskConfig {
  return {
    deviceName: "tablet-1",
    stand: "Stand Bizit",
    layout: "auto",
    durationSec: 90,
    games: envEnabledGames(),
    campaign: process.env.NEXT_PUBLIC_CAMPAIGN || "Expo IA 2026",
  };
}

export function loadConfig(): KioskConfig {
  const base = defaultConfig();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<KioskConfig>;
    const games = (saved.games || base.games).filter((g) => ALL_GAMES.includes(g));
    return { ...base, ...saved, games: games.length ? games : base.games };
  } catch {
    return base;
  }
}

export function saveConfig(cfg: KioskConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* almacenamiento bloqueado: la config vuelve a los valores por defecto */
  }
}
