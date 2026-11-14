# Manager workspace and preparation

The dashboard now surfaces actual lineup injuries, tired players, mean physical
condition and expiring contracts. Actions open the relevant management screen or
apply existing auto-selection. No board objectives or news are fabricated.

Player tables support sorting by rating, points, age, salary and condition, plus
a healthy-player filter. Sorting copies the array and never changes roster order.
Desktop typography, information panels and navigation spacing are enlarged.

The development screen sets a persistent team training plan. Each advance tick:
- Balanced removes 8 fatigue; trains passing/skating.
- Recovery removes 14 fatigue; no skill development.
- Shooting removes 5 fatigue; trains accuracy/shooting.
- Defense removes 5 fatigue; trains defensive position/blocking.

Every eighth tick, healthy under-29 players below their potential gain one point
in targeted attributes. Goalies train reflexes/positioning instead. Ratings are
recalculated and the match engine reads the changed attributes and fatigue.
Training and progress are optional fields in v1 saves with backward-compatible
defaults and validation. This is a team preparation foundation, not individual
training, staff quality, farm development or a complete development model.

Validation includes recovery differences, training cadence, injury exclusion and
the DOM scenario selecting a training plan and sorting the roster. Browser visual
QA remains unavailable in this execution environment.
