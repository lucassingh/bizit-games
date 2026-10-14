"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BizitLogo } from "./Logos";
import { defaultConfig, loadConfig, saveConfig, type KioskConfig } from "@/lib/config";
import { ALL_GAMES, GAMES, type GameId } from "@/lib/games";
import { allLeads } from "@/lib/leads/queue";
import { onSyncStatus, syncNow, type SyncStatus } from "@/lib/leads/sync";
import { clearToday } from "@/lib/ranking";
import type { QueuedLead } from "@/lib/leads/types";
import { warmCache } from "./ServiceWorker";

/** Configuración del kiosco (se abre manteniendo apretado el logo 3 s en la pantalla de inicio). */
export default function ConfigScreen() {
  const [cfg, setCfg] = useState<KioskConfig>(defaultConfig);
  const [status, setStatus] = useState<SyncStatus>({ pending: 0, sent: 0, errors: 0 });
  const [leads, setLeads] = useState<QueuedLead[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la config vive en localStorage (solo cliente)
    setCfg(loadConfig());
    allLeads().then(setLeads);
    return onSyncStatus((st) => {
      setStatus(st);
      allLeads().then(setLeads);
    });
  }, []);

  const set = <K extends keyof KioskConfig>(k: K, v: KioskConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const toggleGame = (g: GameId) => set("games", cfg.games.includes(g) ? cfg.games.filter((x) => x !== g) : [...cfg.games, g]);

  const box: React.CSSProperties = { padding: 24, display: "flex", flexDirection: "column", gap: 14 };
  const input: React.CSSProperties = { minHeight: 48, border: "2px solid var(--line)", borderRadius: 12, padding: "0 14px", font: "500 17px var(--body)", background: "var(--surface)" };

  return (
    <main style={{ minHeight: "100%", background: "var(--surface)", paddingBlock: 28, paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <BizitLogo height={40} />
          <Link className="btn btn-light" href="/" style={{ textDecoration: "none" }}>
            ← Volver al juego
          </Link>
        </header>
        <h1 style={{ fontFamily: "var(--display)", fontSize: 40 }}>Configuración del kiosco</h1>

        <section className="panel" style={box}>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Dispositivo</h2>
          <label style={{ display: "grid", gap: 6 }}>
            <b>Nombre del dispositivo</b>
            <input id="cfg-device" style={input} value={cfg.deviceName} onChange={(e) => set("deviceName", e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <b>Stand</b>
            <input id="cfg-stand" style={input} value={cfg.stand} onChange={(e) => set("stand", e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <b>Campaña (va a Odoo)</b>
            <input id="cfg-campaign" style={input} value={cfg.campaign} onChange={(e) => set("campaign", e.target.value)} />
          </label>
          <div style={{ display: "grid", gap: 6 }}>
            <b>Vista</b>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["auto", "tablet", "tv"] as const).map((l) => (
                <button key={l} className="chip" aria-pressed={cfg.layout === l} onClick={() => set("layout", l)}>
                  {l === "auto" ? "Automática" : l === "tv" ? "TV (barra lateral)" : "Tablet (barra inferior)"}
                </button>
              ))}
            </div>
          </div>
          <label style={{ display: "grid", gap: 6 }}>
            <b>Duración del juego: {cfg.durationSec} s</b>
            <input id="cfg-duration" type="range" min={60} max={150} step={10} value={cfg.durationSec} onChange={(e) => set("durationSec", Number(e.target.value))} />
          </label>
        </section>

        <section className="panel" style={box}>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Juegos habilitados</h2>
          <p style={{ color: "var(--muted)" }}>Con uno solo, el selector desaparece y se va directo a ese juego.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ALL_GAMES.map((g) => (
              <button key={g} className="chip" aria-pressed={cfg.games.includes(g)} onClick={() => toggleGame(g)}>
                {GAMES[g].name}
              </button>
            ))}
          </div>
        </section>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="btn"
            disabled={!cfg.games.length}
            onClick={() => {
              saveConfig(cfg);
              setMsg("Configuración guardada.");
            }}
          >
            Guardar
          </button>
          <button
            className="btn btn-light"
            onClick={() => {
              warmCache();
              setMsg("Pedí al navegador que guarde todo para usar sin conexión.");
            }}
          >
            Preparar modo sin conexión
          </button>
          <button
            className="btn btn-light"
            onClick={async () => {
              await clearToday();
              setMsg("Ranking de hoy borrado.");
            }}
          >
            Borrar ranking de hoy
          </button>
        </div>
        {msg && <p role="status" style={{ fontWeight: 700 }}>{msg}</p>}

        <section className="panel" style={box}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Leads en este dispositivo</h2>
            <button className="btn btn-ia" onClick={() => syncNow(true)}>
              Enviar ahora
            </button>
          </div>
          <p style={{ fontFamily: "var(--mono)" }}>
            {status.sent} enviados · {status.pending} pendientes · {status.errors} con error
            {status.lastError ? ` · último error: ${status.lastError}` : ""}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th>Fecha</th>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Juego</th>
                  <th>Puntaje</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {leads
                  .slice()
                  .reverse()
                  .slice(0, 50)
                  .map((l) => (
                    <tr key={l.id} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ fontFamily: "var(--mono)", padding: "6px 0" }}>{new Date(l.createdAt).toLocaleString("es-AR")}</td>
                      <td>
                        {l.firstName} {l.lastName}
                      </td>
                      <td>{l.email}</td>
                      <td>{l.game ? GAMES[l.game].name : "—"}</td>
                      <td style={{ fontFamily: "var(--mono)" }}>{l.score ?? "—"}</td>
                      <td>{l.status === "sent" ? "✓ enviado" : l.status === "error" ? `reintentando (${l.attempts})` : l.ready ? "en cola" : "jugando"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
