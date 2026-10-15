"use client";

import { useEffect, useRef, useState } from "react";
import s from "./techframe.module.css";

/**
 * Marco de las pantallas de juego, a partir del `box.svg` del Dev (assets-raw):
 * contorno naranja fino, banda blanca, contorno interior fino y dos pestañas
 * naranjas en paralelogramo (arriba a la izquierda, abajo a la derecha).
 * Las proporciones del SVG original (viewBox 503×300) se conservan en unidades
 * de UI (var(--u)): banda 10, radio exterior 10.4, radio interior 5.8, pestañas
 * del 50 % del ancho con inclinación 13.6/10. Se dibuja en SVG al tamaño exacto
 * del contenedor, así queda nítido a cualquier escala.
 */

/** Grosor de la banda blanca, en unidades. */
export const BAND = 10;
/** Radio exterior e interior, en unidades. */
export const R_OUT = 10.4;
export const R_IN = 5.8;
export const ORANGE = "#EB5F14";

/** Margen que debe dejar el contenido respecto del borde exterior, en unidades. */
export function frameInset() {
  return BAND + 1.5;
}
/** Radio que debe usar el contenido recortado (coincide con el contorno interior). */
export function innerRadius() {
  return R_IN;
}

type Props = {
  /** Color de relleno interior (el escenario pone su propio fondo encima). */
  fill?: string;
  /** Fracción del ancho que ocupan las pestañas (0.5 en el original). */
  tab?: number;
};

export default function TechFrame({ fill = "#ffffff", tab = 0.5 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0, u: 1 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--u")) || 1;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height, u }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h, u } = box;
  const b = BAND * u;
  const sw = Math.max(1, 1.1 * u);
  const ro = R_OUT * u, ri = R_IN * u;
  // pestañas: largo proporcional al ancho, inclinación como el original (13.6 de avance por 10 de alto)
  const slant = 1.36 * b;
  const len = Math.max(slant * 3, Math.min(w * tab, 520 * u));
  const topX = Math.min(w * 0.082, 60 * u); // en el original arranca en 41/503 del ancho
  const botX = w - len - Math.min(w * 0.088, 64 * u); // y termina a 45/503 del borde derecho
  const inset = sw / 2;

  return (
    <div ref={ref} className={s.wrap} aria-hidden="true">
      {w > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={s.svg}>
          {/* banda blanca con contorno exterior */}
          <rect x={inset} y={inset} width={w - sw} height={h - sw} rx={ro} fill="#ffffff" stroke={ORANGE} strokeWidth={sw} />
          {/* pestañas (dentro de la banda) */}
          <polygon points={`${topX + slant},${inset} ${topX},${inset + b} ${topX + len},${inset + b} ${topX + len + slant},${inset}`} fill={ORANGE} />
          <polygon points={`${botX},${h - inset} ${botX + slant},${h - inset - b} ${botX + len + slant},${h - inset - b} ${botX + len},${h - inset}`} fill={ORANGE} />
          {/* interior con contorno fino */}
          <rect x={b + sw} y={b + sw} width={w - 2 * (b + sw)} height={h - 2 * (b + sw)} rx={ri} fill={fill} stroke={ORANGE} strokeWidth={sw} />
        </svg>
      )}
    </div>
  );
}
