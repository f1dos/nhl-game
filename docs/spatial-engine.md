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
goalkeeper save animations, live-session persistence across page reloads and
calibration across thousands of matches remain unfinished. The simple player
meshes need a dedicated animation and art pass. Do not describe those features
as implemented. The normal career is saved before and after the match; reloading
an unfinished match returns to preparation.
