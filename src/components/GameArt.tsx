import type { GameId } from "@/lib/games";
import { COLORS } from "@/lib/brand";

/** Ilustraciones livianas (SVG) de cada juego para el selector. */
export default function GameArt({ id }: { id: GameId }) {
  if (id === "compania") return <CompaniaArt />;
  if (id === "deploy") return <DeployArt />;
  return <CentralArt />;
}

function isoBox(x: number, y: number, w: number, d: number, h: number, top: string, left: string, right: string) {
  // caja isométrica: (x,y) = vértice frontal en el piso
  const a = 0.5;
  const p = (dx: number, dy: number, dz: number) => `${x + dx - dy},${y - (dx + dy) * a - dz}`;
  return (
    <g>
      <polygon points={`${p(0, 0, 0)} ${p(0, d, 0)} ${p(0, d, h)} ${p(0, 0, h)}`} fill={left} />
      <polygon points={`${p(0, 0, 0)} ${p(w, 0, 0)} ${p(w, 0, h)} ${p(0, 0, h)}`} fill={right} />
      <polygon points={`${p(0, 0, h)} ${p(w, 0, h)} ${p(w, d, h)} ${p(0, d, h)}`} fill={top} />
    </g>
  );
}

function CompaniaArt() {
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true">
      <rect width="320" height="200" fill="#F6F4F2" />
      <polygon points="160,190 300,120 160,50 20,120" fill="#E6E1DC" />
      <path d="M60 128 L160 78 L262 128" stroke={COLORS.cian} strokeWidth="5" fill="none" strokeLinecap="round" />
      {isoBox(110, 118, 34, 30, 74, "#3a3a40", "#26262c", "#303036")}
      {isoBox(190, 130, 34, 26, 40, "#d9cbb0", "#b9ae9c", "#c9bba3")}
      {isoBox(70, 140, 30, 24, 28, "#ffffff", "#d8d2c8", "#ece6dc")}
      {isoBox(230, 104, 22, 22, 56, "#4a8aa5", "#2f5f74", "#3b7088")}
      <rect x="196" y="72" width="7" height="24" fill="#c9bba3" />
      <rect x="196" y="72" width="7" height="3" fill={COLORS.rojo} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={120 + (i % 2) * 10} y={60 + i * 12} width="5" height="6" fill={COLORS.naranjaCalido} />
      ))}
      <circle cx="60" cy="128" r="7" fill={COLORS.lima} />
    </svg>
  );
}

function DeployArt() {
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true">
      <rect width="320" height="200" fill="#F6F4F2" />
      <rect y="168" width="320" height="32" fill="#E6E1DC" />
      <path d="M60 168 V128 M60 128 L48 108 M60 128 L72 108" stroke={COLORS.carbon} strokeWidth="6" strokeLinecap="round" />
      <path d="M78 104 Q 150 30 214 92" stroke={COLORS.violeta} strokeWidth="3" strokeDasharray="4 7" fill="none" />
      <polygon points="74,92 84,96 88,106 84,116 74,120 64,116 60,106 64,96" fill={COLORS.bgenBody} />
      <rect x="66" y="100" width="16" height="9" rx="4" fill={COLORS.visor} />
      <circle cx="71" cy="104" r="1.6" fill={COLORS.lima} />
      <circle cx="77" cy="104" r="1.6" fill={COLORS.lima} />
      {[
        [200, 140, 30, 28, "#c9a77a"],
        [234, 140, 30, 28, "#c9a77a"],
        [268, 140, 30, 28, "#c9a77a"],
        [214, 112, 18, 28, "#7fb7c9"],
        [252, 112, 18, 28, "#7fb7c9"],
        [206, 102, 70, 10, "#d9cbb0"],
        [222, 74, 38, 28, "#bdb3a0"],
      ].map(([x, y, w, h, c], i) => (
        <rect key={i} x={x as number} y={y as number} width={w as number} height={h as number} rx="3" fill={c as string} stroke="#00000022" />
      ))}
      <circle cx="241" cy="60" r="14" fill="#E3C85A" />
      <circle cx="236" cy="57" r="2.4" fill={COLORS.carbon} />
      <circle cx="246" cy="57" r="2.4" fill={COLORS.carbon} />
      <path d="M235 66 Q241 62 247 66" stroke={COLORS.carbon} strokeWidth="2" fill="none" />
    </svg>
  );
}

function CentralArt() {
  const areas = [
    [60, 50, COLORS.naranja],
    [260, 50, COLORS.violeta],
    [60, 150, COLORS.rojo],
    [260, 150, COLORS.carbon],
  ] as const;
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true">
      <rect width="320" height="200" fill="#F6F4F2" />
      {areas.map(([x, y], i) => (
        <path key={i} d={`M160 100 L${x} ${y}`} stroke={i < 2 ? COLORS.cian : "#d7d1ca"} strokeWidth="6" strokeDasharray={i < 2 ? "10 8" : "0"} strokeLinecap="round" />
      ))}
      {areas.map(([x, y, c], i) => (
        <rect key={i} x={x - 30} y={y - 22} width="60" height="44" rx="12" fill={c} />
      ))}
      <circle cx="160" cy="100" r="26" fill="#fff" stroke="#E6E1DC" strokeWidth="4" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={145 + i * 11} y={92} width="9" height="16" rx="3" fill={[COLORS.naranja, COLORS.violeta, COLORS.cian][i]} />
      ))}
    </svg>
  );
}
