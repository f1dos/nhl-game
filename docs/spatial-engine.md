# Spatial match simulation

The interactive match day now runs `SpatialMatch` at a fixed 100 ms simulation
step. The renderer consumes world coordinates and never calculates results.
The seed, input commands and number of simulation steps determine the result;
rendering frequency and the chosen viewing speed do not determine outcomes.

Skaters accelerate toward tactical targets, carry the puck, pass to teammates,
attempt nearby takeaways and shoot toward the goal. Passes and shots move in
rink coordinates. Saves depend on the goalkeeper's position and reflexes.
Line selection, manpower, penalties, intermissions, regular-season overtime,
shootouts and manual goalkeeper withdrawal are handled during play.

The career calendar remains on match day until the completed result is committed.
The season processor accepts that result instead of calculating the user fixture
again; other fixtures still use the existing fast simulator. Preseason results
do not change regular-season statistics.

Current limitations: this is an initial spatial simulation, not feature parity
with Football Manager. Offside, icing, body collisions, detailed stick contact,
live-session persistence across page reloads and calibration across thousands
of matches remain unfinished. Do not describe those features as implemented. The normal career is saved before and after the match; reloading
an unfinished match returns to preparation.

## Player figures and animation

The 3D match view (`src/ui/MatchArena3D.tsx`) draws procedural, jointed figures
from `src/ui/hockeyRig.ts` in a stylised football-manager-like look: broad
shoulders, helmets with visors, team-coloured kits, name and number on the back,
per-player height, build, skin tone and stick hand. Goalies have pads, blocker,
catcher and mask.

Motion is driven by the simulation but never feeds back into it:

- skating stride (hip abduction, knee drive, counter-rotating torso), forward,
  backward and crossover skating relative to where the player faces, forward
  lean with speed, banking in turns and hockey stops;
- hands are placed on the stick with two-bone IK, and the lowest skate blade is
  always kept on the ice;
- `SpatialFrame.cues` carries one-shot hints (`pass`, `shot`, `check`, `save`,
  `goal`, `faceoff`, `penalty`) that trigger a wind-up and strike, body check and
  stagger, celebration, goalie butterfly save and so on. Cues are produced
  without using the seeded random stream, so results are unchanged.

The camera menu has a new close-up mode that follows the puck. The earlier
Blender studies in `public/models/hockey` are no longer loaded by the match.
