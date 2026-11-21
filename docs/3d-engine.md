# 3D match: models, animation, picture and broadcast

Branch `feature/fm26-quality-3d`. Everything here is presentation: the spatial
engine (`src/engine/spatialMatch.ts`) produces the same result with or without
3D; the renderer only reads positions, cues and stoppages.

## Models (`src/ui/skinnedRig.ts`)

- One `SkinnedMesh` per person and LOD (near and far), 27 bones: pelvis,
  spine ×3, neck, head, clavicles, upper arms, forearms, hands, thighs, shins,
  feet, toes, stick, and 4 jersey helper bones (front/back/left/right hem).
- Body, kit and equipment are lofted around the bones in a bind pose with
  blended weights at the joints (knee, elbow, shoulder, waist, neck), so limbs
  bend without primitive seams. Equipment (helmet, visor, gloves, skates,
  pads) is rigid on its bone inside the same mesh.
- Budget (near LOD): skater ≈ 5–6k triangles, goalie ≈ 7k, far LOD ≈ 2–2.5k.
- Roles: skater, goalie (pads with knee stack, blocker, catcher, painted mask
  and cage), referee (orange armbands), linesman, coach (suit, tie in team
  colour, hair).
- Built in TypeScript (`BufferGeometry` with skinning): Blender is not
  available in the build environment, so no `.glb` export/compression is
  needed and the single-file preview stays at ≈3 MB.
- Fallback: `?rig=classic` uses the previous primitive figures; if building a
  skinned model throws, that actor keeps the primitive figure automatically.

## Appearance

Deterministic from the player id (FNV hash, no `Math.random`): 10 face shapes,
6 skin tones, 9 hairstyles (crop, buzz, flow, mullet, curly, slick, shaved,
long, wavy), stubble/full beard, 2 helmet shells, handedness (stick curve),
build. Jerseys are per-player `CanvasTexture`s: club colours, hem/sleeve/yoke
stripes, surname and number on the back, shoulder numbers, crest (or the club
abbreviation when the crest image cannot be loaded because of CORS).

## Animation

The pose solver of `hockeyRig.ts` (states with cross-fades, one-shot actions,
two-bone arm IK, ground contact of skates/pads/knees) runs invisibly and is
retargeted onto the skeleton every frame. Added on top: puck protection on
the boards, quick hands and dekes under pressure, pass reception, falls after
heavy hits (spring-damped tilt impulse then a get-up), goalie tracking of the
puck, benches standing on dangerous chances, coaches gesturing and talking,
snow spray on hard stops, jersey flutter on helper bones.

## Picture (`src/ui/arenaFx.ts`)

Arena presets by club (premium / classic / modest: bowl size, suites, light
rig, darker stands), PCF soft shadows (refreshed every other frame), ice over
a low-resolution planar reflector (refreshed every other frame), a skate
scratch layer that builds during a period and is resurfaced between periods,
high-threshold bloom, ACES output, depth of field only in replays/cut-scenes.
The stands are on layer 1 (not reflected, no shadows). If the frame rate
stays under 45 fps the reflections switch off; `?quality=low` disables
shadows and reflections.

## Broadcast (`src/ui/broadcastDirector.ts`)

SmoothDamp springs for every camera; automatic director in broadcast mode
(main side, low behind the net, over the net, bench) with minimum shot
length; goal replays from recorded frames, angles by goal type, with a
REPLAY badge; cut-scenes: arena fly-over before the opening faceoff, puck
close-up on the faceoff dot, steadicam on the celebration.

## Review tools

- `?demo=models&view=front|side|back|goalie|faceoff|celebrate|lineup`
- `node scripts/screenshots-3d.mjs <url> <outDir>` and
  `node scripts/fps-3d.mjs <url> [query]` (Playwright; set `PW_CHANNEL=chrome`
  to use an installed browser and the real GPU).

## Honest gap to Football Manager 26

FM26 uses artist-made, textured and normal-mapped character models, real
motion capture and Unity's lighting. Here, by comparison:

- Figures are procedural lofts with flat colours: no normal maps, no fabric
  detail beyond a weave texture, simplified faces; silhouettes still read as
  stylised mannequins at close range.
- Animation is a procedural pose solver retargeted to the skeleton, not mocap
  and not `AnimationMixer` clips; there is no foot locking (skating glide hides
  most sliding), no real ragdoll (a spring-damped tilt instead), no goalie IK
  to the exact puck position (save type is chosen from the trajectory).
- Crowd is instanced capsules with one LOD, rises/jumps/waves but no arms.
- No team walk-out from the tunnel, post-game handshake line or trophy
  cut-scene yet.
- Reflections are a single low-res planar reflector (no screen-space blur).
