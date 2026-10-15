"use client";

import { create } from "zustand";
import type { GameInstance } from "@/games/types";

/**
 * Estado de la barra de desarrollo (ver lib/dev.ts). Play registra la instancia del
 * juego activo; la barra la usa para comenzar, pausar y saltar de fase.
 */
interface DevState {
  inst: GameInstance | null;
  /** "ready": cargado y a la espera de "Comenzar". */
  status: "loading" | "ready" | "running" | "paused";
  /** Cambiarlo remonta la pantalla de juego (reinicio limpio). */
  run: number;
  hidden: boolean;
  register: (inst: GameInstance | null) => void;
  start: () => void;
  pause: (p: boolean) => void;
  restart: () => void;
  toggleHidden: () => void;
}

export const useDev = create<DevState>((set, get) => ({
  inst: null,
  status: "loading",
  run: 0,
  hidden: false,
  register: (inst) => set({ inst, status: inst ? "ready" : "loading" }),
  start: () => {
    const { inst } = get();
    inst?.pause?.(false);
    set({ status: "running" });
  },
  pause: (p) => {
    const { inst, status } = get();
    if (status === "ready" || status === "loading") return;
    inst?.pause?.(p);
    set({ status: p ? "paused" : "running" });
  },
  restart: () => set((s) => ({ run: s.run + 1, status: "loading", inst: null })),
  toggleHidden: () => set((s) => ({ hidden: !s.hidden })),
}));
