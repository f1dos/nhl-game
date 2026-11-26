import benchMotion from "../assets/match-night/bench-motion.json";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import {
  HockeyRig,
  RigFactory,
  type RigActionKind,
  type RigIdentity,
  type RigInput,
  type RigState,
  type TeamKit,
} from "./hockeyRig";
import type { RigLike } from "./skinnedRig";

const urls = {
  skater: new URL("../assets/match-night/skater.glb", import.meta.url).href,
  goalie: new URL("../assets/match-night/goalie.glb", import.meta.url).href,
  official: new URL("../assets/match-night/official.glb", import.meta.url).href,
  coach: new URL("../assets/match-night/coach.glb", import.meta.url).href,
};
type Role = keyof typeof urls;
/** Dye the continuous panels in bind space so a colour boundary can cross a
 * triangle. The original interlock normal map keeps its own fabric UVs. */
function jerseyPanels(material:THREE.MeshStandardMaterial,kit:TeamKit) {
  material.color.set(0xffffff);
  material.roughness=.94;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{
      clubBody:{value:new THREE.Color(kit.jersey)},
      clubEdge:{value:new THREE.Color(kit.trim)},
      clubYoke:{value:new THREE.Color(kit.pants)},
    });
    shader.vertexShader="varying vec3 patternPoint;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\npatternPoint=position;");
    shader.fragmentShader="varying vec3 patternPoint;uniform vec3 clubBody,clubEdge,clubYoke;\n"+shader.fragmentShader.replace("#include <color_fragment>",`
      #include <color_fragment>
      float lateral=abs(patternPoint.x);
      float hem=patternPoint.y-.82;
      float sleeve=smoothstep(.21,.26,lateral);
      float band=mix(hem,patternPoint.y-1.04,sleeve);
      vec3 dye=mix(clubBody,clubYoke,smoothstep(1.465,1.469,patternPoint.y+.24*lateral));
      float edge=smoothstep(.033,.037,band)*(1.-smoothstep(.133,.137,band));
      float inset=smoothstep(.051,.055,band)*(1.-smoothstep(.108,.112,band));
      dye=mix(dye,clubEdge,edge);
      dye=mix(dye,mix(vec3(.87),clubYoke,.16),inset);
      diffuseColor.rgb*=dye;
    `);
  };
}
function uniformTexture(kit: TeamKit, kind: string) {
  const size = 256,
    rgba = new Uint8Array(size * 4);
  const body = new THREE.Color(kit.jersey),
    trim = new THREE.Color(kit.trim);
  const dark = new THREE.Color(kit.pants).lerp(
    new THREE.Color("#132334"),
    0.45,
  );
  const chalk = new THREE.Color("#e8ece9");
  for (let row = 0; row < size; row++) {
    // glTF converts the Blender vertical fabric coordinate to top-down UVs.
    const h = 1 - row / (size - 1);
    const color =
      kind === "Official stripes"
        ? Math.floor(h * 28) % 2
          ? dark
          : chalk
        : kind === "Sock"
          ? h < 0.08 || (h > 0.32 && h < 0.35)
            ? dark
            : h > 0.18 && h < 0.31
              ? body
              : h > 0.15 && h < 0.18
                ? trim
                : chalk
          : h > 0.79 || h < 0.04
            ? dark
            : h < 0.077 || (h > 0.128 && h < 0.14)
              ? trim
              : body;
    rgba.set([color.r * 255, color.g * 255, color.b * 255, 255], row * 4);
  }
  const texture = new THREE.DataTexture(rgba, 1, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
const shotClips: Partial<Record<RigActionKind, string>> = {
  wrist: "Wrist",
  shot: "Wrist",
  snap: "Wrist",
  slap: "One-timer",
  pass: "Wrist",
  check: "Shoulder pressure",
  checked: "Brace",
  fall: "Brace",
  block: "Brace",
  celebrate: "Celebrate",
  draw: "Draw",
  "tie-up": "Contest",
  receive: "Contest",
  poke: "Contest",
  deke: "Contest",
  protest: "Rise at goal",
  "stick-tap": "Draw",
};

// Each vertex is a weighted average of points transformed by its joints.
// Bound those points in joint space once per shared geometry; their union
// bounds every subsequent pose, including procedural IK and one-shot clips.
type JointEnvelope = { bind: THREE.Matrix4; inverses: THREE.Matrix4[]; radii: number[] };
const envelopes = new WeakMap<THREE.BufferGeometry, JointEnvelope>();
function jointRadii(mesh: THREE.SkinnedMesh) {
  const geometry = mesh.geometry, inverses = mesh.skeleton.boneInverses;
  const cached = envelopes.get(geometry);
  if (cached?.inverses === inverses && cached.bind.equals(mesh.bindMatrix)) return cached.radii;
  const {position, skinIndex, skinWeight} = geometry.attributes;
  const radii = inverses.map(() => -1);
  const point = new THREE.Vector3(), bound = new THREE.Vector3();
  for (let i=0; i<position.count; i++) {
    bound.fromBufferAttribute(position,i).applyMatrix4(mesh.bindMatrix);
    for (let k=0; k<4; k++) {
      if (skinWeight.getComponent(i,k) === 0) continue;
      const joint = skinIndex.getComponent(i,k);
      radii[joint] = Math.max(radii[joint],point.copy(bound).applyMatrix4(inverses[joint]).lengthSq());
    }
  }
  for (let i=0; i<radii.length; i++) if (radii[i]>=0) radii[i]=Math.sqrt(radii[i]);
  envelopes.set(geometry,{bind:mesh.bindMatrix.clone(),inverses,radii});
  return radii;
}

export class MatchNightFactory {
  private readonly drivers = new RigFactory();
  private readonly loader = new GLTFLoader();
  private readonly palettes = new Map<string, Map<THREE.Material, THREE.Material>>();
  whenLoaded(){return Promise.allSettled(this.models.values());}
  private readonly models = new Map<Role, Promise<GLTF>>();
  private readonly uniforms = new Map<string, THREE.Texture>();
  private disposed = false;
  private player(driver: HockeyRig, kit: TeamKit, role: Role) {
    let model = this.models.get(role);
    if (!model) {
      model = this.loader.loadAsync(urls[role]);
      this.models.set(role, model);
    }
    const fabric = (kind: string) => {
      const key = [kit.jersey, kit.trim, kit.pants, kind].join("/");
      let tex = this.uniforms.get(key);
      if (!tex) {
        tex = uniformTexture(kit, kind);
        this.uniforms.set(key, tex);
      }
      return tex;
    };
    const key = [role, kit.jersey, kit.trim, kit.pants, kit.socks, kit.helmet].join("/");
    let palette = this.palettes.get(key);
    if (!palette) this.palettes.set(key, palette = new Map());
    return new MatchNightPlayer(driver, role, kit, model, fabric, palette);
  }
  skater(kit: TeamKit) {
    return this.player(this.drivers.skater(kit), kit, "skater");
  }
  goalie(kit: TeamKit) {
    return this.player(this.drivers.goalie(kit), kit, "goalie");
  }
  official(role: "referee" | "linesman") {
    const kit = {
      jersey: "#fff",
      trim: role === "referee" ? "#f70" : "#111",
      socks: "#111",
      pants: "#111",
      helmet: "#111",
    };
    return this.player(this.drivers.official(role), kit, "official");
  }
  coach(color: string, suit = "#1d2633") {
    return this.player(
      this.drivers.coach(color, suit),
      { jersey: suit, trim: color, socks: suit, pants: suit, helmet: suit },
      "coach",
    );
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.drivers.dispose();
    this.palettes.forEach(palette => palette.forEach(material => material.dispose()));
    this.uniforms.forEach((texture) => texture.dispose());
    for (const model of this.models.values())
      void model.then(
        (g) => {
          g.scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            obj.geometry.dispose();
            for (const mat of ([] as THREE.Material[]).concat(obj.material))
              mat.dispose();
          });
        },
        () => {},
      );
  }
}

