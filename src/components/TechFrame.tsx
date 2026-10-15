"use client";

import { useEffect, useRef, useState } from "react";
import s from "./techframe.module.css";

/**
 * Marco "pantalla sci-fi" (adaptado de la referencia del Dev a la paleta clara de Bizit):
 * capas de borde biselado que alternan claro/oscuro, pestaña superior naranja con línea negra fina
 * y pestaña inferior. Se dibuja en SVG al tamaño exacto del contenedor, así los
 * biseles quedan nítidos en cualquier escala (incluida la de Windows al 125 %).
 *
 * El contenido debe dejar un margen de `INSET` unidades (var(--u)) respecto del borde.
 */
/** Bandas de afuera hacia adentro (ancho en unidades a escala 1, color). Proporciones de la referencia (20/20/20/10/10) a la mitad de grosor; iguales en escenario y HUD. */
const BANDS: [number, string][] = [
  [4, "#d8d0c7"],
  [4, "#ffffff"],
  [4, "#c4bab0"],
  [2, "#ffffff"],
  [1.5, "#212529"],
];
const BAND_TOTAL = BANDS.reduce((a, [w]) => a + w, 0);

/** Margen que debe dejar el contenido respecto del borde, en unidades (var(--u)). */
export function frameInset(scale = 1) {
  return BAND_TOTAL * scale + 2;
}

type Props = {
  /** Tamaño del bisel exterior, en unidades. */
  cut?: number;
  /** Texto de la pestaña superior (opcional). */
  title?: string;
  /** Ancho de la pestaña superior como fracción del ancho (0 = sin pestaña). */
  notch?: number;
  /** Pestaña inferior decorativa. */
  foot?: boolean;
  /** Escala de las bandas (1 en el escenario, menor en el HUD). */
  scale?: number;
};

/**
 * Octógono con bisel a 45° desplazado `i` px hacia adentro de forma uniforme:
 * los lados rectos se corren `i`, y para que la diagonal quede paralela y la
 * banda tenga el mismo grosor, su intercepto se corre i·√2 (k = c − i·(2 − √2)).
 */
function octagon(w: number, h: number, i: number, cut: number) {
  const k = Math.max(2, cut - i * (2 - Math.SQRT2));
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

export default function TechFrame({ cut = 24, title, notch = 0.34, foot = true, scale = 1 }: Props) {
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
          </defs>
          {(() => {
            let i = 0;
            const out = BANDS.map(([bw, fill]) => {
              const poly = <polygon key={fill + i} points={octagon(w, h, i * u, c)} fill={fill} />;
              i += bw * scale;
              return poly;
            });
            out.push(<polygon key="fill" points={octagon(w, h, i * u, c)} fill="url(#tf-fill)" />);
            return out;
          })()}
          {notch > 0 && (
            <g>
              <polygon points={`${nx},0 ${nx + nw},0 ${nx + nw - slope},${nh} ${nx + slope},${nh}`} fill="#F75D00" />
              <rect x={nx + slope + 6 * u} y={nh - 2.5 * u} width={nw - 2 * slope - 12 * u} height={2 * u} fill="#212529" />
              {title && (
                <text x={w / 2} y={nh * 0.5 - 1 * u} textAnchor="middle" className={s.title} fill="#fff" fontSize={11 * u}>
                  {title.toUpperCase()}
                </text>
              )}
            </g>
          )}
          {foot && (
            <g>
              <polygon points={`${fx},${h} ${fx + fw},${h} ${fx + fw - slope * 0.6},${h - fh} ${fx + slope * 0.6},${h - fh}`} fill="#F75D00" />
              <rect x={fx + slope * 0.6 + 4 * u} y={h - fh + 0.5 * u} width={fw - slope * 1.2 - 8 * u} height={2 * u} fill="#212529" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
