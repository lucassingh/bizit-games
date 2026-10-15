/**
 * Catálogo de los juegos del benchmark. Los textos salen de los guiones
 * (docs/03, 04 y 05). Para dejar un solo juego, se desactivan los demás en /config
 * o con NEXT_PUBLIC_GAMES (lista separada por comas).
 */

export type GameId = "compania" | "deploy" | "central";

export type Gesture = "swipe-h" | "tap" | "drag-release" | "tap-area" | "tap-fast" | "hold-up";

export interface GameInfo {
  id: GameId;
  name: string;
  tagline: string;
  /** Frase de la pantalla intermedia: "Acompañá a BGen a …". */
  mission: string;
  howTo: string;
  /** Objetivo de cada fase (Drive, Foundation, Evolution). */
  steps: [string, string, string];
  controls: { gesture: Gesture; label: string }[];
  /** Etiqueta de la métrica estrella que muestra el HUD. */
  metricLabel: string;
  accent: string;
  accentDeep: string;
}

export const GAMES: Record<GameId, GameInfo> = {
  compania: {
    id: "compania",
    name: "La Compañía",
    tagline: "Recorré la empresa y conectá cada área.",
    mission: "conectar la compañía",
    howTo: "BGen corre solo por el riel de datos. Vos lo movés de carril, esquivás los Problemones y juntás conectores.",
    steps: ["Integrá Ventas", "Poné en marcha Operaciones", "Ordená Finanzas y llegá al HQ"],
    controls: [
      { gesture: "swipe-h", label: "Deslizá para cambiar de carril" },
      { gesture: "tap", label: "Tocá para saltar" },
      { gesture: "hold-up", label: "Mantené arriba: turbo" },
    ],
    metricLabel: "Compañía conectada",
    accent: "#F75D00",
    accentDeep: "#b84400",
  },
  deploy: {
    id: "deploy",
    name: "Deploy BGen",
    tagline: "Lanzá a BGen y derribá la Torre del Caos.",
    mission: "derribar la Torre del Caos",
    howTo: "Arrastrá hacia atrás para tensar la gomera y soltá. Mientras vuela, tocá la pantalla para usar la habilidad del agente.",
    steps: ["Tu primer agente", "Un equipo con habilidades", "El orquestador contra el Caos"],
    controls: [
      { gesture: "drag-release", label: "Arrastrá y soltá para lanzar" },
      { gesture: "tap", label: "Tocá en el aire: habilidad" },
    ],
    metricLabel: "Problemas eliminados",
    accent: "#662D91",
    accentDeep: "#43195f",
  },
  central: {
    id: "central",
    name: "Central BGen",
    tagline: "De manual a automático: repartí las tareas.",
    mission: "automatizar la empresa",
    howTo: "Las tareas llegan sin parar. Tocá el área correcta para cada una y después dejá que BGen automatice los flujos.",
    steps: ["Repartí a mano", "Automatizá los flujos", "Atendé solo lo importante"],
    controls: [
      { gesture: "tap-area", label: "Tocá el área de la tarea" },
      { gesture: "tap-fast", label: "Al final: tocá rápido ORQUESTAR" },
    ],
    metricLabel: "Automatizado",
    accent: "#0AB6BC",
    accentDeep: "#067f84",
  },
};

export const ALL_GAMES: GameId[] = ["compania", "deploy", "central"];

export function isGameId(v: unknown): v is GameId {
  return v === "compania" || v === "deploy" || v === "central";
}

/** Juegos habilitados por variable de entorno (por defecto, los tres). */
export function envEnabledGames(): GameId[] {
  const raw = process.env.NEXT_PUBLIC_GAMES;
  if (!raw) return ALL_GAMES;
  const list = raw.split(",").map((s) => s.trim()).filter(isGameId);
  return list.length ? list : ALL_GAMES;
}

/** Fases comunes a los 3 juegos (proporciones sobre la duración total; 90 s → 25/55/80). */
export const PHASES = [
  { key: "drive", name: "Drive", title: "¡Primer agente activo!", until: 25 / 90 },
  { key: "foundation", name: "Foundation", title: "¡Equipo de agentes!", until: 55 / 90 },
  { key: "evolution", name: "Evolution", title: "¡Modo orquestador!", until: 80 / 90 },
  { key: "climax", name: "Caos", title: "¡El Caos Operativo!", until: 1 },
] as const;

export type PhaseIndex = 0 | 1 | 2 | 3;

export function phaseAt(elapsed: number, duration: number): PhaseIndex {
  const f = elapsed / duration;
  for (let i = 0; i < PHASES.length; i++) if (f < PHASES[i].until) return i as PhaseIndex;
  return 3;
}

export function phaseStart(i: PhaseIndex, duration: number): number {
  return i === 0 ? 0 : PHASES[i - 1].until * duration;
}

/** Variables CSS para teñir la UI con el acento del juego. */
export function accentVars(id: GameId): Record<string, string> {
  return { "--accent": GAMES[id].accent, "--accent-deep": GAMES[id].accentDeep };
}
