"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { BGenAILogo, BizitLogo } from "./Logos";
import s from "./header.module.css";

/**
 * Header común a todas las pantallas: Bizit · presenta · BGenAI a la izquierda
 * y, opcionalmente, algo a la derecha (los pasos del flujo). `compact`: logos más chicos y,
 * si no entra en una línea, lo de la derecha baja (pantalla de inicio).
 * Mantener apretado el logo 3 s abre la configuración del kiosco.
 */
export default function Header({ right, compact }: { right?: React.ReactNode; compact?: boolean }) {
  const router = useRouter();
  const press = useRef<number | undefined>(undefined);
  const start = (e: React.PointerEvent) => {
    e.stopPropagation();
    press.current = window.setTimeout(() => router.push("/config"), 3000);
  };
  const end = () => window.clearTimeout(press.current);
  return (
    <header className={`${s.topbar} ${compact ? s.compact : ""}`}>
      <div className={s.brand} onPointerDown={start} onPointerUp={end} onPointerLeave={end} onClick={(e) => e.stopPropagation()}>
        <BizitLogo height={compact ? "calc(26 * var(--u))" : "calc(32 * var(--u))"} />
        <span className={s.presenta}>presenta</span>
        <BGenAILogo height={compact ? "calc(20 * var(--u))" : "calc(25 * var(--u))"} />
      </div>
      {right}
    </header>
  );
}

/** Indicador de pasos 1 · 2 · 3 del flujo. */
export function Steps({ current }: { current: 1 | 2 | 3 }) {
  const items = ["Tus datos", "Elegí el juego", "¡A jugar!"];
  return (
    <div className={s.steps} aria-label="Pasos">
      {items.map((label, i) => (
        <span key={label} className={`${s.step} ${current === i + 1 ? s.on : ""}`}>
          <i>{i + 1}</i>
          {label}
        </span>
      ))}
    </div>
  );
}
