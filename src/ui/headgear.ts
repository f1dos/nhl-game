import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface HeadgearPart {
  geometry: THREE.BufferGeometry;
  foot?: boolean;
  material: "shoe" | "pad" | "steel" | "tape" | "mask" | "boot" | "helmet" | "cage";
}

export async function loadHeadgear() {
  const loader = new GLTFLoader();
  const [file, skate] = await Promise.all([
    loader.loadAsync(new URL("../assets/headgear.glb", import.meta.url).href),
    loader.loadAsync(new URL("../assets/skate.glb", import.meta.url).href),
  ]);
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
  skate.scene.updateMatrixWorld(true);
  skate.scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = node.material as THREE.Material;
    materials.add(material);
    const level = node.name.startsWith("broadcast_") ? "broadcast_skater" : "skater";
    parts[level].push({foot:true, geometry:node.geometry.clone().applyMatrix4(node.matrixWorld),
      material:material.name as HeadgearPart["material"]});
  });
  skate.scene.traverse(node => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
  materials.forEach((material) => material.dispose());
  return parts;
}
