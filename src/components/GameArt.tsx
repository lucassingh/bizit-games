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
  // Lluvia de Tareas: la torre de noche escupe tareas; BGen las automatiza desde la vereda.
  // tareas que caen (x, y, color)
  const tasks = [
    [96, 44, COLORS.naranja],
    [150, 70, COLORS.violeta],
    [142, 24, COLORS.rojo],
    [206, 58, COLORS.cian],
  ] as const;
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true">
      <rect width="320" height="200" fill="#131a2e" />
      {/* estrellas */}
      {[30, 70, 110, 250, 290, 300].map((x, i) => (
        <rect key={i} x={x} y={14 + (i % 3) * 18} width="2" height="2" fill="#ffffff" opacity="0.6" />
      ))}
      {/* torres de fondo */}
      <rect x="20" y="70" width="40" height="110" fill="#1d2740" />
      <rect x="262" y="58" width="42" height="122" fill="#1d2740" />
      {/* torre central iluminada */}
      <rect x="120" y="30" width="80" height="150" fill="#232e4a" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="138" y={48 + i * 26} width="44" height="14" rx="2" fill={i >= 3 ? COLORS.lima : COLORS.naranja} opacity={i >= 3 ? 0.9 : 0.8} />
      ))}
      {/* vereda */}
      <rect y="176" width="320" height="24" fill="#3a3f4d" />
      <rect y="176" width="320" height="4" fill="#8d919c" />
      {/* tareas cayendo (cubos con carita) */}
      {tasks.map(([x, y, c], i) => (
        <g key={i}>
          <rect x={x - 11} y={y - 11} width="22" height="22" rx="6" fill={c} />
          <circle cx={x - 4} cy={y - 2} r="2" fill="#fff" />
          <circle cx={x + 4} cy={y - 2} r="2" fill="#fff" />
          <path d={`M${x - 4} ${y + 5} Q${x} ${y + 2} ${x + 4} ${y + 5}`} stroke="#fff" strokeWidth="1.5" fill="none" />
        </g>
      ))}
      {/* rayo de automatización */}
      <path d="M150 150 L150 86" stroke={COLORS.lima} strokeWidth="5" strokeLinecap="round" opacity="0.9" />
      <path d="M150 150 L150 86" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      {/* BGen en la vereda */}
      <polygon points="150,138 162,144 166,156 162,168 150,174 138,168 134,156 138,144" fill={COLORS.bgenBody} />
      <rect x="142" y="150" width="16" height="10" rx="5" fill={COLORS.visor} />
      <circle cx="147" cy="155" r="1.8" fill={COLORS.lima} />
      <circle cx="153" cy="155" r="1.8" fill={COLORS.lima} />
    </svg>
  );
}
