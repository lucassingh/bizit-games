"use client";

import { useEffect } from "react";
import { MUSIC, SFX } from "@/lib/audio";

/**
 * Registra el service worker y, una vez cargada la app, le pide que cachee
 * todos los recursos que ya se descargaron (JS de los juegos incluido), para
 * que el kiosco siga funcionando si se corta el Wi-Fi.
 */
export function warmCache() {
  if (!("serviceWorker" in navigator)) return;
  const urls = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => u.startsWith(location.origin) && !u.includes("/api/"))
    // audio: se precarga completo aunque todavía no haya sonado
    .concat(Object.values(SFX), Object.values(MUSIC));
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "warm", urls }));
}

export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // en desarrollo, un SW que haya quedado de un `npm start` anterior en este mismo origen
      // serviría los chunks viejos desde su caché: se desinstala y se limpia
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => void caches.delete(k))).catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* sin SW la app igual funciona online */
    });
    const t = window.setTimeout(warmCache, 8000);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
