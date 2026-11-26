import { strFromU8, unzlibSync } from "fflate";
import * as THREE from "three";
import { BENCH, RINK } from "../engine/rink";
import bowlData from "../assets/match-night.json";
import fanData from "../assets/match-night/fans.json";
import architectureData from "../assets/match-night/architecture.json";
import rinkData from "../assets/match-night/rink.json";

export function unpack<T>(encoded: string): T {
  const compressed = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return JSON.parse(strFromU8(unzlibSync(compressed))) as T;
}

type Batch = Record<string, [number[], number[]]>;
interface Venue {
  bowl: Batch;
  ceiling: Batch;
  seat: number[];
  attendance: number[];
  fans: string;
  chair: [number[], number[]];
}

export function buildMatchNight(
  own: <T extends { dispose(): void }>(x: T) => T,
) {
  const data = unpack<Venue>(bowlData);
  const shell = (batch: Batch, name: string, units = 100, layer = 1) => {
    const group = new THREE.Group();
    group.name = name;
    for (const [rgb, [position, index]] of Object.entries(batch)) {
      const values = rgb.split(",").map(Number);
      const geometry = own(new THREE.BufferGeometry());
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          position.map((x) => x / units),
          3,
        ),
      );
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      const material = own(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(
            values[0] / 255,
            values[1] / 255,
            values[2] / 255,
          ),
          roughness: 0.78,
          side: THREE.DoubleSide,
          transparent: values.length === 4 && values[3] < 255,
          opacity: (values[3] ?? 255) / 255,
          depthWrite: (values[3] ?? 255) === 255,
        }),
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.layers.set(layer);
      group.add(mesh);
    }
    return group;
  };
  const bowl = shell(data.bowl, "Match Night | seating bowl");
  const ceiling = shell(data.ceiling, "Match Night | roof and luminaires");
  // NHL simulation coordinates use 61 x 26.4 m. The source sheet is 60 x 26 m.
  bowl.scale.set(61 / 60, 1, 26.4 / 26);
  ceiling.scale.copy(bowl.scale);
  const dummy = new THREE.Object3D();
  const occupied = new Set<string>();
  const atlas = own(
    new THREE.DataTexture(
      Uint8Array.from(atob(data.fans), (c) => c.charCodeAt(0)),
      512,
      128,
    ),
  );
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;

  const crowdGeometry = own(new THREE.PlaneGeometry(0.89, 1.68));
  const phase = { value: 0 },
    reaction = { value: 0 },
    wave = { value: 0 };
  const crowdMaterial = own(
    new THREE.MeshBasicMaterial({
      map: atlas,
      alphaTest: 0.38,
      color: 0x96929c,
    }),
  );
  crowdMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      fanTime: phase,
      fanReaction: reaction,
      fanWave: wave,
    });
    shader.vertexShader =
      "attribute float tile; uniform float fanTime, fanReaction, fanWave;\n" +
      shader.vertexShader
        .replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\nvMapUv.x=(vMapUv.x+tile)/8.;",
        )
        .replace(
          "#include <project_vertex>",
          `
        vec4 seat = modelMatrix * instanceMatrix[3];
        float angle = atan(seat.z,seat.x);
        float distanceToWave = abs(atan(sin(angle-fanWave),cos(angle-fanWave)));
        float rise = fanWave < 5. ? max(0.,1.-distanceToWave*2.2)*.38 : 0.;
        rise += fanReaction * (.45+.55*abs(sin(fanTime*6.+tile)));
        vec3 right = normalize(vec3(viewMatrix[0][0], 0., viewMatrix[2][0]) + vec3(.00001,0.,0.));
        vec4 mvPosition = viewMatrix * vec4(seat.xyz + right*position.x + vec3(0.,position.y+rise,0.),1.);
        gl_Position = projectionMatrix * mvPosition;
      `,
        );
  };
  const fans = new THREE.InstancedMesh(
    crowdGeometry,
    crowdMaterial,
    data.attendance.length / 4,
  );
  const tiles = new Float32Array(fans.count);
  const lower = Array.from({ length: 8 }, () => [] as THREE.Matrix4[]);
  let distant = 0;
  for (let i = 0; i < data.attendance.length / 4; i++) {
    const j = i * 4,
      a = data.attendance;
    const x = a[j],
      y = a[j + 1],
      z = a[j + 2];
    occupied.add([x, y - 2, z].join(","));
    if (y < 220) {
      dummy.position.set(x / 100, y / 100, z / 100);
      dummy.rotation.y = Math.atan2(-x, -z);
      dummy.updateMatrix();
      lower[a[j + 3]].push(dummy.matrix.clone());
      continue;
    }
    dummy.rotation.y = 0;
    dummy.position.set(x / 100, y / 100 + 0.8, z / 100);
    dummy.updateMatrix();
    fans.setMatrixAt(distant, dummy.matrix);
    tiles[distant++] = a[j + 3];
  }
  fans.count = distant;
  // Follow the glass through the corners. Build in source-bowl metres.
  const railSeats: THREE.Matrix4[] = [], decks: THREE.Matrix4[] = [];
  for (let row = 0; row < 2; row++) {
    const radius = 8.4 + .96 + row * .89;
    let section = 0;
    const sectionSeats = (length: number, sample: (t:number) => number[]) => {
      const count = Math.floor(length / .67);
      for (let i = 0; i < count; i++) {
        const [x,z,nx,nz] = sample((i+.5)/count);
        if ((z < -12 && Math.abs(x)<16.4) || (z>12 && Math.abs(x)<7.8)) continue;
        const height = .24 + .26*row;
        dummy.rotation.y = Math.atan2(-nx,-nz);
        dummy.position.set(x,height/2,z);
        dummy.scale.set(length/count+.018,height,.92);
        dummy.updateMatrix();
        decks.push(dummy.matrix.clone());
        dummy.scale.setScalar(1);
        if (i===0 || i%19===18) continue;
        dummy.position.y = height;
        dummy.updateMatrix();
        railSeats.push(dummy.matrix.clone());
        const seed = (i*37+row*17+section*13)%97;
        if (seed%17 !== 0) lower[seed%lower.length].push(dummy.matrix.clone());
      }
      section++;
    };
    for (const sign of [-1,1]) {
      sectionSeats(43.2,t=>[(t-.5)*43.2,sign*(4.6+radius),0,sign]);
      sectionSeats(9.2,t=>[sign*(21.6+radius),(t-.5)*9.2,sign,0]);
      for (const end of [-1,1]) sectionSeats(radius*Math.PI/2,t=>{
        const nx=sign*Math.cos(t*Math.PI/2), nz=end*Math.sin(t*Math.PI/2);
        return [sign*21.6+nx*radius,end*4.6+nz*radius,nx,nz];
      });
    }
  }
  const risers = new THREE.InstancedMesh(own(new THREE.BoxGeometry()),own(new THREE.MeshStandardMaterial({color:0x454951,roughness:.96})),decks.length);
  decks.forEach((m,i)=>risers.setMatrixAt(i,m));
  risers.layers.set(1);
  bowl.add(risers);
  const nearMat = own(
    new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xb4adb4, roughness: 0.85 }),
  );
  unpack<[number[], number[], number[]][]>(fanData).forEach(
    ([positions, colors, indices], i) => {
      const geometry = own(new THREE.BufferGeometry());
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          positions.map((v) => v / 1000),
          3,
        ),
      );
      geometry.setAttribute(
        "color",
        new THREE.Uint8BufferAttribute(colors, 3, true),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const row = new THREE.InstancedMesh(geometry, nearMat, lower[i].length);
      lower[i].forEach((matrix, j) => row.setMatrixAt(j, matrix));
      row.name = "Match Night | lower bowl fans " + i;
      row.layers.set(1);
      bowl.add(row);
    },
  );
  crowdGeometry.setAttribute(
    "tile",
    new THREE.InstancedBufferAttribute(tiles, 1),
  );
  fans.layers.set(1);
  bowl.add(fans);

  // Occupied seats are covered by spectator portraits. Draw the original
  // three-dimensional seat shells in the visible gaps.
  const chair = own(new THREE.BufferGeometry());
  chair.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      data.chair[0].map((x) => x / 1000),
      3,
    ),
  );
  chair.setIndex(data.chair[1]);
  chair.computeVertexNormals();
  const chairs = new THREE.InstancedMesh(
    chair,
    own(
      new THREE.MeshStandardMaterial({
        color: "#273e5a",
        roughness: 0.9,
      }),
    ),
    data.seat.length / 4 + railSeats.length,
  );
  let empty = 0;
  for (let i = 0; i < data.seat.length; i += 4) {
    const x = data.seat[i],
      y = data.seat[i + 1],
      z = data.seat[i + 2];
    let filled = false;
    for (let dx = -1; dx <= 1 && !filled; dx++)
      for (let dz = -1; dz <= 1 && !filled; dz++)
        filled = occupied.has([x + dx, y, z + dz].join(","));
    if (filled) continue;
    dummy.position.set(x / 100, y / 100, z / 100);
    dummy.rotation.y = data.seat[i + 3] / 1000;
    dummy.updateMatrix();
    chairs.setMatrixAt(empty++, dummy.matrix);
  }
  for (const matrix of railSeats) chairs.setMatrixAt(empty++,matrix);
  chairs.count = empty;
  chairs.layers.set(1);
  bowl.add(chairs);
  // Replace the three continuous bench-side strips with fixed panels and
  // hinged leaves. Keep the bench floors and the corner panels from Blender.
  const panels = unpack<Batch>(rinkData);
  const strips = [
    { key:"209,217,217,255", y:.625, h:.91, z:-13.2, depth:.07 },
    { key:"240,135,5,255", y:.09, h:.18, z:-13.191, depth:.075 },
    { key:"9,12,15,255", y:1.09, h:.035, z:-13.296, depth:.193 },
  ];
  for (const strip of strips) {
    const [points, indices] = panels[strip.key];
    const keep = [];
    for (let i=0; i<indices.length; i+=3) {
      const face=indices.slice(i,i+3);
      const xs=face.map(v=>points[v*3]);
      if (Math.min(...xs)<-22000 && Math.max(...xs)>22000 &&
          face.every(v=>Math.abs(points[v*3+2]+13200)<210)) continue;
      keep.push(...face);
    }
    panels[strip.key][1]=keep;
  }
  const rink = shell(
    panels,
    "Match Night | boards, glass, benches and goals",
    1000,
    0,
  );
  const doorWidth = 1.35;
  const doors = BENCH.centerX.map(x => {
    const pivot = new THREE.Group();
    pivot.position.set(x-doorWidth/2,0,-RINK.boardsZ);
    rink.add(pivot);
    return pivot;
  });
  for (const strip of strips) {
    const rgb=strip.key.split(",").map(Number);
    const material=own(new THREE.MeshStandardMaterial({color:new THREE.Color(rgb[0]/255,rgb[1]/255,rgb[2]/255),roughness:.78}));
    const panel=(parent:THREE.Group,left:number,right:number,z:number) => {
      const mesh=new THREE.Mesh(own(new THREE.BoxGeometry(right-left,strip.h,strip.depth)),material);
      mesh.position.set((left+right)/2,strip.y,z);
      parent.add(mesh);
    };
    let left=-22.367;
    doors.forEach((door,i)=>{
      panel(rink,left,door.position.x,strip.z);
      panel(door,0,doorWidth,strip.z+RINK.boardsZ);
      left=BENCH.centerX[i]+doorWidth/2;
    });
    panel(rink,left,22.367,strip.z);
  }
  const architecture = unpack<Record<string,[number[],number[],string[]]>>(architectureData);
  const overhead = new THREE.Group(), gallery = new THREE.Group();
  const palette = new Map<string,THREE.Color>();
  for (const [name,[positions,indices,swatches]] of Object.entries(architecture)) {
    const vertices = new Float32Array(indices.length*3), colors = new Float32Array(vertices.length);
    indices.forEach((index,i)=>{
      const swatch = swatches[Math.floor(i/3)];
      let color = palette.get(swatch);
      if (!color) { color = new THREE.Color(swatch); palette.set(swatch,color); }
      color.toArray(colors,i*3);
      for (let axis=0;axis<3;axis++) vertices[i*3+axis]=positions[index*3+axis];
    });
    const geo=own(new THREE.BufferGeometry());
    geo.setAttribute("position",new THREE.BufferAttribute(vertices,3));
    geo.setAttribute("color",new THREE.BufferAttribute(colors,3));
    geo.computeVertexNormals();
    const parameters={vertexColors:true,side:THREE.DoubleSide};
    const material=name==="concourse"
      ? new THREE.MeshStandardMaterial({...parameters,roughness:.88})
      : new THREE.MeshBasicMaterial(parameters);
    if (name==="soffit" || name==="suite lights") {
      const roof=name==="soffit";
      material.onBeforeCompile=shader=>{
        shader.vertexShader="varying vec3 buildingPoint;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nbuildingPoint=position;");
        const light=roof ? `
          vec2 q=buildingPoint.xz/vec2(68.,51.);
          float radial=length(q);
          float seam=cos(atan(q.y,q.x)*64.);
          float bounce=.22+.48*exp(-12.*pow(radial-.48,2.))+.10*(1.-seam);
          diffuseColor.rgb *= vec3(.80,.73,.86)*bounce;
        ` : `
          float along=buildingPoint.x*.81+buildingPoint.z*.43;
          float mullion=smoothstep(.05,.14,fract(along));
          float sill=smoothstep(.05,.20,fract(buildingPoint.y*1.8));
          float interior=.30+.70*smoothstep(-.5,.75,sin(floor(along)*7.81));
          diffuseColor.rgb *= (.25+.75*mullion)*(.28+.72*sill)*interior;
        `;
        shader.fragmentShader="varying vec3 buildingPoint;\n"+shader.fragmentShader.replace("#include <color_fragment>","#include <color_fragment>\n"+light);
      };
      material.customProgramCacheKey=()=>name;
    }
    const mesh=new THREE.Mesh(geo,own(material));
    mesh.name=name;
    (name==="soffit" || name==="luminaires" ? overhead : gallery).add(mesh);
  }
  return {
    doors, overhead, gallery,
    bowl,
    ceiling,
    rink,
    react(clock: number, goal: boolean, danger: boolean, playing: boolean) {
      phase.value = clock;
      reaction.value = goal ? 0.28 : danger ? 0.13 : 0;
      const t = clock % 75;
      wave.value = playing && t < 9 ? (t / 9) * Math.PI * 2 - Math.PI : 10;
    },
  };
}
