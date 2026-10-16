/**
 * Piezas sueltas de las ilustraciones (portada del inicio, escenario del registro):
 * un Problemón (sprite renderizado del modelo 3D), una hoja ("doc"), un sobre
 * ("sobre"), un gráfico ("grafico") o una nube. Solo dibujan; la posición y el
 * movimiento los pone cada pantalla.
 */

export function FlyerArt({ k, className }: { k: string; className?: string }) {
  if (k === "doc")
    return (
      <svg className={className} viewBox="0 0 30 38">
        <path d="M2 2h18l8 8v26H2z" fill="#fff" stroke="#212529" strokeWidth="2" strokeLinejoin="round" />
        <path d="M20 2v8h8" fill="#E6E1DC" stroke="#212529" strokeWidth="2" strokeLinejoin="round" />
        <path d="M7 16h15M7 21h15M7 26h10" stroke="#B9B2AA" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  if (k === "sobre")
    return (
      <svg className={className} viewBox="0 0 42 30">
        <rect x="2" y="4" width="36" height="24" rx="3" fill="#fff" stroke="#212529" strokeWidth="2" />
        <path d="M3 6l17 12 17-12" fill="none" stroke="#212529" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="36" cy="6" r="5" fill="#F75D00" stroke="#212529" strokeWidth="1.6" />
      </svg>
    );
  if (k === "grafico")
    return (
      <svg className={className} viewBox="0 0 30 38">
        <path d="M2 2h26v34H2z" fill="#fff" stroke="#212529" strokeWidth="2" strokeLinejoin="round" />
        <path d="M8 30V22M14 30V14M20 30V18M26 30V9" stroke="#0AB6BC" strokeWidth="3.2" />
        <path d="M6 31h20" stroke="#212529" strokeWidth="1.6" />
      </svg>
    );
  // eslint-disable-next-line @next/next/no-img-element -- sprite estático cacheado por el service worker (sin optimizador, funciona offline)
  return <img className={className} src={`/sprites/deploy/${k}.png`} alt="" draggable={false} />;
}

export function Cloud({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 220 104">
      <path d="M40 98C16 98 4 84 9 69c5-14 20-18 31-14 1-23 21-38 43-34 11-17 44-21 59 1 19-9 45 3 46 28 20 1 30 20 22 34-5 9-13 14-24 14z" />
    </svg>
  );
}
