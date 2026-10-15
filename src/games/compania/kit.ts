import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Kit de ciudad (Kenney City Kit, CC0) en /public/models/kenney.
 * Carga cada GLB una vez; `place()` devuelve una copia con un material propio
 * por zona, al que se le puede bajar la saturación con `power` (gris = caos,
 * color = integrada) sin tocar la textura compartida.
 */

export type KitName = "comercial" | "industrial" | "suburban" | "city";

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

export function modelUrl(kit: KitName, name: string) {
  return `/models/kenney/${kit}/${name}.glb`;
}

export function loadModel(kit: KitName, name: string): Promise<THREE.Group> {
  const url = modelUrl(kit, name);
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((g) => g.scene);
    cache.set(url, p);
  }
  return p;
}

/** Material por zona: mismo mapa de color, con uniforme uPower para desaturar. */
export interface PowerMaterial {
  mat: THREE.MeshStandardMaterial;
  set(power: number): void;
}

export function powerMaterial(src: THREE.MeshStandardMaterial): PowerMaterial {
  const mat = src.clone();
  mat.roughness = 0.9;
  mat.metalness = 0;
  const u = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPower = u;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uPower;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 g = vec3(l) * vec3(0.80, 0.80, 0.84) + 0.06;
          diffuseColor.rgb = mix(g, diffuseColor.rgb, uPower);
        }`,
      );
  };
  mat.customProgramCacheKey = () => "power";
  return { mat, set: (p) => (u.value = p) };
}

/**
 * Copia de un modelo con el material indicado (o el original si no se pasa),
 * escalada y ubicada. `scale` convierte las unidades del kit (1 = una baldosa) al mundo.
 */
export function instance(src: THREE.Group, opts: { mat?: THREE.Material; scale: number; x: number; z: number; rotY?: number; y?: number; shadows?: boolean }) {
  const g = src.clone(true);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      if (opts.mat) m.material = opts.mat;
      m.castShadow = opts.shadows ?? true;
      m.receiveShadow = true;
    }
  });
  g.scale.setScalar(opts.scale);
  g.position.set(opts.x, opts.y ?? 0, opts.z);
  g.rotation.y = opts.rotY ?? 0;
  return g;
}

/** Primer material estándar que aparece en un modelo (los kits usan uno solo). */
export function baseMaterial(src: THREE.Group): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  src.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!found && m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) found = m;
  });
  return found;
}
