"use client";

import { useEffect, useState } from "react";

/**
 * Renderiza a imagen, con fondo transparente, los modelos 3D del juego 1 para
 * usarlos como sprites 2D en Deploy BGen (mismo mundo, misma calidad):
 *  - cada Problemón de problemones.ts (512×512, de frente, con cara)
 *  - la ciudad Kenney completa vista de costado (fondo del juego 2)
 * Expone window.__sprites (dataURL por nombre) y window.__done para automatizar
 * la captura con Playwright. Solo uso interno; no se enlaza desde la app.
 */
export default function RenderTool() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const THREE = await import("three");
      const { makeProblemon } = await import("@/games/compania/problemones");
      const { buildWorld } = await import("@/games/compania/world");
      const out: Record<string, string> = {};
      const say = (m: string) => setLog((l) => [...l, m]);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.setClearColor(0x000000, 0);
      document.body.appendChild(renderer.domElement);

      /* ---------- Problemones ---------- */
      const kinds = ["mail", "fantasma", "excel", "caja", "factura", "botella", "conector", "auto", "orq"] as const;
      for (const kind of kinds) {
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight("#ffffff", "#d8cfc4", 1.25));
        const sun = new THREE.DirectionalLight("#fff3e2", 2.1);
        sun.position.set(-4, 8, 6);
        scene.add(sun);
        const { obj, tick } = makeProblemon(kind);
        tick?.(1000, 0);
        scene.add(obj);
        // encuadre: caja del objeto
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const S = 512;
        renderer.setSize(S, S);
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
        const half = Math.max(size.x, size.y) * 0.56;
        cam.left = -half;
        cam.right = half;
        cam.top = half;
        cam.bottom = -half;
        cam.position.set(center.x, center.y + 0.15, center.z + 20);
        cam.lookAt(center.x, center.y, center.z);
        cam.updateProjectionMatrix();
        renderer.render(scene, cam);
        out[kind] = renderer.domElement.toDataURL("image/png");
        (out as Record<string, string>)[`${kind}:meta`] = JSON.stringify({ w: size.x, h: size.y, cx: center.x, cy: center.y, half });
        say(`${kind} ${size.x.toFixed(2)}×${size.y.toFixed(2)}`);
        if (cancelled) return;
      }

      /* ---------- ciudad de fondo ---------- */
      {
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight("#ffffff", "#d8cfc4", 1.25));
        const sun = new THREE.DirectionalLight("#fff3e2", 2.1);
        sun.position.set(-60, 90, 80);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 400 });
        scene.add(sun, sun.target);
        const world = buildWorld(scene);
        await world.ready;
        // todas las áreas "integradas" (a color)
        for (const z of Object.values(world.zones)) {
          z.power = 1;
          world.applyPower(z);
        }
        const W = 3200, H = 1100;
        renderer.setSize(W, H);
        const cam = new THREE.PerspectiveCamera(31, W / H, 1, 1000);
        // vista de costado desde el sur, un poco elevada: Ventas y Operaciones adelante, Casa Central y Finanzas detrás
        // sin los arcos de IA (son del juego 1)
        scene.traverse((o) => {
          const m = o as { isMesh?: boolean; geometry?: { type: string }; visible: boolean };
          if (m.isMesh && m.geometry?.type === "TubeGeometry") m.visible = false;
        });
        cam.position.set(-8, 44, 150);
        cam.lookAt(-6, 14, -30);
        renderer.render(scene, cam);
        out.city = renderer.domElement.toDataURL("image/png");
        say("city ok");
      }
      (window as unknown as { __sprites: Record<string, string>; __done: boolean }).__sprites = out;
      (window as unknown as { __done: boolean }).__done = true;
      say("done");
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <main style={{ padding: 20, fontFamily: "monospace" }}>
      <h1>Render de sprites</h1>
      <pre>{log.join("\n")}</pre>
    </main>
  );
}
