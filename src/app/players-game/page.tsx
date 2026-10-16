import PlayersTable from "./PlayersTable";

export const metadata = { title: "Jugadores · Bizit Game Center", robots: { index: false, follow: false } };

/** Panel para Comercial: todos los jugadores capturados, con ranking y datos del formulario. */
export default function PlayersGamePage() {
  return <PlayersTable />;
}
