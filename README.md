# Bizit Game Center

PWA de la expo de **Bizit Global**: tres juegos con **BGen** (la mascota de BGenAI) que captan leads para el CRM Odoo.
Funciona en TV (45–55") y tablets, con Wi-Fi malo o sin conexión.

> Contexto, guiones y decisiones: `../docs/` (empezar por `docs/CLAUDE.md`). Arquitectura: `../docs/10-arquitectura-app.md`.

## Arrancar

```bash
npm install
cp .env.example .env.local   # por defecto ODOO_MODE=mock (no envía nada)
npm run dev                  # http://localhost:3000
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Desarrollo (el service worker no se registra en dev) |
| `npm run build && npm start` | Producción local (con service worker → probar offline) |
| `npm run lint` | ESLint (config de Next 16) |
| `npm run typecheck` | TypeScript sin emitir |
| `npm test` | Vitest: puntaje, fases, armado del lead de Odoo |

## Desplegar en Vercel

1. Importar el repo en Vercel (framework: Next.js, sin cambios).
2. Cargar las variables de `.env.example` (Settings → Environment Variables). Para enviar leads reales: `ODOO_MODE=jsonrpc` (o `json2` en Odoo 19+), `ODOO_URL`, `ODOO_DB`, `ODOO_LOGIN`, `ODOO_API_KEY`.
3. Probar `GET /api/health`.

## En la expo (checklist)

1. Con Wi-Fi, abrir la app en cada dispositivo y dejarla 15 s en la pantalla de inicio: precarga los 3 juegos para usarlos sin red.
2. Instalarla como app (Chrome → "Instalar app" / "Agregar a pantalla de inicio") y abrirla en pantalla completa.
3. Mantener apretado el logo de Bizit 3 s → **/config**: nombre del dispositivo, stand, vista (TV/tablet), juegos habilitados, duración. Ahí también se ven los leads del dispositivo y se fuerza el envío.
4. Los leads se guardan en el dispositivo (IndexedDB) y se envían solos al volver la conexión. No borrar los datos del navegador antes de ver "0 pendientes" en /config.

## Estructura

```
src/
  app/                 page (una sola página, máquina de estados), /config, /api/leads, /api/health, manifest
  components/          Experience (flujo), screens/ (attract, registro, selector, briefing, juego, resultado), hud/, BGen
  games/
    compania/          Juego 1 · runner 3D (Three.js)
    deploy/            Juego 2 · física (Matter.js + Canvas 2D)
    central/           Juego 3 · ruteo de tareas (Canvas 2D)
    shared/            reloj de fases, puntaje con combos, gestos, cara LED de BGen
  lib/                 marca, catálogo de juegos, puntaje, cola de leads offline, Odoo, ranking
public/sw.js           service worker offline-first
```

Depuración: `/?debug` expone el estado de la física de Deploy en `window.__deploy`.
