// Browser-side baker used by export-characters.mjs against a running Vite server.
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { SkinnedRigFactory } from "../src/ui/skinnedRig";
import type { RigActionKind } from "../src/ui/hockeyRig";

export async function bakeCharacter(goalie: boolean) {
  const factory = new SkinnedRigFactory(async () => null);
  await factory.ready;
  const kit = {
    jersey: "#133f84",
    trim: "#f6f8fc",
    socks: "#174685",
    pants: "#172438",
    helmet: "#123873",
    abbr: "NYR",
  };
  const rig = goalie ? factory.goalie(kit) : factory.skater(kit);
  const oldOnLoad = THREE.DefaultLoadingManager.onLoad;
  const uniformsReady = new Promise<void>((resolve) => {
    THREE.DefaultLoadingManager.onLoad = resolve;
  });
  rig.setIdentity(
    {
      id: goalie ? "nhl-NYR-8478048" : "nhl-NYR-8479323",
      number: goalie ? 31 : 23,
      name: goalie ? "Igor Shesterkin" : "Adam Fox",
    },
    goalie ? "G" : "D",
  );
  await uniformsReady;
  THREE.DefaultLoadingManager.onLoad = oldOnLoad;
  rig.place(0, 0, 0);
  const input = {
    x: 0,
    z: 0,
    puckX: 0.3,
    puckZ: 2,
    vx: 0,
    vz: 0,
    hasPuck: false,
    face: 0,
  };
  const lod = rig.root.children.find(
    (node) => node instanceof THREE.LOD,
  ) as THREE.LOD;
  lod.levels[0].object.visible = true;
  rig.update(1 / 30, 1 / 30, input);
  const source = lod.levels[0].object as THREE.SkinnedMesh;
  const group = new THREE.Group();
  group.name = goalie ? "Goaltender" : "Skater";
  const joints = source.skeleton.bones.map((b) => {
    const joint = new THREE.Bone();
    joint.name = b.name;
    group.add(joint);
    return joint;
  });
  const mesh = new THREE.SkinnedMesh(source.geometry, source.material);
  group.add(mesh);
  mesh.bind(
    new THREE.Skeleton(
      joints,
      source.skeleton.boneInverses.map((m) => m.clone()),
    ),
    new THREE.Matrix4(),
  );
  const clips: THREE.AnimationClip[] = [];
  const motions: [string, RigActionKind | null][] = goalie
    ? [
        ["Set", null],
        ["Glove save", "save"],
        ["Butterfly", "save"],
      ]
    : [
        ["Forward stride", null],
        ["Wrist shot", "wrist"],
        ["Slap shot", "slap"],
        ["Snap shot", "snap"],
        ["Shot block", "block"],
        ["Pass", "pass"],
        ["Receive", "receive"],
        ["Body check", "check"],
      ];
  for (const [name, action] of motions) {
    input.vz = name === "Forward stride" ? 5 : 0;
    for (let i = 0; i < 70; i++) rig.update(1 / 30, 1 / 30, input);
    if (action)
      rig.trigger(
        action,
        { x: name === "Butterfly" ? 0 : 1, z: 1 },
        name === "Butterfly" ? 0.15 : 0.75,
      );
    const tracks: THREE.KeyframeTrack[] = [];
    const samples = joints.map(() => ({
      position: [] as number[],
      quaternion: [] as number[],
      scale: [] as number[],
    }));
    const times = Array.from({ length: 46 }, (_, i) => i / 30);
    for (let frame = 0; frame < times.length; frame++) {
      rig.update(1 / 30, 1 / 30, input);
      source.skeleton.bones.forEach((bone, i) => {
        const joint = joints[i];
        bone.matrix.decompose(joint.position, joint.quaternion, joint.scale);
        const sample = samples[i];
        sample.position.push(...joint.position.toArray());
        sample.quaternion.push(...joint.quaternion.toArray());
        sample.scale.push(...joint.scale.toArray());
      });
    }
    joints.forEach((joint, i) => {
      const s = samples[i];
      tracks.push(
        new THREE.VectorKeyframeTrack(
          joint.name + ".position",
          times,
          s.position,
        ),
        new THREE.QuaternionKeyframeTrack(
          joint.name + ".quaternion",
          times,
          s.quaternion,
        ),
        new THREE.VectorKeyframeTrack(joint.name + ".scale", times, s.scale),
      );
    });
    clips.push(new THREE.AnimationClip(name, -1, tracks).optimize());
  }
  const data = (await new GLTFExporter().parseAsync(group, {
    binary: true,
    animations: clips,
  })) as ArrayBuffer;
  rig.dispose();
  factory.dispose();
  mesh.skeleton.dispose();
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.readAsDataURL(new Blob([data]));
  });
}
