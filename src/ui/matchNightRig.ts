import {WRIST_LOAD,WRIST_RELEASE,WRIST_END} from "../engine/wristShot";
import faceData from "../assets/match-night/player-faces.json";
import { stableHash } from "../engine/potential";
import benchMotion from "../assets/match-night/bench-motion.json";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

// Batch only parts authored with the same shading and motion. Do this on the
// template so all lineup slots and bench players reuse the packed buffers.
function batchMatchModel(model:GLTF,role:Role){
  const groups=new Map<THREE.Object3D,Map<string,THREE.Mesh[]>>();
  model.scene.traverse(node=>{
    if(!(node instanceof THREE.Mesh) || !node.parent || Array.isArray(node.material))return;
    const mat=node.material as THREE.MeshStandardMaterial;
    const cloth=node instanceof THREE.SkinnedMesh && mat.name.startsWith(role+" Cloth ");
    const rigid=role==="coach" && /^(Finger|Thumb|Palm|Pocket welt|Horn jacket button|Notched lapel|Trouser leg|Derby)/.test(node.name);
    if(!cloth && !rigid)return;
    let byMaterial=groups.get(node.parent);
    if(!byMaterial)groups.set(node.parent,byMaterial=new Map());
    const key=cloth ? "club cloth" : mat.uuid;
    let siblings=byMaterial.get(key);
    if(!siblings)byMaterial.set(key,siblings=[]);
    siblings.push(node);
  });
  for(const groupsByMaterial of groups.values())for(const parts of groupsByMaterial.values()){
    if(parts.length<2)continue;
    const first=parts[0], skin=first instanceof THREE.SkinnedMesh;
    if(skin && parts.some(p=>!(p instanceof THREE.SkinnedMesh) || p.skeleton!==first.skeleton ||
      !p.bindMatrix.equals(first.bindMatrix) || !p.matrix.equals(first.matrix)))continue;
    const geometries=parts.map(p=>skin ? p.geometry : p.geometry.clone().applyMatrix4(p.matrix));
    const merged=mergeGeometries(geometries);
    if(!merged)continue;
    first.geometry=merged;
    if(!skin){first.position.set(0,0,0);first.quaternion.identity();first.scale.setScalar(1);first.updateMatrix();}
    for(const p of parts.slice(1))p.removeFromParent();
  }
  return model;
}

