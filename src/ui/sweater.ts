import { Mesh, SkinnedMesh, type BufferGeometry } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface Garment {
  geometry: BufferGeometry;
  joints: string[];
}

export async function loadSweaters(): Promise<Garment[]> {
  const file = await new GLTFLoader().loadAsync(new URL("../assets/sweater.glb", import.meta.url).href);
  const levels: Garment[] = [];
  file.scene.updateMatrixWorld(true);
  file.scene.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const match = /^sweater_lod([012])$/.exec(node.name);
    if (!(node instanceof SkinnedMesh) || !match) throw new Error("Unexpected garment mesh " + node.name);
    levels[Number(match[1])] = {
      geometry: node.geometry.applyMatrix4(node.matrixWorld),
      joints: node.skeleton.bones.map(bone => bone.name),
    };
    node.skeleton.dispose();
    for (const material of [node.material].flat()) material.dispose();
  });
  if (![0, 1, 2].every(i => levels[i])) throw new Error("Missing sweater LOD");
  return levels;
}
