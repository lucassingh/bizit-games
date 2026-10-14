"use client";

import { useEffect, useRef } from "react";
import { COLORS, DECAGON_PATH, MARK_PATHS } from "@/lib/brand";
import { faceShapes, makeBlinker, VISOR_PATH } from "@/games/shared/bgenFace";
import type { Expr } from "@/games/types";

interface Props {
  expr?: Expr;
  size?: number | string;
  /** Si es true, los ojos siguen al puntero en toda la ventana. */
  followPointer?: boolean;
  /** Cambiarlo hace que BGen "hable" ~1 s. */
  talkKey?: string | number;
  aura?: boolean;
  float?: boolean;
  /** Brillo de los LEDs (filtro SVG). Desactivado en el HUD por rendimiento. */
  glow?: boolean;
  className?: string;
  title?: string;
}

/** BGen: el isotipo v2 completo con visor opaco y cara LED animada. */
export default function BGen({ expr = "reposo", size = 160, followPointer, talkKey, aura, float = true, glow = true, className, title = "BGen" }: Props) {
  const faceRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const exprRef = useRef(expr);
  const talkUntil = useRef(0);

  useEffect(() => {
    exprRef.current = expr;
  }, [expr]);

  useEffect(() => {
    if (talkKey !== undefined) talkUntil.current = performance.now() + 1100;
  }, [talkKey]);

  useEffect(() => {
    const g = faceRef.current;
    if (!g) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const blinker = makeBlinker();
    const gaze = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return;
      gaze.tx = Math.max(-6, Math.min(6, ((e.clientX - (r.left + r.width / 2)) / innerWidth) * 14));
      gaze.ty = Math.max(-3, Math.min(3, ((e.clientY - (r.top + r.height / 2)) / innerHeight) * 8));
    };
    if (followPointer) addEventListener("pointermove", onMove);
    const t0 = performance.now();
    let raf = 0;
    const paths: SVGPathElement[] = [];
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const e = exprRef.current;
      let tx = gaze.tx, ty = gaze.ty;
      if (!followPointer && e === "curioso") {
        tx = Math.sin(t * 0.9) * 5;
        ty = Math.sin(t * 1.3) * 1.5;
      }
      if (e === "concentrado") tx = 5;
      gaze.x += (tx - gaze.x) * 0.15;
      gaze.y += (ty - gaze.y) * 0.15;
      if (Math.abs(tx - gaze.x) < 0.05) gaze.x = tx;
      if (Math.abs(ty - gaze.y) < 0.05) gaze.y = ty;
      const talk = reduce ? 0 : Math.max(0, Math.min(1, (talkUntil.current - now) / 300));
      const shapes = faceShapes({ expr: e, t, blink: reduce ? 0 : blinker(t), gx: gaze.x, gy: gaze.y, talk });
      while (paths.length < shapes.length) {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("stroke-linecap", "round");
        p.setAttribute("stroke-linejoin", "round");
        g.appendChild(p);
        paths.push(p);
      }
      paths.forEach((p, i) => {
        const s = shapes[i];
        const d = s ? s.d : "";
        // solo tocar el DOM si cambió (la cara está quieta la mayor parte del tiempo)
        if (p.getAttribute("d") === d) return;
        p.setAttribute("d", d);
        if (!s) return;
        p.setAttribute("fill", s.fill || "none");
        p.setAttribute("stroke", s.stroke || "none");
        p.setAttribute("stroke-width", String(s.width || 0));
      });
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onMove);
      paths.forEach((p) => p.remove());
    };
  }, [followPointer]);

  const dim = typeof size === "number" ? `${size}px` : size;
  return (
    <svg
      ref={svgRef}
      viewBox="-4 -4 136 136"
      role="img"
      aria-label={title}
      className={className}
      style={{ width: dim, height: dim, overflow: "visible", animation: float ? "float 3.2s ease-in-out infinite" : undefined }}
    >
      <defs>
        <linearGradient id="bgen-aura" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={COLORS.cian} />
          <stop offset="1" stopColor={COLORS.lima} />
        </linearGradient>
        <filter id="bgen-led" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {aura && <path d={DECAGON_PATH} fill="none" stroke="url(#bgen-aura)" strokeWidth={12} strokeLinejoin="round" opacity={0.45} />}
      <path d={DECAGON_PATH} fill={COLORS.bgenBody} />
      <g fill="none" stroke={COLORS.niebla} strokeWidth={3.6} strokeLinejoin="round" strokeLinecap="round">
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d={VISOR_PATH} fill={COLORS.visor} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <g ref={faceRef} filter={glow ? "url(#bgen-led)" : undefined} />
    </svg>
  );
}
