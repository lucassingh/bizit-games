"use client";

import { createStore, get, set } from "idb-keyval";
import type { GameId } from "./games";

/** Ranking del día por dispositivo (sin red). Nombre + inicial del apellido. */
export interface RankEntry {
  name: string;
  score: number;
  game: GameId;
  at: string;
}

const store = typeof indexedDB !== "undefined" ? createStore("bgc-ranking", "days") : undefined;
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export async function todayEntries(game?: GameId): Promise<RankEntry[]> {
  if (!store) return [];
  const list = (await get<RankEntry[]>(dayKey(), store)) || [];
  return (game ? list.filter((e) => e.game === game) : list).sort((a, b) => b.score - a.score);
}

export async function addEntry(e: RankEntry) {
  if (!store) return;
  const list = (await get<RankEntry[]>(dayKey(), store)) || [];
  list.push(e);
  await set(dayKey(), list, store);
}

export async function clearToday() {
  if (store) await set(dayKey(), [], store);
}

export function displayName(first: string, last: string) {
  const l = last.trim();
  return `${first.trim()} ${l ? l[0].toUpperCase() + "." : ""}`.trim();
}
