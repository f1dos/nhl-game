# Premium interface iteration 2

The sidebar is grouped by actual manager workflow: workspace, team, management,
competition and system. The global header shows the current team record, points
and goal differential. Typography and active states are consistent across screens.

Player profiles now surface archetype, availability, weighted overall/potential,
contract, morale, condition, career points, categorized attributes and an OVR
history chart. Every value comes from the game state; no photography, scouting
report or injury history is invented.

The tactics screen shows line chemistry and calculated tradeoffs for possession,
chance volume, defensive stability and penalty risk. Chemistry is now shared
engine logic and affects shot quality in match simulation. It combines teamwork,
decisions, consistency, role diversity and fatigue. Tactical analysis uses the
same settings consumed by the match engine.

Limitations: player profile remains a modal, the development chart tracks annual
OVR only, and the tactical metrics are internal game estimates rather than NHL
analytics. Special-team unit assignment and in-match tactical changes remain
future work. Browser visual QA is unavailable in the current environment.
