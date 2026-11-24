import { strFromU8, unzlibSync } from "fflate";
import * as THREE from "three";
import bowlData from "../assets/match-night.json";

export function unpack<T>(encoded: string): T {
  const compressed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  return JSON.parse(strFromU8(unzlibSync(compressed))) as T;
}

type Batch = Record<string, [number[], number[]]>;
interface Venue { bowl: Batch; ceiling: Batch; seat: number[]; attendance:number[]; fans:string; chair:[number[],number[]] }

export function buildMatchNight(own: <T extends { dispose(): void }>(x: T) => T) {
  const data = unpack<Venue>(bowlData);
  const shell = (batch: Batch, name: string) => {
    const group = new THREE.Group();
    group.name = name;
    for (const [rgb, [position, index]] of Object.entries(batch)) {
      const values = rgb.split(",").map(Number);
      const geometry = own(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(position.map(x => x / 100), 3));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      const material = own(new THREE.MeshStandardMaterial({
        color: new THREE.Color(values[0]/255, values[1]/255, values[2]/255),
        roughness: .78, side: THREE.DoubleSide
      }));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.layers.set(1);
      group.add(mesh);
    }
    return group;
  };
  const bowl = shell(data.bowl, "Match Night | seating bowl");
  const ceiling = shell(data.ceiling, "Match Night | roof and luminaires");
  // NHL simulation coordinates use 61 x 26.4 m. The source sheet is 60 x 26 m.
  bowl.scale.set(61/60, 1, 26.4/26);
  ceiling.scale.copy(bowl.scale);
  const dummy = new THREE.Object3D();
  const occupied = new Set<string>();
  const atlas = own(new THREE.DataTexture(
    Uint8Array.from(atob(data.fans), c => c.charCodeAt(0)), 512, 128
  ));
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;

  const crowdGeometry = own(new THREE.PlaneGeometry(.89,1.68));
  const phase = { value:0 }, reaction = { value:0 }, wave = { value:0 };
  const crowdMaterial = own(new THREE.MeshBasicMaterial({ map:atlas, alphaTest:.38, color:0xcacbd0 }));
  crowdMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,{ fanTime:phase, fanReaction:reaction, fanWave:wave });
    shader.vertexShader = "attribute float tile; uniform float fanTime, fanReaction, fanWave;\n"+shader.vertexShader
      .replace("#include <uv_vertex>","#include <uv_vertex>\nvMapUv.x=(vMapUv.x+tile)/8.;")
      .replace("#include <project_vertex>", `
        vec4 seat = modelMatrix * instanceMatrix[3];
        float angle = atan(seat.z,seat.x);
        float distanceToWave = abs(atan(sin(angle-fanWave),cos(angle-fanWave)));
        float rise = fanWave < 5. ? max(0.,1.-distanceToWave*2.2)*.38 : 0.;
        rise += fanReaction * (.45+.55*abs(sin(fanTime*6.+tile)));
        vec3 right = normalize(vec3(viewMatrix[0][0], 0., viewMatrix[2][0]) + vec3(.00001,0.,0.));
        vec4 mvPosition = viewMatrix * vec4(seat.xyz + right*position.x + vec3(0.,position.y+rise,0.),1.);
        gl_Position = projectionMatrix * mvPosition;
      `);
  };
  const fans = new THREE.InstancedMesh(crowdGeometry,crowdMaterial,data.attendance.length/4);
  const tiles = new Float32Array(fans.count);
  for (let i=0;i<fans.count;i++) {
    const j=i*4, a=data.attendance;
    const x=a[j], y=a[j+1], z=a[j+2];
    occupied.add([x,y-2,z].join(","));
    dummy.position.set(x/100,y/100+.80,z/100);
    dummy.updateMatrix();
    fans.setMatrixAt(i,dummy.matrix);
    tiles[i]=a[j+3];
  }
  crowdGeometry.setAttribute("tile",new THREE.InstancedBufferAttribute(tiles,1));
  fans.layers.set(1);
  bowl.add(fans);

  // Occupied seats are covered by spectator portraits. Draw the original
  // three-dimensional seat shells in the visible gaps.
  const chair = own(new THREE.BufferGeometry());
  chair.setAttribute("position",new THREE.Float32BufferAttribute(data.chair[0].map(x=>x/1000),3));
  chair.setIndex(data.chair[1]);
  chair.computeVertexNormals();
  const chairs = new THREE.InstancedMesh(chair,own(new THREE.MeshStandardMaterial({
    color:"#273e5a",roughness:.9
  })),data.seat.length/4);
  let empty=0;
  for (let i=0;i<data.seat.length;i+=4) {
    const x=data.seat[i],y=data.seat[i+1],z=data.seat[i+2];
    let filled=false;
    for(let dx=-1;dx<=1 && !filled;dx++)
      for(let dz=-1;dz<=1 && !filled;dz++) filled=occupied.has([x+dx,y,z+dz].join(","));
    if(filled) continue;
    dummy.position.set(x/100,y/100,z/100);
    dummy.rotation.y=data.seat[i+3]/1000;
    dummy.updateMatrix();
    chairs.setMatrixAt(empty++,dummy.matrix);
  }
  chairs.count=empty;
  chairs.layers.set(1);
  bowl.add(chairs);
  return { bowl, ceiling, react(clock:number, goal:boolean, danger:boolean, playing:boolean) {
    phase.value=clock;
    reaction.value=goal ? .28 : danger ? .13 : 0;
    const t=clock%75;
    wave.value=playing && t<9 ? t/9*Math.PI*2-Math.PI : 10;
  }};
}
