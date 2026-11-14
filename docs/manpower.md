# Manpower simulation

Minor penalties now exclude their player from shifts and TOI. Regulation supports
5v4, 5v3 and 4v4; regular-season overtime starts 3v3 and adds skaters to the
advantaged side (4v3 or 5v3). Playoff overtime retains regulation manpower.
A power-play goal releases the opponent's oldest active minor. Short-handed
goals now affect plus/minus; power-play goals do not.

Event snapshots include stable player IDs and actual on-ice units. Legacy events
without these optional fields remain valid. Shootout goalie strength now favors
the correct side.

Limitations: this remains a 20-second event model. Penalty expiry is processed
at interval boundaries, with automatic normalization in overtime rather than
waiting for a whistle. Third concurrent minors, coincidental penalties, majors,
double minors and misconducts are not implemented. New penalties are capped at
two active minors per team. PP opportunities count distinct advantage segments;
this is not the complete official NHL penalty-opportunity accounting system.