export class MatchNightFactory {
  private readonly drivers = new RigFactory();
  private readonly loader = new GLTFLoader();
  private readonly palettes = new Map<string, Map<THREE.Material, THREE.Material>>();
  whenLoaded(){return Promise.allSettled(this.models.values());}
  private readonly models = new Map<Role, Promise<GLTF>>();
  private readonly uniforms = new Map<string, THREE.Texture>();
  private faces?: THREE.Texture;
  private disposed = false;
  private player(driver: HockeyRig, kit: TeamKit, role: Role) {
    let model = this.models.get(role);
    if (!model) {
      model = this.loader.loadAsync(urls[role]).then(g=>batchMatchModel(g,role));
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
    if (!this.faces && role!=="official") {
      this.faces=new THREE.TextureLoader().load(new URL("../assets/match-night/player-faces.webp",import.meta.url).href);
      this.faces.colorSpace=THREE.SRGBColorSpace;
      this.faces.flipY=false;
    }
    return new MatchNightPlayer(driver, role, kit, model, fabric, palette,this.faces);
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
    this.faces?.dispose();
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

  private bounds = new Map<THREE.Skeleton, {meshes: THREE.SkinnedMesh[]; radii: number[]}>();
  private jointMatrix = new THREE.Matrix4();
  private heel=0;
  private toe=0;
  private wristAge=WRIST_END;
  private wristAim=0;
  private bladeRoll=0;
  private bladeAnchors:{bone:THREE.Bone;local:THREE.Vector3;weight:number}[][]=[];
  private bladeSample=new THREE.Vector3();
  private bladeToe=new THREE.Vector3();
  private bones=new Map<string,THREE.Object3D>();
  private previousRotations=new Map<THREE.Object3D,THREE.Quaternion>();
  private pelvisRest?: THREE.Vector3;
  private edgeLean = 0;
  private previousSpeed = 0;
  private previousYaw = 0;
  private glide = 0;
  private gliding = false;
  private motionTime=0;
  private shieldLean=0;
  private saveSide=1;
  private saveHeight=0;
  private officialRelease=0;
  private drawTime=0;
  private drawWinner=false;
  private drawDot=new THREE.Vector3();
  private drawYaw=0;
  private impact=0;
  private absorbingHit=false;
  private contactWeight=1;
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
  private faceMaterial?: THREE.Material;
  private jawAndBridge=new THREE.Vector2();
  private cheekColor=new THREE.Color();
  private faceProfile=new THREE.Vector4(0,0,1,1);
  private personalMaterials:THREE.Material[]=[];
  private jerseyInk:{value:THREE.Texture|null}={value:null};
  private inkMirror={value:1};
  private lettering?: THREE.MeshStandardMaterial;
  private letteringMap?: THREE.CanvasTexture;
  private catchTime=0;
  private blockTime=0;
  private runners: {bone:THREE.Bone;points:THREE.Vector3[]}[]=[];
  private solePoint=new THREE.Vector3();
  private gripOffset?:THREE.Vector3;
  private gripRotation?:THREE.Quaternion;
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
    faces?: THREE.Texture,
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
              if(pos.getY(i)<.055 && pos.getX(i)>pos.getX(this.toe))this.toe=i;
              if(score<best){best=score;this.heel=i;}
            }
            const weights=o.geometry.attributes.skinWeight,indices=o.geometry.attributes.skinIndex;
            this.bladeAnchors=[this.heel,this.toe].map(vertex=>{
              const anchors=[];
              for(let i=0;i<4;i++){
                const weight=weights.getComponent(vertex,i);
                if(weight===0)continue;
                const joint=indices.getComponent(vertex,i);
                anchors.push({weight,bone:o.skeleton.bones[joint],local:new THREE.Vector3()
                  .fromBufferAttribute(pos,vertex).applyMatrix4(o.bindMatrix).applyMatrix4(o.skeleton.boneInverses[joint])});
              }
              return anchors;
            });
          }
          if(role==="skater" && o instanceof THREE.SkinnedMesh && !Array.isArray(o.material) && o.material.name==="skater Equipment"){
            const {position,skinWeight,skinIndex}=o.geometry.attributes;
            for(const side of ["L","R"]){
              const joint=o.skeleton.bones.findIndex(b=>(b.userData.name??b.name).replace(".","")==="Foot"+side);
              if(joint<0)continue;
              // Keep sole contacts in bone space. Four points cover both ends and the rocker.
              const bins=new Map<number,THREE.Vector3>();
              for(let i=0;i<position.count;i++){
                if(skinIndex.getX(i)!==joint || skinWeight.getX(i)<.98 || position.getY(i)>.065)continue;
                const pt=new THREE.Vector3().fromBufferAttribute(position,i), bin=Math.floor(pt.z/.055);
                if(!bins.has(bin) || pt.y<bins.get(bin)!.y)bins.set(bin,pt);
              }
              const points=[...bins.values()].map(pt=>pt.applyMatrix4(o.bindMatrix).applyMatrix4(o.skeleton.boneInverses[joint]));
              if(points.length)this.runners.push({bone:o.skeleton.bones[joint],points});
            }
          }
          const tint = (m: THREE.MeshStandardMaterial) => {
            if(faces && m.name.endsWith("Cornea")){
              // The photograph already carries the catchlight from the eyes.
              o.visible=false;
            }
            if (m.name.endsWith("Roster lettering")) {
              this.lettering = m.clone();
              this.lettering.opacity = 1;
              this.paintLettering();
              if(role==="skater")o.visible=false;
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
              if(m.name.endsWith("Blade tape")){
                local.roughness=.96;
                local.onBeforeCompile=shader=>{
                  shader.vertexShader="varying vec3 tapePoint;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\ntapePoint=position;");
                  shader.fragmentShader="varying vec3 tapePoint;\n"+shader.fragmentShader.replace("#include <color_fragment>",`
                    #include <color_fragment>
                    float wrap=tapePoint.x*75.+tapePoint.y*20.+tapePoint.z*24.;
                    float detail=1.-smoothstep(.08,.48,fwidth(wrap));
                    float overlap=1.-smoothstep(.02,.14,abs(fract(wrap)-.5));
                    diffuseColor.rgb*=1.-.19*overlap*detail;
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
            if(role==="skater" && m.name.includes("Cloth ")){
              const cloth=copy.clone() as THREE.MeshStandardMaterial;
              const base=copy.onBeforeCompile.bind(copy);
              cloth.customProgramCacheKey=()=>"knit-with-roster";
              cloth.onBeforeCompile=(shader,renderer)=>{
                base(shader,renderer);
                shader.uniforms.rosterInk=this.jerseyInk;
                shader.uniforms.readDirection=this.inkMirror;
                shader.vertexShader="varying float backFacing;\n"+shader.vertexShader.replace("patternPoint=position;","patternPoint=position; backFacing=-normal.z;");
                shader.fragmentShader="uniform sampler2D rosterInk; uniform float readDirection; varying float backFacing;\n"+shader.fragmentShader.replace("diffuseColor.rgb*=dye;",`
                  diffuseColor.rgb*=dye;
                  vec2 uvInk=vec2(.5-(patternPoint.x+.037)*readDirection/.39,(1.52-patternPoint.y)/.42);
                  if(all(greaterThanEqual(uvInk,vec2(0.))) && all(lessThanEqual(uvInk,vec2(1.))) && backFacing>.15 && patternPoint.z<.15){
                    vec4 ink=texture2D(rosterInk,uvInk);
                    diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,ink.a);
                  }`);
              };
              this.personalMaterials.push(cloth);
              return cloth;
            }
            if(role==="coach"){
              const mat=copy.clone() as THREE.MeshStandardMaterial;
              const seed=stableHash(this.identity?.id ?? "staff");
              const profile=faceData.profiles[("r"+seed%180) as keyof typeof faceData.profiles];
              const skin=new THREE.Color().setRGB(profile[5],profile[6],profile[7]);
              mat.metalness=0;
              if(/wool|trousers|worsted lapel/.test(m.name)){
                mat.color.set(kit.jersey);
                mat.color.multiplyScalar(m.name.endsWith("lapel") ? 1.4 : 1);
                mat.roughness=.92;
              }
              if(m.name.endsWith("teal"))mat.color.set(kit.trim);
              if(m.name.includes("Skin |") || m.name.endsWith("hands"))mat.color.copy(skin);
              else if(/Espresso|hair|Hair|Eyebrows|cropped/.test(m.name))mat.color.set(["#393331","#574033","#817770","#302721"][seed%4]);
              else if(m.name.endsWith("collar") || m.name.includes("sclera"))mat.color.set("#d5dadc");
              else if(m.name.endsWith("teal"))mat.color.set(kit.trim);
              else mat.color.set(m.name.endsWith("wool") || m.name.endsWith("lapel") ? kit.jersey : "#262931");
              if(m.name.includes("Corneal")){mat.transparent=true;mat.opacity=.09;mat.depthWrite=false;}
              if(m.name.includes("Skin |") && faces){
                mat.onBeforeCompile=shader=>{
                  shader.uniforms.portraits={value:faces};
                  shader.uniforms.staffTile={value:new THREE.Vector2(profile[0]%faceData.columns,Math.floor(profile[0]/faceData.columns))};
                  shader.vertexShader="varying vec3 headPos;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nheadPos=position;");
                  shader.fragmentShader="varying vec3 headPos; uniform sampler2D portraits; uniform vec2 staffTile;\n"+shader.fragmentShader.replace("#include <color_fragment>",`
                    #include <color_fragment>
                    vec2 uv=vec2(.5+(headPos.x-.002)/.17,.354+(.21-headPos.y)/.20);
                    float mask=(1.-smoothstep(.7,1.,length((uv-vec2(.5,.50))*vec2(2.,1.7))))*smoothstep(.025,.083,headPos.z);
                    diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(portraits,(staffTile+clamp(uv,.01,.99))/vec2(${faceData.columns}.0,${faceData.rows}.0)).rgb,mask*.9);`);
                };
              }
              this.personalMaterials.push(mat);
              return mat;
            }
            if(faces && (m.name==="skater Equipment" || m.name==="goalie Equipment")){
              const material=copy.clone() as THREE.MeshStandardMaterial;
              const base=copy.onBeforeCompile.bind(copy);
              material.customProgramCacheKey=()=>"portrait-"+role;
              material.onBeforeCompile=(shader,renderer)=>{
                base(shader,renderer);
                shader.uniforms.faceAtlas={value:faces};
                shader.uniforms.faceProfile={value:this.faceProfile};
                shader.uniforms.jawAndBridge={value:this.jawAndBridge};
                shader.uniforms.cheekColor={value:this.cheekColor};
                shader.vertexShader="uniform vec2 jawAndBridge; uniform vec3 cheekColor; uniform vec4 faceProfile; varying vec3 portraitUV; varying float skinSide; varying float iris;\n"+shader.vertexShader.replace("#include <begin_vertex>",`
                  #include <begin_vertex>
                  float skin=float(color.r>color.g*1.16 && color.g>color.b*1.035);
                  // The original sclera and iris share the equipment primitive. Project
                  // the same aligned portrait across the eye opening and its lids.
                  float eyeZone=(1.-smoothstep(.018,.025,abs(abs(position.x+.037)-.031)))
                    *(1.-smoothstep(.010,.016,abs(position.y-1.705)))
                    *smoothstep(.348,.363,position.z)*(1.-smoothstep(.385,.395,position.z));
                  iris=eyeZone*(1.-smoothstep(.02,.07,distance(color.rgb,vec3(.0194,.0232,.0232))));
                  skin=max(skin,eyeZone);
                  float front=smoothstep(.23,.31,position.z);
                  float cheek=skin*front*smoothstep(1.55,1.59,position.y)*(1.-smoothstep(1.724,1.76,position.y));
                  vec2 face=vec2(.5+(position.x+.037)/.17,.354+(1.705-position.y)/.19);
                  portraitUV=vec3(face,cheek);
                  skinSide=skin*smoothstep(.09,.21,color.r)*smoothstep(1.50,1.58,position.y)*(1.-smoothstep(1.73,1.76,position.y));
                  float jaw=exp(-pow(abs(position.y-1.617)/.037,2.));
                  float chin=exp(-pow(abs(position.y-1.601)/.026,2.)-pow(abs(position.x+.037)/.047,2.));
                  float bridge=exp(-pow(abs(position.x+.037)/.020,2.)-pow(abs(position.y-1.672)/.034,2.));
                  transformed.x+=(position.x+.037)*.32*jawAndBridge.x*jaw*cheek;
                  transformed.z+=(.023*jawAndBridge.y*bridge+.013*jawAndBridge.x*jaw+.008*chin*(faceProfile.w-1.)/.14)*cheek;
                  transformed.x+=(position.x+.037)*(faceProfile.z-1.)*cheek;
                  transformed.y+=(position.y-1.705)*(faceProfile.w-1.)*cheek;
                `);
                shader.fragmentShader="uniform sampler2D faceAtlas; uniform vec2 jawAndBridge; uniform vec3 cheekColor; uniform vec4 faceProfile; varying vec3 portraitUV; varying float skinSide; varying float iris;\n"+shader.fragmentShader.replace("#include <color_fragment>",`
                  #include <color_fragment>
                  vec2 uvFace=portraitUV.xy;
                  float blend=(1.-smoothstep(.77,1.,length((uvFace-vec2(.5,.49))*vec2(2.,1.7))))*portraitUV.z;
                  vec2 tile=(faceProfile.xy+clamp(uvFace,.012,.988))/vec2(${faceData.columns}.0,${faceData.rows}.0);
                  diffuseColor.rgb=mix(diffuseColor.rgb,cheekColor,skinSide*.78);
                  diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(faceAtlas,tile).rgb,blend*.94);
                  diffuseColor.rgb*=1.-.74*iris;
                `);
              };
              this.faceMaterial=material;
              return material;
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
        if(role==="goalie" || role==="skater"){
          // Anchor the underglove to the distal forearm so extension cannot
          // expose daylight between the jersey sleeve and the catching cuff.
          this.wristCuff=role==="goalie" ? new THREE.CylinderGeometry(.059,.073,.25,16) : new THREE.CylinderGeometry(.041,.055,.14,12);
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
            if(name.startsWith("Coach head pivot")){
              this.bones.set("Head",node);
              const traits=stableHash(this.identity?.id ?? "staff");
              node.scale.multiply(new THREE.Vector3(.90+(traits&255)/1200,.94+((traits>>>8)&255)/2000,.92+((traits>>>16)&255)/1550));
            }
            const support=this.identity?.name==="Athletic trainer" || this.identity?.name==="Equipment manager";
            if(support && /tablet|Woven club tie/i.test(name))node.visible=false;
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
        const top=this.bones.get("Hand.R"), lower=this.bones.get("Hand.L");
        if(role==="skater" && top && lower){
          this.gripOffset=top.worldToLocal(lower.getWorldPosition(new THREE.Vector3()));
          this.gripRotation=top.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(lower.getWorldQuaternion(new THREE.Quaternion()));
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
    const chest=this.bones.get("Chest");
    if(chest && (this.role==="skater" || this.role==="goalie")){
      const sternum=point(chest),sign=side==="L"?1:-1;
      const clearance=THREE.MathUtils.clamp(1-Math.abs(target.y-sternum.y)/.34,0,1);
      if(clearance>0 && Math.abs(target.x-sternum.x)<.23){
        target.z=Math.max(target.z,sternum.z+(.19-Math.abs(target.x-sternum.x)*.28)*clearance);
      }
      pole.x=sternum.x+sign*Math.max(.23,sign*(pole.x-sternum.x));
    }
    const l1=origin.distanceTo(elbow),l2=elbow.distanceTo(end),axis=target.clone().sub(origin);
    const d=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.001,l1+l2-.001);
    if(axis.lengthSq()<1e-8)return;
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
  private keepBladeAboveIce(){
    const wrist=this.bones.get("Hand.R"),blade=new THREE.Vector3();
    if(!wrist?.parent || !this.bladePoint(blade) || blade.y>=.022)return;
    const palm=wrist.getWorldPosition(new THREE.Vector3());
    const vector=blade.clone().sub(palm),length=vector.length();
    if(length<.01)return;
    const height=THREE.MathUtils.clamp(.022-palm.y,-length,length);
    const reach=Math.sqrt(Math.max(0,length*length-height*height));
    const horizontal=Math.hypot(vector.x,vector.z);
    if(horizontal<.001)return;
    const desired=new THREE.Vector3(vector.x*reach/horizontal,height,vector.z*reach/horizontal).add(palm);
    const from=wrist.parent.worldToLocal(blade).sub(wrist.position).normalize();
    const to=wrist.parent.worldToLocal(desired).sub(wrist.position).normalize();
    if(!this.previousRotations.has(wrist))this.previousRotations.set(wrist,wrist.quaternion.clone());
    wrist.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));
  }
  releaseWrist(){if(this.wristAge<WRIST_END)this.wristAge=Math.max(this.wristAge,WRIST_RELEASE);}
  private followShaft() {
    const top=this.bones.get("Hand.R"),lower=this.bones.get("Hand.L"),elbow=this.bones.get("Forearm.L");
    if(!top || !lower || !elbow || !this.visual || !this.gripOffset || !this.gripRotation)return;
    const target=this.visual.worldToLocal(top.localToWorld(this.gripOffset.clone()));
    const current=this.visual.worldToLocal(lower.getWorldPosition(new THREE.Vector3()));
    if(target.distanceToSquared(current)>.000025){
      this.reachArm("L",target,new THREE.Vector3(.43,1.08,.24));
    }
    // Resolve relative rotations in model space so mirrored left shots carry the same grip.
    const basis=this.visual.matrixWorld.clone().invert();
    for(const bone of [top,elbow])bone.updateWorldMatrix(true,false);
    const rotation=(bone:THREE.Object3D)=>new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().extractRotation(basis.clone().multiply(bone.matrixWorld)));
    if(!this.previousRotations.has(lower))this.previousRotations.set(lower,lower.quaternion.clone());
    lower.quaternion.copy(rotation(elbow).invert().multiply(rotation(top)).multiply(this.gripRotation));
  }
  /** Move the hips while keeping each animated skate's position and edge angle. */
  private adjustHipHeight(metres: number, trail=0, stride=0, bank=0, transfer=0) {
    const pelvis = this.bones.get("Pelvis");
    const basis = pelvis?.parent;
    if (!pelvis || !basis || Math.max(Math.abs(metres),trail,stride,Math.abs(bank),transfer) < .002) return;
    const point = (bone: THREE.Object3D) => basis.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
    const rotation = (bone: THREE.Object3D) => {
      bone.updateWorldMatrix(true, false);
      const relative = basis.matrixWorld.clone().invert().multiply(bone.matrixWorld);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(relative));
    };
    const feet = ["Foot.L","Foot.R"].map(name => this.bones.get(name));
    const stagger = stride && feet[0] && feet[1] ? point(feet[0]).z-point(feet[1]).z : 0;
    const support = THREE.MathUtils.clamp(stagger/.24,-1,1);
    const legs = (["L", "R"] as const).flatMap(side => {
      const thigh = this.bones.get("Thigh."+side), shin = this.bones.get("Shin."+side), foot = this.bones.get("Foot."+side);
      if (!thigh || !shin || !foot) return [];
      const hip = point(thigh), knee = point(shin), ankle = point(foot);
      const upper = hip.distanceTo(knee), lower = knee.distanceTo(ankle);
      const sign = side === "L" ? 1 : -1;
      const pushing = stride*Math.max(0,-sign*support);
      ankle.x += sign*.095*pushing;
      ankle.z -= .11*pushing;
      ankle.y += .035*pushing;
      if(side==="R" && trail>0){ankle.z-=.29*trail;ankle.x-=.085*trail;ankle.y+=.045*trail;}

      const reach = upper + lower - .006;
      const lateral = Math.hypot(hip.x-ankle.x, hip.z-ankle.z);
      const lift = Math.sqrt(Math.max(0, reach*reach - lateral*lateral)) - (hip.y-ankle.y);
      return [{ thigh, shin, foot, knee, ankle, upper, lower, lift, edge: rotation(foot) }];
    });
    if (legs.length !== 2) return;
    this.pelvisRest = pelvis.position.clone();
    pelvis.position.x += .062*stride*support + .055*bank + .064*transfer;
    pelvis.position.z += .082*transfer;
    pelvis.position.y += metres < 0 ? metres : Math.max(0, Math.min(metres, ...legs.map(leg => leg.lift)));
    const turn = (joint: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) => {
      const localTarget = joint.parent!.worldToLocal(basis.localToWorld(target.clone()));
      const from = child.position.clone().applyQuaternion(joint.quaternion).normalize();
      const to = localTarget.sub(joint.position).normalize();
      if(!this.previousRotations.has(joint))this.previousRotations.set(joint, joint.quaternion.clone());
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
      if(!this.previousRotations.has(foot))this.previousRotations.set(foot, foot.quaternion.clone());
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
    if(!this.bladeAnchors.length)return false;
    for(let i=0;i<(this.bladeRoll>0 ? 2 : 1);i++){
      const result=i===0 ? target : this.bladeToe;
      result.set(0,0,0);
      for(const {bone,local,weight} of this.bladeAnchors[i]){
        bone.updateWorldMatrix(true,false);
        result.addScaledVector(this.bladeSample.copy(local).applyMatrix4(bone.matrixWorld),weight);
      }
    }
    if(this.bladeRoll>0)target.lerp(this.bladeToe,this.bladeRoll);
    return true;
  }
  alignBlade(target: THREE.Vector3) {
    const visual = this.visual;
    if (this.wristAge<WRIST_END || !visual || this.role !== "skater" || (this.currentState !== "play" && this.currentState !== "faceoff-stance" && !this.drawTime)) return;
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
    ctx.save();ctx.fillStyle="#faf8f2";ctx.strokeStyle="#17202b";ctx.lineWidth=3;
    ctx.strokeText(surname,128,30,236);ctx.fillText(surname,128,30,236);ctx.restore();
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
    this.jerseyInk.value=this.letteringMap;this.inkMirror.value=mirrored ? -1 : 1;
  }
  setIdentity(id: RigIdentity, pos: string) {
    if (this.root.userData.playerId === id.id) return;
    this.driver.setIdentity(id, pos);
    this.identity=id;
    if(this.role==="skater" || this.role==="goalie"){
      const seed=stableHash(id.id);
      const nhlId=id.externalId ?? id.id.match(/^nhl-.*-(\d+)$/)?.[1];
      const profiles:Record<string,number[]>=faceData.profiles;
      const natural=profiles[String(nhlId)];
      const [tile,width,length,jaw,bridge,r,g,b]=natural ?? profiles["r"+(id.portraitIndex??seed%180)] ?? profiles.r0;
      this.jawAndBridge.set(jaw,bridge);
      this.cheekColor.setRGB(r,g,b);
      const variation=natural ? .012 : .065;
      this.faceProfile.set(tile%faceData.columns,Math.floor(tile/faceData.columns),
        width+((seed&255)/255-.5)*variation,length+((seed>>>8&255)/255-.5)*variation);
    }
    this.paintLettering();
    this.wristAge=WRIST_END;this.bladeRoll=0;
    this.blockTime=this.drawTime=this.impact=0;
    this.mixer?.stopAllAction();
    this.active = undefined;
    this.overlay=undefined;
    this.shotTime = this.busy = this.catchTime = this.passTime = this.glide = 0;
    this.gliding = false;
    this.edgeLean = 0;
    this.shieldLean=0;
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
    if(this.role==="skater" && (kind==="wrist" || kind==="shot")){
      this.wristAge=0;
      this.wristAim=toward?Math.atan2(toward.x,toward.z):this.motion.yaw;
      this.blockTime=this.catchTime=this.passTime=this.shotTime=0;
      if(this.active){this.active.fadeOut(.12);this.active=undefined;}
      this.busy=WRIST_END;
      return;
    }
    if(this.wristAge<WRIST_END && ["checked","fall","poke","receive","pass","slap","snap"].includes(kind)){
      this.wristAge=WRIST_END;this.bladeRoll=0;this.busy=0;
    }
    if (kind==="block" && this.role==="skater"){
      this.blockTime=.98;
      return;
    }
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
      this.absorbingHit=kind==="checked";
      this.contactWeight=height ?? 1;
      this.impact=this.absorbingHit ? .68 : .5;
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
    if (clip) {
      this.play(clip, true);
      if(this.active && this.shotTime>0 && ["shot","slap","wrist","snap"].includes(kind)){
        const duration=this.shotLength+.22;
        this.active.timeScale=this.active.getClip().duration/duration;
        this.busy=duration;
      }
    }
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
    const longitudinal=input.vx*Math.sin(source.yaw)+input.vz*Math.cos(source.yaw);
    const retreat=input.face!==undefined && this.role==="skater" && this.currentState==="play"
      ? THREE.MathUtils.smoothstep(-longitudinal,.45,2.4) : 0;
    const settled = 1-THREE.MathUtils.smoothstep(speedChange, .3, 3.3);
    const straight = 1-THREE.MathUtils.smoothstep(turnRate, .35, 2.15);
    const clearIce = THREE.MathUtils.smoothstep(input.pressure ?? 8, 1.2, 3.4);
    this.blockTime=Math.max(0,this.blockTime-animDt);
    this.wristAge=Math.min(WRIST_END,this.wristAge+animDt);
    const wrist=this.wristAge<WRIST_END;
    const handling=wrist || this.passTime>0 || this.catchTime>0 || this.blockTime>0 || this.shotTime>0;
    const upright = this.role === "skater" && this.currentState === "play" && !source.stopping && !handling && this.busy<=0
      ? THREE.MathUtils.smoothstep(source.speed,.65,2)* (1-THREE.MathUtils.smoothstep(source.speed,4.2,6.2))*settled * straight * clearIce * (1-.68*retreat) * (input.hasPuck ? .58 : 1)
      : 0;
    this.glide += (upright-this.glide) * (1-Math.exp(-dt*6));
    this.gliding = this.glide > (this.gliding ? .47 : .66);
    this.visual.scale.copy(source.build.scale);
    if (this.role === "skater") this.visual.scale.x *= source.hs;
    this.visual.rotation.copy(source.build.rotation);
    this.busy -= animDt;
    if (this.busy <= 0) {
      const state = this.currentState;
      let clip = state==="play" && this.role==="skater" ? "" : "Watching play";
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
          source.speed / 4.8 * (1-.52*this.glide)*(1-.22*retreat),
          0.32,
          1.65,
        ) * (retreat>.5 ? -1 : 1);
    }
    for(const [bone,q] of this.previousRotations) bone.quaternion.copy(q);
    this.previousRotations.clear();
    if (this.pelvisRest !== undefined) {
      const pelvis = this.bones.get("Pelvis");
      if (pelvis) pelvis.position.copy(this.pelvisRest);
      this.pelvisRest = undefined;
    }
    this.mixer.update(animDt);
    this.motionTime+=animDt;
    const pose=(name:string,x:number,y:number,z:number)=>{
      const bone=this.bones.get(name);
      if(!bone) return;
      if (!this.previousRotations.has(bone)) this.previousRotations.set(bone,bone.quaternion.clone());
      bone.rotateX(x);bone.rotateY(y);bone.rotateZ(z);
    };
    const ease=THREE.MathUtils.smoothstep;
    const age=this.wristAge;
    const load=ease(age,0,WRIST_LOAD)*(1-ease(age,WRIST_LOAD,WRIST_RELEASE));
    const drive=ease(age,WRIST_LOAD,WRIST_RELEASE)*(1-ease(age,.65,WRIST_END));
    this.bladeRoll=ease(age,WRIST_LOAD,WRIST_RELEASE)*(1-ease(age,.65,WRIST_END));
    if(wrist){
      const finish=ease(age,WRIST_LOAD+.05,WRIST_RELEASE+.10)*(1-ease(age,.67,WRIST_END));
      this.adjustHipHeight(-.065*load-.045*drive,.84*finish,0,0,finish);
      pose("Pelvis",.025*load,.14*source.hs*(drive-load),source.hs*(.055*load-.085*drive));
      pose("Chest",.085*load,source.hs*(.23*drive-.20*load),0);
      pose("Head",-.04*load,-source.hs*.09*(drive-load),0);
      pose("UpperArm.R",.10*load-.17*drive,0,-.065*drive);
    }
    this.shotTime = Math.max(0,this.shotTime-animDt);
    if (this.shotTime>0) {
      const t=1-this.shotTime/this.shotLength;
      const follow=Math.sin(Math.PI*t);
      const weight=THREE.MathUtils.smoothstep(t,0,.45)*(1-THREE.MathUtils.smoothstep(t,.58,1));
      pose("Pelvis",0,.09*source.hs*weight,.075*source.hs*weight);
      const coil=Math.sin(Math.PI*THREE.MathUtils.clamp(t/.32,0,1));
      const drive=Math.sin(Math.PI*THREE.MathUtils.clamp((t-.22)/.78,0,1));
      const support=source.hs>0?"L":"R";
      pose("Thigh."+support,-.17*drive+.06*coil,0,source.hs*.055*drive);
      pose("Shin."+support,.16*drive,0,0);
      pose("Chest",.08*coil,source.hs*(.27*drive-.19*coil),0);
      pose("Forearm.R",-.10*weight,0,.055*source.hs*weight);
      pose("Chest",-.08*follow,(this.shotTurn*.24+source.hs*.12)*follow,0);
      pose("Spine",0,0,source.hs*.09*follow);
    }
    this.impact=Math.max(0,this.impact-animDt);
    if(this.impact>0){
      const elapsed=1-this.impact/(this.absorbingHit ? .68 : .5);
      const brace=this.contactWeight*THREE.MathUtils.smoothstep(elapsed,0,.22)*(1-THREE.MathUtils.smoothstep(elapsed,.32,1));
      const recovery=Math.sin(Math.PI*THREE.MathUtils.smoothstep(elapsed,.45,1));
      pose("Pelvis",.06*brace,-.09*this.impactSide*brace,this.impactSide*(.07*brace-.055*recovery));
      pose("Spine",this.absorbingHit ? .12*brace : -.055*brace,.12*this.impactSide*brace,0);
      pose("Thigh."+(this.impactSide>0 ? "L" : "R"),-.14*brace,0,.055*this.impactSide*recovery);
      pose("Chest",.12*brace,0,.18*this.impactSide*brace);
      pose("Shin."+(this.impactSide>0?"L":"R"),.22*brace,0,0);
      pose("UpperArm."+(this.impactSide>0?"R":"L"),-.10*brace,.10*brace,0);
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
      pose("Pelvis",0,shift*source.hs*.85,0);
      pose("Forearm.R",-.09*load,shift*source.hs*.62,0);
      const towardStick = this.passDirection.x*Math.cos(source.yaw)-this.passDirection.z*Math.sin(source.yaw);
      pose("Chest", .08*load, .16*load*towardStick*source.hs, 0);
      const sweep=THREE.MathUtils.smoothstep(age,0,.17)*-.16+
        THREE.MathUtils.smoothstep(age,.14,.31)*.46-THREE.MathUtils.smoothstep(age,.31,.46)*.30;
      pose("UpperArm.R",-.12*load,.12*sweep,0);
      pose("Hand.R",0,.35*sweep,.22*sweep);
      if (!input.hasPuck) {
        const blade = new THREE.Vector3();
        if (this.bladePoint(blade)) {
          blade.addScaledVector(this.passDirection,sweep);
          blade.y = THREE.MathUtils.lerp(blade.y,.032+.035*Math.max(0,sweep),load);
          this.alignBlade(blade);
        }
      }
    }
    if(this.catchTime>0){
      const give=Math.sin(this.catchTime/.36*Math.PI);
      pose("Forearm.L",.18*give,0,.14*give);pose("Forearm.R",.14*give,0,.10*give);
    }
    const st=this.currentState;
    if(this.blockTime>0 && st==="play"){
      const age=.98-this.blockTime;
      const seal=THREE.MathUtils.smoothstep(age,0,.29)*(1-THREE.MathUtils.smoothstep(age,.56,.98));
      this.adjustHipHeight(-.32*seal,seal);
      pose("Spine",.15*seal,0,-.13*seal);
      pose("Chest",.07*seal,.16*seal,0);
      pose("Head",-.12*seal,0,.08*seal);
      pose("UpperArm.R",-.16*seal,.12*seal,0);
    }
    if (this.role === "skater" && st === "play" && !drawing && this.busy <= 0) {
      const forward=(1-retreat)*ease(source.speed,.7,4);
      const stroke=this.active?.getClip().name.endsWith("Stride") ? .84*forward*(1-this.glide)*this.active.getEffectiveWeight() : 0;
      const bank=THREE.MathUtils.clamp(angularSpeed*source.hs*.35,-1,1)*forward;
      this.edgeLean=THREE.MathUtils.damp(this.edgeLean,bank,7,animDt);
      if (lift < .001 && !handling) {
        this.adjustHipHeight(.075*this.glide-.045*stroke-.07*Math.abs(this.edgeLean),0,stroke,this.edgeLean);
        pose("Spine",.075*stroke,0,-.18*this.edgeLean);
        pose("Head",-.055*stroke,0,.09*this.edgeLean);
      }
      const cross = THREE.MathUtils.clamp(angularSpeed,-2,2)*Math.min(1,source.speed/4);
      const stride=this.active?.getClip();
      const edge=stride && stride.name.endsWith("Stride") && this.active
        ? Math.sin(2*Math.PI*this.active.time/stride.duration)*(1-this.glide)*Math.min(1,source.speed/3) : 0;
      pose("Pelvis",.045*retreat,.055*edge,.065*edge);
      if(retreat>.01) {
        // Keep the knees out in a backward C-cut, with one skate recovering under the hip.
        const arc=.065*retreat;
        pose("Thigh.L",-.11*retreat,-arc*(1+edge),arc);
        pose("Thigh.R",-.11*retreat,arc*(1-edge),-arc);
        pose("Head",-.055*retreat,0,0);
      }
      pose("Chest",0,-cross*.055-.04*edge,-.045*edge);
      pose("Head",-.045*this.glide, cross*.08,0);
      pose("Spine", -.23*this.glide, 0, THREE.MathUtils.clamp(angularSpeed*.035,-.12,.12)*Math.min(1,source.speed/3));
    }
    const crowding=1-THREE.MathUtils.smoothstep(input.pressure??4,.85,2.5);
    const shield=input.hasPuck && st==="play" && input.pressureBearing!==undefined
      ? -Math.sin(input.pressureBearing-source.yaw)*crowding*(input.nearBoards?1:.64) : 0;
    this.shieldLean=THREE.MathUtils.damp(this.shieldLean,shield,9,animDt);
    if(Math.abs(this.shieldLean)>.008 && this.role==="skater" && this.busy<=0){
      pose("Pelvis",0,.08*this.shieldLean,.07*this.shieldLean);
      pose("Chest",.085*Math.abs(this.shieldLean),-.17*this.shieldLean,-.12*this.shieldLean);
      pose("Head",-.055*Math.abs(this.shieldLean),.12*this.shieldLean,.045*this.shieldLean);
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
        const anchor=source.hs>0?"R":"L";
        pose("Thigh."+anchor,-.12*load,source.hs*.07*pull*load,0);
        pose("Shin."+anchor,.13*load,0,0);
        pose("Pelvis",0,source.hs*.12*pull*load,0);
        pose("Spine",.23*load,0,0);
        pose("Chest",.09*load,source.hs*(.14+.23*pull)*load,0);
        const readyLean=(.18+.055*this.offset)*load;
        pose("Spine",readyLean*.55,0,source.hs*.105*pull*load);
        pose("Head",readyLean+.08*pull*load,source.hs*(.12-.20*pull)*load,0);
        pose("UpperArm.R",-.10*pull*load,0,-.09*pull*load);
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
    } else if(this.role==="skater" && (st==="bench-reach" || st==="fist-bump")){
      const rail=this.visual.worldToLocal(new THREE.Vector3(input.x,1.24,-13.2));
      const side=rail.x>0 ? "L" : "R";
      this.reachArm(side,rail,new THREE.Vector3(side==="L" ? .56 : -.56,1.03,.21));
    } else if(this.role==="skater" && st==="hug"){
      this.reachArm("L",new THREE.Vector3(.24,1.52,.49),new THREE.Vector3(.5,1.39,.16));
      pose("Chest",.075,0,0);
    } else if(this.role==="skater" && st==="seated"){
      const track=Math.atan2(input.puckX-input.x,Math.max(2,input.puckZ-input.z));
      const breath=Math.sin(this.motionTime*1.4+this.offset*9);
      pose("Chest",.12+.035*breath,.13*track,0);
      pose("Head",-.08,.34*track,0);
      pose("UpperArm.L",-.08-.04*this.offset,0,.04);
      pose("Forearm.R",.10+.035*breath,0,0);
    } else if(this.role==="coach" && st!=="coach-review"){
      const scan=Math.atan2((input.lookX??input.puckX)-input.x,Math.max(1,(input.lookZ??input.puckZ)-input.z));
      pose("Head",.025,.48*scan,0);
      pose("Chest",.045,.15*scan,0);
      if(st==="coach-point"){
        this.reachArm("R",new THREE.Vector3(-.22+.28*Math.sin(scan),1.32,.55),new THREE.Vector3(-.48,1.08,.12));
      }else if(st==="coach-clap"){
        const apart=.055+.095*(.5+.5*Math.cos(this.motionTime*11));
        for(const hand of ["L","R"] as const){
          const sign=hand==="L"?1:-1;
          this.reachArm(hand,new THREE.Vector3(sign*apart,1.29,.36),new THREE.Vector3(sign*.42,1.06,.11));
        }
      }
    } else if(this.role==="goalie" && this.busy<=0){
      const depth=Math.hypot(input.puckX-input.x,input.puckZ-input.z);
      const set=1-THREE.MathUtils.smoothstep(depth,6,21);
      const slide=THREE.MathUtils.clamp((input.vx*Math.cos(source.yaw)-input.vz*Math.sin(source.yaw))/3,-1,1);
      const weight=Math.abs(slide)*set;
      const square=Math.sin(Math.atan2(input.puckX-input.x,input.puckZ-input.z)-source.yaw);
      pose("Head",-.06*set,.32*square,0);
      pose("Forearm.L",-.09*set,.045*square,.075*set);
      pose("Pelvis",.04*set,0,-.065*slide*set);
      pose("Thigh."+(slide>0 ? "R" : "L"),-.12*weight,0,.065*slide*set);
      pose("Spine",.12*set,0,-.09*slide);
      pose("UpperArm.L",-.07*set,0,.09*set);
      pose("UpperArm.R",-.05*set,0,-.07*set);
    } else if(this.role==="goalie" && this.busy>0){
      const a=this.active, u=a ? a.time/a.getClip().duration : 0;
      const extension=Math.sin(Math.PI*THREE.MathUtils.clamp(u,0,1));
      pose("Spine",.06*extension,0,this.saveSide*.19*extension);
      const reaching=this.saveSide>0 ? "L" : "R";
      const pushLeg=this.saveSide>0?"R":"L";
      const low=1-THREE.MathUtils.smoothstep(this.saveHeight,.28,.76);
      pose("Thigh."+pushLeg,-.19*extension*low,0,-this.saveSide*.12*extension);
      pose("Shin."+pushLeg,.20*extension*low,0,0);
      pose("Chest",.12*low*extension,.08*this.saveSide*extension,0);
      pose("UpperArm."+reaching,-(.07+.17*this.saveHeight)*extension,0,this.saveSide*.13*extension);
      pose("Head",-.08*extension,.10*this.saveSide*extension,0);
    } else if(this.role==="skater" && st==="play" && input.pressure!==undefined && input.pressure<2.2){
      pose("Chest",.1, .16*this.driver.skeletonSource().hs,0);
    }
    this.updateOverlay(animDt);
    // Clearance for authored clips as well as procedural grip corrections.
    if ((this.role==="skater" || this.role==="goalie") && (st==="play" || drawing || this.busy>0)) {
      const chest=this.bones.get("Chest");
      if(chest){
        const center=this.visual.worldToLocal(chest.getWorldPosition(new THREE.Vector3()));
        for(const side of ["L","R"] as const){
          const hand=this.bones.get("Hand."+side);
          if(!hand)continue;
          const glove=this.visual.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
          const dy=(glove.y-center.y)/.30,dx=(glove.x-center.x)/.22;
          const front=Math.sqrt(Math.max(0,1-dy*dy-dx*dx))*.18;
          if(front>.025 && glove.z>center.z-.10 && glove.z<center.z+front){
            glove.z=center.z+front;
            this.reachArm(side,glove,new THREE.Vector3(center.x+(side==="L"?.34:-.34),glove.y-.09,center.z+.11));
          }
        }
      }
    }
    if(this.role==="skater" && st==="play" && lift<.001 && this.runners.length){
      let lowest=Infinity;
      for(const runner of this.runners){
        runner.bone.updateWorldMatrix(true,false);
        for(const contact of runner.points)lowest=Math.min(lowest,this.solePoint.copy(contact).applyMatrix4(runner.bone.matrixWorld).y);
      }
      this.visual.position.y+=THREE.MathUtils.clamp(.002-lowest,-.25,.25);
      if(wrist){
        const hand=this.bones.get("Hand.R"), tip=new THREE.Vector3();
        if(hand?.parent && this.bladePoint(tip)){
          const palm=hand.getWorldPosition(new THREE.Vector3()),arm=tip.clone().sub(palm);
          const bearing=Math.atan2(arm.x,arm.z);
          const delta=Math.atan2(Math.sin(this.wristAim-bearing),Math.cos(this.wristAim-bearing));
          const yaw=bearing-source.hs*.26*load+delta*.70*drive;
          const weight=Math.max(load,drive,ease(age,0,.12)*(1-ease(age,.67,WRIST_END)));
          const height=THREE.MathUtils.lerp(tip.y,.026+.32*ease(age,WRIST_RELEASE,.66),weight);
          const dy=THREE.MathUtils.clamp(height-palm.y,-arm.length(),arm.length());
          const reach=Math.sqrt(Math.max(0,arm.lengthSq()-dy*dy));
          const aim=new THREE.Vector3(Math.sin(yaw)*reach,dy,Math.cos(yaw)*reach).add(palm);
          const from=hand.parent.worldToLocal(tip).sub(hand.position).normalize();
          const to=hand.parent.worldToLocal(aim).sub(hand.position).normalize();
          if(!this.previousRotations.has(hand))this.previousRotations.set(hand,hand.quaternion.clone());
          hand.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));
        }
      }
      if(handling || drawing || this.impact>0){
        this.keepBladeAboveIce();
        this.followShaft();
      }
    }
    if (this.role === "skater" && st === "play" && !drawing && this.busy <= 0) {
      const look = Math.atan2(input.puckX-input.x, input.puckZ-input.z)-source.yaw;
      pose("Head", .1*this.glide, input.hasPuck ? 0 : Math.sin(look)*.36, 0);
    }
  }
  dispose() {
    this.released = true;
    this.faceMaterial?.dispose();
    this.personalMaterials.forEach(m=>m.dispose());
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
