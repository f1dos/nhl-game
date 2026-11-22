import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface HeadgearPart {
  geometry: THREE.BufferGeometry;
  material: "mask" | "boot" | "helmet" | "cage";
}

export async function loadHeadgear() {
  const file = await new GLTFLoader().loadAsync(
    new URL("../assets/headgear.glb", import.meta.url).href,
  );
  const parts: Record<
    "goalie" | "skater" | "broadcast_goalie" | "broadcast_skater",
    HeadgearPart[]
  > = { goalie: [], skater: [], broadcast_goalie: [], broadcast_skater: [] };
  file.scene.updateMatrixWorld(true);
  const materials = new Set<THREE.Material>();
  file.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = node.material as THREE.Material;
    materials.add(material);
    const role = node.name.includes("goalie") ? "goalie" : "skater";
    const key = node.name.startsWith("broadcast_")
      ? (`broadcast_${role}` as const)
      : role;
    parts[key].push({
      geometry: node.geometry.applyMatrix4(node.matrixWorld),
      material: material.name as HeadgearPart["material"],
    });
  });
  materials.forEach((material) => material.dispose());
  return parts;
}
