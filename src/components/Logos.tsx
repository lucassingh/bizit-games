import { BIZIT_MARK_PATH } from "@/lib/brand";

/** Logo Bizit (isotipo + BIZIT), según manual: nunca separados, isotipo a la izquierda. */
export function BizitLogo({ height = 40, light = false }: { height?: number; light?: boolean }) {
  return (
    <svg viewBox="0 0 300 100" style={{ height, width: "auto", display: "block" }} role="img" aria-label="Bizit">
      <defs>
        <linearGradient id="bz-grad" gradientUnits="userSpaceOnUse" x1="101.7474" y1="48.1538" x2="11.3368" y2="48.1538">
          <stop offset=".6573" stopColor="#E80000" />
          <stop offset=".697" stopColor="#ED1C00" />
          <stop offset=".7597" stopColor="#F34200" />
          <stop offset=".8222" stopColor="#F85F00" />
          <stop offset=".8837" stopColor="#FC7500" />
          <stop offset=".9435" stopColor="#FE8100" />
          <stop offset="1" stopColor="#FF8600" />
        </linearGradient>
      </defs>
      <path fill="url(#bz-grad)" d={BIZIT_MARK_PATH} />
      <text x="128" y="68" fontFamily="Archivo, Arial, sans-serif" fontWeight={900} fontSize="46" letterSpacing="1" fill={light ? "#fff" : "#FA6B00"}>
        BIZIT
      </text>
    </svg>
  );
}

/** Logo BGenAI v2 (positivo). */
export function BGenAILogo({ height = 32 }: { height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/bgenai-logo-positivo.svg" alt="BGenAI" style={{ height, width: "auto", display: "block" }} />;
}
