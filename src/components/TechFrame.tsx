"use client";

import { useEffect, useRef, useState } from "react";
import s from "./techframe.module.css";

/**
 * Marco "pantalla sci-fi" (adaptado de la referencia del Dev a la paleta clara de Bizit):
 * capas de borde biselado que alternan claro/oscuro, pestaña superior con línea IA
 * y pestaña inferior. Se dibuja en SVG al tamaño exacto del contenedor, así los
 * biseles quedan nítidos en cualquier escala (incluida la de Windows al 125 %).
 *
 * El contenido debe dejar un margen de `INSET` unidades (var(--u)) respecto del borde.
 */
export const INSET = 18;

type Props = {
  /** Tamaño del bisel exterior, en unidades. */
  cut?: number;
  /** Texto de la pestaña superior (opcional). */
  title?: string;
  /** Ancho de la pestaña superior como fracción del ancho (0 = sin pestaña). */
  notch?: number;
  /** Pestaña inferior decorativa. */
  foot?: boolean;
};

const LAYERS: [number, string][] = [
  [0, "#cdc4ba"],
  [3.5, "#ffffff"],
  [7, "#b9afa4"],
  [10.5, "#ffffff"],
  [13, "#212529"],
  [15, "url(#tf-fill)"],
];

function octagon(w: number, h: number, i: number, cut: number) {
  const k = Math.max(3, cut - i);
  return [
    [i + k, i],
    [w - i - k, i],
    [w - i, i + k],
    [w - i, h - i - k],
    [w - i - k, h - i],
    [i + k, h - i],
    [i, h - i - k],
    [i, i + k],
  ]
    .map((p) => p.map((n) => n.toFixed(1)).join(","))
    .join(" ");
}

export default function TechFrame({ cut = 24, title, notch = 0.34, foot = true }: Props) {
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
  const c = cut * u;
  // pestaña superior: trapecio centrado que "cuelga" del borde
  const nw = Math.min(w * notch, 520 * u);
  const nh = (title ? 26 : 20) * u;
  const slope = 28 * u;
  const nx = (w - nw) / 2;
  // pestaña inferior, más chica
  const fw = Math.min(w * 0.22, 320 * u);
  const fh = 12 * u;
  const fx = (w - fw) / 2;

  return (
    <div ref={ref} className={s.wrap} aria-hidden="true">
      {w > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={s.svg}>
          <defs>
            <radialGradient id="tf-fill" cx="50%" cy="20%" r="90%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#f5f1ec" />
            </radialGradient>
            <linearGradient id="tf-ia" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0ab6bc" />
              <stop offset="1" stopColor="#b2f326" />
            </linearGradient>
          </defs>
          {LAYERS.map(([i, fill]) => (
            <polygon key={i} points={octagon(w, h, i * u, c)} fill={fill} />
          ))}
          {notch > 0 && (
            <g>
              <polygon points={`${nx},0 ${nx + nw},0 ${nx + nw - slope},${nh} ${nx + slope},${nh}`} fill="#212529" />
              <rect x={nx + slope + 6 * u} y={nh - 3 * u} width={nw - 2 * slope - 12 * u} height={3 * u} fill="url(#tf-ia)" />
              {title && (
                <text x={w / 2} y={nh * 0.5 - 1 * u} textAnchor="middle" className={s.title} fill="#fff" fontSize={11 * u}>
                  {title.toUpperCase()}
                </text>
              )}
            </g>
          )}
          {foot && (
            <g>
              <polygon points={`${fx},${h} ${fx + fw},${h} ${fx + fw - slope * 0.6},${h - fh} ${fx + slope * 0.6},${h - fh}`} fill="#212529" />
              <rect x={fx + slope * 0.6 + 4 * u} y={h - fh} width={fw - slope * 1.2 - 8 * u} height={2.5 * u} fill="url(#tf-ia)" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
