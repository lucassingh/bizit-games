"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, KeyRound, Medal, RefreshCw, Search, Trophy, Users } from "lucide-react";
import { BGenAILogo, BizitLogo } from "@/components/Logos";
import { GAMES, type GameId } from "@/lib/games";
import type { StoredLead } from "@/lib/leads/store";
import s from "./players.module.css";

type Row = StoredLead & { rank: number; plays: number; best: boolean };

const PAGE_SIZES = [10, 25, 50];
const KEY_STORAGE = "bgc-players-key";

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function csvEscape(v: unknown) {
  const t = v === undefined || v === null ? "" : String(v);
  return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export default function PlayersTable() {
  const [leads, setLeads] = useState<StoredLead[] | null>(null);
  const [driver, setDriver] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needKey, setNeedKey] = useState(false);
  const [key, setKey] = useState("");
  const [query, setQuery] = useState("");
  const [game, setGame] = useState<GameId | "all">("all");
  const [bestOnly, setBestOnly] = useState(true);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load(k = key) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", { headers: k ? { "X-Players-Key": k } : {}, cache: "no-store" });
      if (res.status === 401) {
        setNeedKey(true);
        setLeads([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { leads: StoredLead[]; driver: string };
      setLeads(data.leads);
      setDriver(data.driver);
      setNeedKey(false);
      try {
        if (k) localStorage.setItem(KEY_STORAGE, k);
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let k = "";
    try {
      k = localStorage.getItem(KEY_STORAGE) || "";
    } catch {}
    setKey(k);
    void load(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ranking: mejor partida por persona (email), de mayor a menor */
  const ranked: Row[] = useMemo(() => {
    const all = (leads || []).filter((l) => game === "all" || l.game === game);
    const byEmail = new Map<string, number>();
    for (const l of all) {
      const e = l.email.trim().toLowerCase();
      byEmail.set(e, (byEmail.get(e) || 0) + 1);
    }
    const sorted = [...all].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.playedAt || a.createdAt).localeCompare(b.playedAt || b.createdAt));
    const seen = new Set<string>();
    const out: Row[] = [];
    let rank = 0;
    for (const l of sorted) {
      const e = l.email.trim().toLowerCase();
      const best = !seen.has(e);
      seen.add(e);
      if (bestOnly && !best) continue;
      if (best) rank++;
      out.push({ ...l, rank: best ? rank : 0, plays: byEmail.get(e) || 1, best });
    }
    return out;
  }, [leads, game, bestOnly]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((r) => `${r.firstName} ${r.lastName} ${r.email} ${r.occupation} ${r.pain || ""}`.toLowerCase().includes(q));
  }, [ranked, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize);

  const stats = useMemo(() => {
    const all = leads || [];
    const emails = new Set(all.map((l) => l.email.trim().toLowerCase()));
    const played = all.filter((l) => typeof l.score === "number");
    const avg = played.length ? Math.round(played.reduce((a, l) => a + (l.score || 0), 0) / played.length) : 0;
    return { players: emails.size, plays: played.length, avg, top: played[0]?.score ?? 0 };
  }, [leads]);

  function exportCsv() {
    const head = ["Puesto", "Nombre", "Apellido", "Email", "A qué se dedica", "Qué le quita más tiempo", "Juego", "Puntaje", "Nivel", "Horas/mes", "Jugado", "Partidas", "Dispositivo", "Campaña", "Odoo"];
    const lines = filtered.map((r) =>
      [
        r.rank || "",
        r.firstName,
        r.lastName,
        r.email,
        r.occupation,
        r.pain || "",
        r.game ? GAMES[r.game].name : "",
        r.score ?? "",
        r.level || "",
        r.hours ?? "",
        r.playedAt || r.createdAt,
        r.plays,
        r.device,
        r.campaign,
        r.odoo && "id" in r.odoo ? r.odoo.id : "",
      ]
        .map(csvEscape)
        .join(";"),
    );
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jugadores-bizit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className={s.page}>
      <header className={s.top}>
        <div className={s.brand}>
          <BGenAILogo height={30} />
          <span className={s.divider} />
          <span className={s.kicker}>Game Center · Jugadores</span>
        </div>
        <div className={s.topRight}>
          <BizitLogo height={24} />
        </div>
      </header>

      <section className={s.hero}>
        <div>
          <h1>Ranking de jugadores</h1>
          <p>Todas las personas que se registraron y jugaron en el stand, con los datos del formulario. Ordenadas por puntaje, de mayor a menor.</p>
        </div>
        <div className={s.kpis}>
          <div className={s.kpi}>
            <Users />
            <b>{stats.players}</b>
            <span>Jugadores</span>
          </div>
          <div className={s.kpi}>
            <Trophy />
            <b>{stats.top.toLocaleString("es-AR")}</b>
            <span>Mejor puntaje</span>
          </div>
          <div className={s.kpi}>
            <Medal />
            <b>{stats.plays}</b>
            <span>Partidas</span>
          </div>
          <div className={s.kpi}>
            <RefreshCw />
            <b>{stats.avg.toLocaleString("es-AR")}</b>
            <span>Promedio</span>
          </div>
        </div>
      </section>

      {needKey && (
        <form
          className={s.keyBox}
          onSubmit={(e) => {
            e.preventDefault();
            void load(key);
          }}
        >
          <KeyRound />
          <label>
            Esta vista está protegida. Ingresá la clave de acceso (PLAYERS_KEY).
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
          </label>
          <button type="submit" className={s.btn}>
            Entrar
          </button>
        </form>
      )}

      <section className={s.toolbar}>
        <label className={s.search}>
          <Search />
          <input
            placeholder="Buscar por nombre, email, área…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <div className={s.seg} role="tablist" aria-label="Juego">
          {(["all", ...(Object.keys(GAMES) as GameId[])] as const).map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={game === g}
              onClick={() => {
                setGame(g);
                setPage(0);
              }}
            >
              {g === "all" ? "Todos los juegos" : GAMES[g].name}
            </button>
          ))}
        </div>
        <label className={s.toggle}>
          <input type="checkbox" checked={bestOnly} onChange={(e) => setBestOnly(e.target.checked)} />
          Mejor partida por persona
        </label>
        <div className={s.spacer} />
        <button className={s.btnGhost} onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? s.spin : ""} /> Actualizar
        </button>
        <button className={s.btn} onClick={exportCsv} disabled={!filtered.length}>
          <Download /> Exportar CSV
        </button>
      </section>

      <section className={s.card}>
        {error && <p className={s.error}>No se pudo cargar la lista ({error}).</p>}
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.num}>#</th>
                <th>Jugador</th>
                <th>A qué se dedica</th>
                <th>Qué le quita más tiempo</th>
                <th>Juego</th>
                <th>Nivel</th>
                <th className={s.num}>Puntaje</th>
                <th>Jugado</th>
                <th>Odoo</th>
              </tr>
            </thead>
            <tbody>
              {leads === null && (
                <tr>
                  <td colSpan={9} className={s.empty}>
                    Cargando…
                  </td>
                </tr>
              )}
              {leads !== null && !slice.length && (
                <tr>
                  <td colSpan={9} className={s.empty}>
                    {leads.length ? "Nada coincide con la búsqueda." : "Todavía no hay jugadores. Los datos aparecen acá cuando el dispositivo del stand sincroniza (al terminar cada partida)."}
                  </td>
                </tr>
              )}
              {slice.map((r) => {
                const top = r.best && r.rank > 0 && r.rank <= 5;
                return (
                  <tr key={r.id} className={`${top ? s.top5 : ""} ${!r.best ? s.replay : ""}`}>
                    <td className={s.num}>
                      {r.best ? <span className={`${s.rank} ${top ? s[`r${r.rank}`] : ""}`}>{top && <Medal />}{r.rank}</span> : <span className={s.rankMuted}>·</span>}
                    </td>
                    <td>
                      <div className={s.who}>
                        <b>
                          {r.firstName} {r.lastName}
                        </b>
                        <a href={`mailto:${r.email}`}>{r.email}</a>
                        {r.plays > 1 && r.best && <small>{r.plays} partidas</small>}
                      </div>
                    </td>
                    <td>
                      <span className={`${s.pill} ${s.pillOcc}`}>{r.occupation}</span>
                    </td>
                    <td>{r.pain ? <span className={`${s.pill} ${s.pillPain}`}>{r.pain}</span> : <span className={s.muted}>—</span>}</td>
                    <td>{r.game ? <span className={s.game} style={{ "--g": GAMES[r.game].accent } as React.CSSProperties}>{GAMES[r.game].name}</span> : <span className={s.muted}>No jugó</span>}</td>
                    <td>{r.level ? <span className={`${s.level} ${s[`lv${r.level}`]}`}>{r.level}</span> : <span className={s.muted}>—</span>}</td>
                    <td className={`${s.num} ${s.score}`}>{typeof r.score === "number" ? r.score.toLocaleString("es-AR") : "—"}</td>
                    <td className={s.when}>{fmtDate(r.playedAt || r.createdAt)}</td>
                    <td>
                      {r.odoo && "id" in r.odoo ? (
                        <span className={`${s.dot} ${r.odoo.mode === "mock" ? s.dotMock : s.dotOk}`} title={r.odoo.mode === "mock" ? "Modo mock: todavía no se envía a Odoo" : `crm.lead #${r.odoo.id}`}>
                          {r.odoo.mode === "mock" ? "mock" : `#${r.odoo.id}`}
                        </span>
                      ) : r.odoo && "error" in r.odoo ? (
                        <span className={`${s.dot} ${s.dotErr}`} title={r.odoo.error}>
                          error
                        </span>
                      ) : (
                        <span className={s.muted}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className={s.pager}>
          <span>
            {filtered.length ? `${cur * pageSize + 1}–${Math.min(filtered.length, (cur + 1) * pageSize)} de ${filtered.length}` : "0 resultados"}
            {driver && <small> · almacén: {driver === "kv" ? "KV" : "archivo local"}</small>}
          </span>
          <div className={s.pagerRight}>
            <label>
              Por página
              <select value={pageSize} onChange={(e) => { setPageSize(+e.target.value); setPage(0); }}>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button className={s.btnGhost} onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0} aria-label="Anterior">
              <ChevronLeft />
            </button>
            <span className={s.pageNo}>
              {cur + 1} / {pages}
            </span>
            <button className={s.btnGhost} onClick={() => setPage(Math.min(pages - 1, cur + 1))} disabled={cur >= pages - 1} aria-label="Siguiente">
              <ChevronRight />
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