class MatchNightPlayer implements RigLike {
  readonly root: THREE.Group;
  private visual?: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private skeletons = new Set<THREE.Skeleton>();
  private active?: THREE.AnimationAction;
  private bladeMesh?: THREE.SkinnedMesh;
  private bounds = new Map<THREE.Skeleton, {meshes: THREE.SkinnedMesh[]; radii: number[]}>();
  private jointMatrix = new THREE.Matrix4();
  private heel=0;
  private bones=new Map<string,THREE.Object3D>();
  private previousRotations=new Map<THREE.Object3D,THREE.Quaternion>();
  private pelvisHeight?: number;
  private previousSpeed = 0;
  private previousYaw = 0;
  private glide = 0;
  private gliding = false;
  private motionTime=0;
  private saveSide=1;
  private saveHeight=0;
  private officialRelease=0;
  private drawTime=0;
  private drawWinner=false;
  private drawDot=new THREE.Vector3();
  private drawYaw=0;
  private impact=0;
  private wristCuff?: THREE.CylinderGeometry;
  private wristFabric?: THREE.MeshStandardMaterial;
  private overlay?: keyof typeof benchMotion;
  private overlayTime=0;
  private overlayWeight=1;
  private fadeRemaining=0;
  private overlayRotation=new THREE.Quaternion();
  private overlayNext=new THREE.Quaternion();
  signalLine(){this.startOverlay("lineCall")}
  private startOverlay(name:keyof typeof benchMotion,weight=1){
    this.overlay=name;
    this.overlayTime=0;
    this.overlayWeight=weight;
    this.fadeRemaining=0;
  }
  finishSave(direction?: {x:number;z:number}, height=this.saveHeight){
    if(!direction){
      this.startOverlay(height<.35?"coverLow":"cradle");
      return;
    }
    const lateral=direction.x*Math.cos(this.motion.yaw)-direction.z*Math.sin(this.motion.yaw);
    this.startOverlay(lateral>0?"pushLeft":"pushRight",.18+.82*Math.min(1,Math.abs(lateral)));
  }
  private updateOverlay(dt:number){
    if(!this.overlay)return;
    const clip=benchMotion[this.overlay];
    this.overlayTime+=dt;
    const frame=this.overlayTime*clip.fps;
    if(frame>=clip.frames-1){this.overlay=undefined;return}
    let weight=this.overlayWeight;
    if(this.fadeRemaining>0){
      this.fadeRemaining=Math.max(0,this.fadeRemaining-dt);
      weight*=this.fadeRemaining/.14;
      if(!this.fadeRemaining){this.overlay=undefined;return}
    }
    const index=Math.floor(frame)*4;
    for(const [name,keys] of Object.entries(clip.bones)){
      const bone=this.bones.get(name);
      if(!bone)continue;
      if(!this.previousRotations.has(bone))this.previousRotations.set(bone,bone.quaternion.clone());
      this.overlayRotation.fromArray(keys,index).slerp(this.overlayNext.fromArray(keys,index+4),frame%1);
      this.overlayNext.identity().slerp(this.overlayRotation,weight);
      bone.quaternion.multiply(this.overlayNext);
    }
  }
  private impactSide=1;
  private identity?: RigIdentity;
  private lettering?: THREE.MeshStandardMaterial;
  private letteringMap?: THREE.CanvasTexture;
  private catchTime=0;
  private shotTime = 0;
  private shotLength = .45;
  private shotTurn = 0;
  private passTime = 0;
  private passDirection = new THREE.Vector3();
  private busy = 0;
  private offset = 0;
  private released = false;
  constructor(
    private driver: HockeyRig,
    private role: Role,
    private kit: TeamKit,
    model: Promise<GLTF>,
    fabric: (kind: string) => THREE.Texture,
    palette: Map<THREE.Material, THREE.Material>,
  ) {
    this.root = driver.root;
    void model
      .then((g) => {
        if (this.released) return;
        this.visual = clone(g.scene);
        this.visual.name = "Match Night " + role;

        this.visual.traverse((o) => {
          if(o instanceof THREE.Bone){
            // GLTFLoader sanitizes periods for its animation binding paths.
            this.bones.set(o.userData.name ?? o.name,o);
            this.bones.set(o.name.replace(/^(UpperArm|Forearm|Hand|Thigh|Shin|Foot)([LR])$/, "$1.$2"),o);
          }
          if (!(o instanceof THREE.Mesh)) return;
          // SkeletonUtils clones a skeleton per material primitive. Share the
          // bone texture only when the bind pose and every bone match.
          if (o instanceof THREE.SkinnedMesh) {
            const current = o.skeleton;
            const shared = [...this.skeletons].find(other =>
              current.boneInverses === other.boneInverses &&
              current.bones.length === other.bones.length &&
              current.bones.every((bone,i) => bone === other.bones[i]));
            if (shared) o.skeleton = shared;
            else this.skeletons.add(current);
          }
          if(o instanceof THREE.SkinnedMesh && !Array.isArray(o.material) && o.material.name.endsWith("Blade tape")){
            const pos=o.geometry.attributes.position;
            let best=Infinity;
            for(let i=0;i<pos.count;i++){
              const score=Math.abs(pos.getX(i)-.80)+Math.abs(pos.getY(i)-.025)*4;
              if(score<best){best=score;this.heel=i;}
            }
            this.bladeMesh=o;
          }
          const tint = (m: THREE.MeshStandardMaterial) => {
            if (m.name.endsWith("Roster lettering")) {
              this.lettering = m.clone();
              this.lettering.opacity = 1;
              this.paintLettering();
              return this.lettering;
            }
            let copy = palette.get(m);
            if (!copy) {
              const local = m.clone();
              if(m.name.includes("Cloth ")) jerseyPanels(local,kit);
              if (m.name.endsWith("Jersey")) local.color.set(kit.jersey);
              if (m.name.endsWith("Trim")) local.color.set(kit.trim);
              if (m.name === "skater Equipment") {
                // The pearl shell shares a vertex-painted primitive with skin,
                // hardware and hair. Re-dye only its original paint swatch.
                local.onBeforeCompile = shader => {
                  shader.uniforms.helmetPaint = {value:new THREE.Color(kit.helmet)};
                  shader.vertexShader = "uniform vec3 helmetPaint;\n"+shader.vertexShader.replace("#include <color_vertex>",`
                    #include <color_vertex>
                    if(position.y>1.57 && distance(color.rgb,vec3(.738,.791,.799))<.003) vColor.rgb=helmetPaint;
                  `);
                };
              }
              if(m.name.endsWith("Ref shell")){local.color.set("#15191d");local.roughness=.44;}
              if(m.name.endsWith("Official stripes")){
                local.color.set(0xffffff);
                local.onBeforeCompile=shader=>{
                  shader.uniforms.armband={value:new THREE.Color(kit.trim)};
                  shader.vertexShader="varying vec3 refereePanel;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nrefereePanel=position;");
                  shader.fragmentShader="varying vec3 refereePanel;uniform vec3 armband;\n"+shader.fragmentShader.replace("#include <color_fragment>",`
                    #include <color_fragment>
                    float stripe=smoothstep(.47,.53,fract(refereePanel.x*22.));
                    vec3 cloth=mix(vec3(.015,.019,.023),vec3(.84),stripe);
                    float sleeve=smoothstep(.22,.27,abs(refereePanel.x));
                    float band=smoothstep(1.23,1.24,refereePanel.y)*(1.-smoothstep(1.35,1.36,refereePanel.y));
                    diffuseColor.rgb*=mix(cloth,armband,sleeve*band);
                  `);
                };
              }
              if (/Knit|Sock|Jersey|Trim|Official stripes/.test(m.name)){local.roughness=.95;local.metalness=0;}
              const fabricName = m.name.slice(role.length + 1);
              if (["Knit", "Sock"].includes(fabricName))
                local.map = fabric(fabricName);
              copy = local;
              palette.set(m, copy);

            }
            return copy;
          };
          o.material = Array.isArray(o.material)
            ? o.material.map(tint)
            : tint(o.material);
          if (o instanceof THREE.SkinnedMesh && !o.geometry.morphAttributes.position?.length) {
            const radii = jointRadii(o);
            let group = this.bounds.get(o.skeleton);
            if (!group) this.bounds.set(o.skeleton, group = { meshes: [], radii: radii.slice() });
            else for (let i=0; i<radii.length; i++) group.radii[i] = Math.max(group.radii[i],radii[i]);
            group.meshes.push(o);
          }
          o.frustumCulled = !(o instanceof THREE.SkinnedMesh);
          o.userData.shared = true;
        });
        if(role==="goalie"){
          // Anchor the underglove to the distal forearm so extension cannot
          // expose daylight between the jersey sleeve and the catching cuff.
          this.wristCuff=new THREE.CylinderGeometry(.059,.073,.25,16);
          this.wristFabric=new THREE.MeshStandardMaterial({color:0x222e39,roughness:.93});
          for(const side of ["L","R"]){
            const fore=this.bones.get("Forearm."+side), hand=this.bones.get("Hand."+side);
            if(!fore||!hand)continue;
            const cuff=new THREE.Mesh(this.wristCuff,this.wristFabric);
            cuff.position.copy(hand.position).multiplyScalar(.85);
            cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),hand.position.clone().normalize());
            fore.add(cuff);
          }
        }
        if(role==="coach"){
          // The coach uses rigid GLB pivots. The free hand is opposite the tablet.
          this.visual.traverse(node=>{
            const name:string=node.userData.name??node.name;
            if(name.startsWith("Coach head pivot"))this.bones.set("Head",node);
            if(name.startsWith("Coach shoulder") && node.position.x>0){
              this.bones.set("UpperArm.R",node);
              node.traverse(child=>{
                const label:string=child.userData.name??child.name;
                if(label.startsWith("Coach elbow"))this.bones.set("Forearm.R",child);
                if(label.startsWith("Coach hand"))this.bones.set("Hand.R",child);
              });
            }
          });
        }
        driver.useModelJoints();
        this.root.add(this.visual);
        this.mixer = new THREE.AnimationMixer(this.visual);
        for (const clip of g.animations)
          this.actions.set(clip.name, this.mixer.clipAction(clip));
        this.root.userData.matchNight = role;
        this.play("Watching play");
      })
      .catch((error) =>
        console.error("Could not load Match Night " + role, error),
      );
  }
  // Two-link reach for the referee: keep the elbow on its natural side and
  // bring one glove onto the opposite wrist for the holding signal.
  private reachArm(side:"L"|"R", target:THREE.Vector3, pole:THREE.Vector3) {
    const upper=this.bones.get("UpperArm."+side),fore=this.bones.get("Forearm."+side),hand=this.bones.get("Hand."+side);
    if(!upper || !fore || !hand || !this.visual)return;
    const point = (bone: THREE.Object3D) => this.visual!.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
    const origin=point(upper),elbow=point(fore),end=point(hand);
    const l1=origin.distanceTo(elbow),l2=elbow.distanceTo(end),axis=target.clone().sub(origin);
    const d=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.001,l1+l2-.001);
    axis.normalize();
    const x=(l1*l1-l2*l2+d*d)/(2*d);
    const bend=pole.sub(origin);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
    const joint=origin.clone().addScaledVector(axis,x).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-x*x)));
    const turn=(bone:THREE.Object3D,child:THREE.Object3D,to:THREE.Vector3)=>{
      const localTarget = bone.parent!.worldToLocal(this.visual!.localToWorld(to.clone()));
      const from = child.position.clone().applyQuaternion(bone.quaternion).normalize();
      const direction = localTarget.sub(bone.position).normalize();
      if (!this.previousRotations.has(bone)) this.previousRotations.set(bone,bone.quaternion.clone());
      bone.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(from, direction));
    };
    turn(upper,fore,joint);turn(fore,hand,target);
  }
  /** Move the hips while keeping each animated skate's position and edge angle. */
  private adjustHipHeight(metres: number) {
    const pelvis = this.bones.get("Pelvis");
    const basis = pelvis?.parent;
    if (!pelvis || !basis || Math.abs(metres) < .002) return;
    const point = (bone: THREE.Object3D) => basis.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
    const rotation = (bone: THREE.Object3D) => {
      bone.updateWorldMatrix(true, false);
      const relative = basis.matrixWorld.clone().invert().multiply(bone.matrixWorld);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(relative));
    };
    const legs = (["L", "R"] as const).flatMap(side => {
      const thigh = this.bones.get("Thigh."+side), shin = this.bones.get("Shin."+side), foot = this.bones.get("Foot."+side);
      if (!thigh || !shin || !foot) return [];
      const hip = point(thigh), knee = point(shin), ankle = point(foot);
      const upper = hip.distanceTo(knee), lower = knee.distanceTo(ankle);
      const reach = upper + lower - .006;
      const lateral = Math.hypot(hip.x-ankle.x, hip.z-ankle.z);
      const lift = Math.sqrt(Math.max(0, reach*reach - lateral*lateral)) - (hip.y-ankle.y);
      return [{ thigh, shin, foot, knee, ankle, upper, lower, lift, edge: rotation(foot) }];
    });
    if (legs.length !== 2) return;
    this.pelvisHeight = pelvis.position.y;
    pelvis.position.y += metres < 0 ? metres : Math.max(0, Math.min(metres, ...legs.map(leg => leg.lift)));
    const turn = (joint: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) => {
      const localTarget = joint.parent!.worldToLocal(basis.localToWorld(target.clone()));
      const from = child.position.clone().applyQuaternion(joint.quaternion).normalize();
      const to = localTarget.sub(joint.position).normalize();
      this.previousRotations.set(joint, joint.quaternion.clone());
      joint.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(from, to));
    };
    for (const { thigh, shin, foot, knee, ankle, upper, lower, edge } of legs) {
      const hip = point(thigh);
      const axis = ankle.clone().sub(hip);
      const distance = Math.min(axis.length(), upper + lower - .004);
      axis.normalize();
      const bend = knee.sub(hip);
      bend.addScaledVector(axis, -bend.dot(axis)).normalize();
      const along = (upper*upper - lower*lower + distance*distance) / (2*distance);
      const joint = hip.clone().addScaledVector(axis, along)
        .addScaledVector(bend, Math.sqrt(Math.max(0, upper*upper - along*along)));
      turn(thigh, shin, joint);
      turn(shin, foot, ankle);
      this.previousRotations.set(foot, foot.quaternion.clone());
      foot.quaternion.copy(rotation(shin).invert().multiply(edge));
    }
  }
  updateRenderBounds() {
    if (!this.root.visible) return;
    for (const [skeleton,{meshes,radii}] of this.bounds) {
      const reference = meshes[0];
      let radius = 0;
      for (let i=0; i<radii.length; i++) {
        if (radii[i]<0) continue;
        const e = this.jointMatrix.multiplyMatrices(reference.bindMatrixInverse,skeleton.bones[i].matrixWorld).elements;
        // Frobenius norm bounds the stretch even for sheared joint matrices.
        const stretch = Math.sqrt(e[0]**2+e[1]**2+e[2]**2+e[4]**2+e[5]**2+e[6]**2+e[8]**2+e[9]**2+e[10]**2);
        radius = Math.max(radius,Math.hypot(e[12],e[13]-1,e[14])+stretch*radii[i]);
      }
      for (const mesh of meshes) {
        mesh.frustumCulled = mesh.bindMatrixInverse.equals(reference.bindMatrixInverse);
        // Keep the original primitive centre for transparent depth sorting.
        if (!mesh.boundingSphere) mesh.computeBoundingSphere();
        const sphere = mesh.boundingSphere!;
        sphere.radius = radius + Math.hypot(sphere.center.x,sphere.center.y-1,sphere.center.z) + .01;
      }
    }
  }
  handPoint(target:THREE.Vector3){
    const hand=this.bones.get("Hand.R");
    if(!hand)return false;
    hand.getWorldPosition(target);return true;
  }
  bladePoint(target:THREE.Vector3) {
    const mesh=this.bladeMesh;
    if(!mesh) return false;
    this.root.updateMatrixWorld(true);
    mesh.getVertexPosition(this.heel,target);
    mesh.localToWorld(target);
    return true;
  }
  alignBlade(target: THREE.Vector3) {
    const visual = this.visual;
    if (!visual || this.role !== "skater" || (this.currentState !== "play" && this.currentState !== "faceoff-stance" && !this.drawTime)) return;
    const blade = new THREE.Vector3();
    if (!this.bladePoint(blade)) return;
    const delta = visual.worldToLocal(target.clone()).sub(visual.worldToLocal(blade)).clampLength(0,.29);
    if (delta.lengthSq() < .0004) return;
    const relativeRotation = (bone: THREE.Object3D) => {
      bone.updateWorldMatrix(true, false);
      const relative = visual.matrixWorld.clone().invert().multiply(bone.matrixWorld);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(relative));
    };
    for (const side of ["R", "L"] as const) {
      const hand = this.bones.get("Hand."+side), elbow = this.bones.get("Forearm."+side);
      if (!hand || !elbow) continue;
      const point = visual.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).add(delta);
      const pole = visual.worldToLocal(elbow.getWorldPosition(new THREE.Vector3()));
      const grip = relativeRotation(hand);
      this.reachArm(side, point, pole);
      if (!this.previousRotations.has(hand)) this.previousRotations.set(hand, hand.quaternion.clone());
      hand.quaternion.copy(relativeRotation(elbow).invert().multiply(grip));
    }
  }
  private play(name: string, once = false) {
    const next = this.actions.get(name);
    if (!next || (!once && this.active === next && next.isRunning())) return;
    if (this.active && this.active !== next) this.active.fadeOut(0.14);
    next
      .reset()
      .setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = 1;
    next.time = once ? 0 : this.offset * next.getClip().duration;
    next.fadeIn(0.14).play();
    this.active = next;
    this.busy = once ? Math.max(0, next.getClip().duration - 0.12) : 0;
  }
  get currentState() {
    return this.driver.currentState;
  }
  get motion() {
    const s = this.driver.skeletonSource();
    return {
      speed: s.speed,
      stopping: s.stopping,
      x: this.driver.x,
      z: this.driver.z,
      yaw: s.yaw,
    };
  }
  private paintLettering() {
    const material=this.lettering, id=this.identity;
    if (!material) return;
    material.visible=!!id;
    if (!id) return;
    const canvas=this.letteringMap?.image ?? document.createElement("canvas");
    canvas.width=canvas.height=256;
    const ctx=canvas.getContext("2d")!;
    const light=new THREE.Color(this.kit.jersey).getHSL({h:0,s:0,l:0}).l>.62;
    ctx.fillStyle=light ? this.kit.pants : "#f8f5eb";
    ctx.strokeStyle=light ? "#f8f5eb" : this.kit.pants;
    ctx.lineJoin="round"; ctx.textAlign="center"; ctx.textBaseline="middle";
    const surname=id.name.trim().split(/\s+/).at(-1)!.toUpperCase();
    ctx.font="bold 28px Arial";ctx.lineWidth=2;
    ctx.strokeText(surname,128,30,236);ctx.fillText(surname,128,30,236);
    ctx.font="bold 158px Arial";ctx.lineWidth=7;
    ctx.strokeText(String(id.number),128,144,194);ctx.fillText(String(id.number),128,144,194);
    if (!this.letteringMap) {
      this.letteringMap=new THREE.CanvasTexture(canvas);
      this.letteringMap.colorSpace=THREE.SRGBColorSpace;
      this.letteringMap.flipY=false;
      material.map=this.letteringMap;
      material.needsUpdate=true;
    }
    const mirrored=this.role==="skater" && this.driver.hs<0;
    this.letteringMap.repeat.x=mirrored ? -1 : 1;
    this.letteringMap.offset.x=mirrored ? 1 : 0;
    this.letteringMap.needsUpdate=true;
  }
  setIdentity(id: RigIdentity, pos: string) {
    if (this.root.userData.playerId === id.id) return;
    this.driver.setIdentity(id, pos);
    this.identity=id;
    this.paintLettering();
    this.drawTime=this.impact=0;
    this.mixer?.stopAllAction();
    this.active = undefined;
    this.overlay=undefined;
    this.shotTime = this.busy = this.catchTime = this.passTime = this.glide = 0;
    this.gliding = false;
    this.offset = (id.number * 0.61803398875) % 1;
    this.root.userData.playerId = id.id;
  }
  place(x: number, z: number, yaw: number) {
    this.driver.place(x, z, yaw);
  }
  setState(state: RigState, variant?: number, side?: number) {
    this.driver.setState(state, variant, side);
  }
  setVisible(v: boolean) {
    this.driver.setVisible(v);
  }
  trigger(
    kind: RigActionKind,
    toward?: { x: number; z: number },
    height?: number,
  ) {
    if(this.role==="skater" && (kind==="draw" || kind==="tie-up")){
      if(toward) this.drawDot.set(toward.x,.038,toward.z);
      this.drawTime=.44;
      this.drawWinner=kind==="draw";
      this.drawYaw=this.motion.yaw;
      return;
    }
    if(this.role==="official" && kind==="drop"){
      this.officialRelease=.55;
      return;
    }
    this.driver.trigger(kind, toward, height);
    if (["wrist","shot","slap","snap"].includes(kind) && this.role === "skater") {
      this.shotLength = kind === "slap" ? .65 : kind === "snap" ? .3 : .47;
      this.shotTime = this.shotLength;
      this.shotTurn = toward ? Math.sin(Math.atan2(toward.x,toward.z)-this.motion.yaw) : 0;
    }
    if (kind === "pass" && this.role === "skater") {
      this.passTime = .46;
      const yaw = this.motion.yaw;
      this.passDirection.set(toward?.x ?? Math.sin(yaw), 0, toward?.z ?? Math.cos(yaw)).normalize();
      return;
    }
    if(kind==="receive"){this.catchTime=.36;return;}
    if(kind==="check" || kind==="checked"){
      const yaw=this.motion.yaw;
      const lateral=(toward?.x??0)*Math.cos(yaw)-(toward?.z??0)*Math.sin(yaw);
      this.impactSide=Math.sign(lateral || 1)*(kind==="check" ? 1 : -1);
      this.impact=kind==="check" ? .42 : .55;
    }
    if(this.overlay && (kind==="save" || kind==="beaten"))this.fadeRemaining=.14;
    if(kind==="save"){
      this.saveHeight=height??0;
      const yaw=this.motion.yaw;
      this.saveSide=Math.sign((toward?.x??0)*Math.cos(yaw)-(toward?.z??0)*Math.sin(yaw) || 1);
      if(this.busy>0 && ["Glove sweep","Butterfly"].includes(this.active?.getClip().name??"")) return;
    }
    const clip =
      this.role === "goalie"
        ? kind === "save" && (height ?? 0) > 0.48
          ? "Glove sweep"
          : "Butterfly"
        : shotClips[kind];
    if (clip) this.play(clip, true);
  }
  update(dt: number, animDt: number, input: RigInput) {
    this.officialRelease=Math.max(0,this.officialRelease-animDt);
    this.drawTime=Math.max(0,this.drawTime-animDt);
    const drawing=this.drawTime>0;
    this.driver.update(dt, animDt, drawing ? {...input,face:this.drawYaw} : input);
    if (!this.visual || !this.mixer || !this.root.visible) return;
    const source = this.driver.skeletonSource();
    const speedChange = (source.speed-this.previousSpeed) / Math.max(dt, .016);
    const angularSpeed = Math.sin(source.yaw-this.previousYaw) / Math.max(dt,.016);
    const turnRate = Math.abs(angularSpeed);
    this.previousSpeed = source.speed;
    this.previousYaw = source.yaw;
    const settled = 1-THREE.MathUtils.smoothstep(speedChange, .3, 3.3);
    const straight = 1-THREE.MathUtils.smoothstep(turnRate, .35, 2.15);
    const clearIce = THREE.MathUtils.smoothstep(input.pressure ?? 8, 1.2, 3.4);
    const upright = this.role === "skater" && this.currentState === "play" && !source.stopping
      ? settled * straight * clearIce * (input.hasPuck ? .58 : 1)
      : 0;
    this.glide += (upright-this.glide) * (1-Math.exp(-dt*6));
    this.gliding = this.glide > (this.gliding ? .47 : .66);
    this.visual.scale.copy(source.build.scale);
    if (this.role === "skater") this.visual.scale.x *= source.hs;
    this.visual.rotation.copy(source.build.rotation);
    this.busy -= animDt;
    if (this.busy <= 0) {
      const state = this.currentState;
      let clip = "Watching play";
      if (this.role === "official") {
        clip =
          state === "official-washout"
            ? "Washout"
            : state === "official-point"
              ? "Goal point"
              : state === "official-arm"
                ? "Signal"
                : source.speed > 0.5
                  ? "Stride"
                  : "";
      }
      if (this.role === "coach")
        clip = state === "coach-review" ? "Coach challenge" : "";
      if (this.role === "skater") {
        if (state === "celebrate" || state === "hug" || state === "fist-bump")
          clip = "Celebrate";
        else if (state === "bench-cheer" || state === "bench-stand")
          clip = "Rise at goal";
        else if (state === "faceoff-stance" || drawing) clip = "Brace";
        else if (state === "play" && source.stopping) clip = "Brake";
        else if (state === "play" && source.speed > 0.45 && !this.gliding) clip = "Stride";
      }
      if (clip==="Brace" && (state==="faceoff-stance" || drawing)){
        if(this.active!==this.actions.get(clip) || !this.active?.paused){
          this.play(clip);
          if(this.active){
            this.active.time=this.active.getClip().duration*.32;
            this.active.paused=true;
          }
        }
      } else if (clip) this.play(clip);
      else if (this.active) {
        this.active.fadeOut(0.18);
        this.active = undefined;
      }
      if (clip === "Stride" && this.active)
        this.active.timeScale = THREE.MathUtils.clamp(
          source.speed / 4.8 * (1-.52*this.glide),
          0.32,
          1.65,
        );
    }
    for(const [bone,q] of this.previousRotations) bone.quaternion.copy(q);
    this.previousRotations.clear();
    if (this.pelvisHeight !== undefined) {
      const pelvis = this.bones.get("Pelvis");
      if (pelvis) pelvis.position.y = this.pelvisHeight;
      this.pelvisHeight = undefined;
    }
    this.mixer.update(animDt);
    this.motionTime+=animDt;
    const pose=(name:string,x:number,y:number,z:number)=>{
      const bone=this.bones.get(name);
      if(!bone) return;
      if (!this.previousRotations.has(bone)) this.previousRotations.set(bone,bone.quaternion.clone());
      bone.rotateX(x);bone.rotateY(y);bone.rotateZ(z);
    };
    this.shotTime = Math.max(0,this.shotTime-animDt);
    if (this.shotTime>0) {
      const t=1-this.shotTime/this.shotLength;
      const follow=Math.sin(Math.PI*t);
      const weight=THREE.MathUtils.smoothstep(t,0,.45)*(1-THREE.MathUtils.smoothstep(t,.58,1));
      pose("Pelvis",0,.09*source.hs*weight,.075*source.hs*weight);
      pose("Forearm.R",-.10*weight,0,.055*source.hs*weight);
      pose("Chest",-.08*follow,(this.shotTurn*.24+source.hs*.12)*follow,0);
      pose("Spine",0,0,source.hs*.09*follow);
    }
    this.impact=Math.max(0,this.impact-animDt);
    if(this.impact>0){
      const brace=Math.sin(Math.PI*Math.min(1,this.impact/.56));
      pose("Chest",.12*brace,0,.18*this.impactSide*brace);
      pose("Head",-.08*brace,0,-.10*this.impactSide*brace);
    }
    const vault = input.vault ?? 0;
    const lift = Math.sin(Math.PI*vault);
    this.visual.position.y = lift * .91;
    // The helmet projects beyond the hips in the crouch. Set the skates
    // back on approach, then carry the weight forward through the draw.
    const setBack=this.currentState==="faceoff-stance" ? 1 : drawing ?
      THREE.MathUtils.smoothstep(this.drawTime,0,.44) : 0;
    this.visual.position.z=THREE.MathUtils.damp(this.visual.position.z,-.14*setBack,18,dt);
    if (lift>.001) {
      for (const [side,offset] of [["L",.12],["R",-.12]] as const) {
        const knee=Math.sin(Math.PI*THREE.MathUtils.clamp(vault+offset,0,1))*lift;
        pose("Thigh."+side,-.83*knee,0,side==="L"?.32*knee:-.32*knee);
        pose("Shin."+side,1.09*knee,0,0);
      }
      this.visual.rotateY(.69*lift);
      pose("Chest",.32*lift,0,.16*lift);
      const freeHand = this.bones.get("Hand.L");
      if (freeHand) {
        const hand=this.visual.worldToLocal(freeHand.getWorldPosition(new THREE.Vector3()));
        const rail=this.visual.worldToLocal(new THREE.Vector3(input.x+.26,1.12,-13.24));
        this.reachArm("L",hand.lerp(rail,lift),new THREE.Vector3(.5,1.05,.21));
      }
    }
    this.catchTime=Math.max(0,this.catchTime-animDt);
    this.passTime = Math.max(0, this.passTime-animDt);
    if (this.passTime > 0 && this.currentState === "play") {
      const age = .46-this.passTime;
      const load = Math.sin(Math.PI*age/.46);
      const shift = age<.2 ? -Math.sin(Math.PI*age/.2)*.08 : Math.sin(Math.PI*(age-.2)/.26)*.12;
      pose("Spine",0,0,shift*source.hs);
      const towardStick = this.passDirection.x*Math.cos(source.yaw)-this.passDirection.z*Math.sin(source.yaw);
      pose("Chest", .08*load, .16*load*towardStick*source.hs, 0);
      if (age >= .20 && !input.hasPuck) {
        const blade = new THREE.Vector3();
        if (this.bladePoint(blade)) {
          blade.addScaledVector(this.passDirection, .18*load);
          blade.y = .032 + .046*load;
          this.alignBlade(blade);
        }
      }
    }
    if(this.catchTime>0){
      const give=Math.sin(this.catchTime/.36*Math.PI);
      pose("Forearm.L",.18*give,0,.14*give);pose("Forearm.R",.14*give,0,.10*give);
    }
    const st=this.currentState;
    if (this.role === "skater" && st === "play" && !drawing && this.busy <= 0) {
      if (lift < .001) this.adjustHipHeight(.14*this.glide);
      const cross = THREE.MathUtils.clamp(angularSpeed,-2,2)*Math.min(1,source.speed/4);
      pose("Chest",0,-cross*.055,0);
      pose("Head",-.045*this.glide, cross*.08,0);
      pose("Spine", -.23*this.glide, 0, THREE.MathUtils.clamp(angularSpeed*.035,-.12,.12)*Math.min(1,source.speed/3));
    }
    if(st==="official-holding" || st==="official-roughing"){
      const holding=st==="official-holding";
      this.reachArm("R",new THREE.Vector3(holding?-.035:-.17,holding?1.28:1.54,.43),new THREE.Vector3(-.50,1.09,.32));
      if(holding)this.reachArm("L",new THREE.Vector3(.046,1.26,.42),new THREE.Vector3(.48,1.07,.31));
      pose("Head",.035*Math.sin(this.motionTime*5),0,0);
    } else if(st==="official-drop" || st==="faceoff-stance" || drawing){
      if(st==="official-drop"){
        pose("Spine",.23,0,-.045);
        const release=this.officialRelease>0 ? 1-this.officialRelease/.55 : 0;
        const down=Math.sin(Math.PI*release);
        this.reachArm("R",new THREE.Vector3(-.09,1.01-.16*down,.54+.07*down),new THREE.Vector3(-.35,1.16,.30));
      } else {
        if(!drawing) this.drawDot.set(input.puckX,.038,input.puckZ);
        const phase=drawing ? 1-this.drawTime/.44 : 0;
        const pull=THREE.MathUtils.smoothstep(phase,.08,.64);
        const recover=THREE.MathUtils.smoothstep(phase,.62,1);
        const load=1-recover;
        this.adjustHipHeight(-.085*load);
        pose("Spine",.23*load,0,0);
        pose("Chest",.09*load,source.hs*(.14+.23*pull)*load,0);
        pose("Head",-.12*load,0,0);
        const yaw=drawing ? this.drawYaw : source.yaw;
        const across=source.hs*(.045+(this.drawWinner ? .18 : .075)*pull);
        const back=drawing && this.drawWinner ? -.25*pull : 0;
        const blade=this.drawDot.clone();
        blade.x+=Math.cos(yaw)*across+Math.sin(yaw)*back;
        blade.z+=-Math.sin(yaw)*across+Math.cos(yaw)*back;
        blade.y+=.035*recover;
        this.alignBlade(blade);
      }
    } else if(st==="faceoff-ready" && this.role==="skater"){
      const near=1-THREE.MathUtils.smoothstep(Math.hypot(input.puckX-input.x,input.puckZ-input.z),3,10);
      pose("Spine",.12*near,0,0);
      pose("Chest",0,.09*source.hs*near,0);
      pose("Head",-.08*near,0,0);
    } else if(this.role==="skater" && st==="seated"){
      const track=Math.atan2(input.puckX-input.x,Math.max(2,input.puckZ-input.z));
      const breath=Math.sin(this.motionTime*1.4+this.offset*9);
      pose("Chest",.12+.035*breath,.13*track,0);
      pose("Head",-.08,.34*track,0);
      pose("UpperArm.L",-.08-.04*this.offset,0,.04);
      pose("Forearm.R",.10+.035*breath,0,0);
    } else if(this.role==="goalie" && this.busy<=0){
      const depth=Math.hypot(input.puckX-input.x,input.puckZ-input.z);
      const set=1-THREE.MathUtils.smoothstep(depth,6,21);
      const slide=THREE.MathUtils.clamp((input.vx*Math.cos(source.yaw)-input.vz*Math.sin(source.yaw))/3,-1,1);
      pose("Spine",.12*set,0,-.09*slide);
      pose("UpperArm.L",-.07*set,0,.09*set);
      pose("UpperArm.R",-.05*set,0,-.07*set);
    } else if(this.role==="goalie" && this.busy>0){
      const a=this.active, u=a ? a.time/a.getClip().duration : 0;
      const extension=Math.sin(Math.PI*THREE.MathUtils.clamp(u,0,1));
      pose("Spine",.06*extension,0,this.saveSide*.19*extension);
      const reaching=this.saveSide>0 ? "L" : "R";
      pose("UpperArm."+reaching,-(.07+.17*this.saveHeight)*extension,0,this.saveSide*.13*extension);
      pose("Head",-.08*extension,.10*this.saveSide*extension,0);
    } else if(this.role==="skater" && st==="play" && input.pressure!==undefined && input.pressure<2.2){
      pose("Chest",.1, .16*this.driver.skeletonSource().hs,0);
    }
    this.updateOverlay(animDt);
    if (this.role === "skater" && st === "play" && !drawing && this.busy <= 0) {
      const look = Math.atan2(input.puckX-input.x, input.puckZ-input.z)-source.yaw;
      pose("Head", .1*this.glide, input.hasPuck ? 0 : Math.sin(look)*.36, 0);
    }
  }
  dispose() {
    this.released = true;
    this.wristCuff?.dispose();
    this.wristFabric?.dispose();
    this.letteringMap?.dispose();
    this.lettering?.dispose();
    if (this.visual) {
      this.mixer?.stopAllAction();
      this.mixer?.uncacheRoot(this.visual);
      this.skeletons.forEach(skeleton => skeleton.dispose());
      this.visual.removeFromParent();
    }

    this.driver.dispose();
  }
}
