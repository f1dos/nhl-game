# Draft and scouting foundation

This iteration adds a persistent 224-player annual draft class and connects it to
the career lifecycle. Prospect ability and potential are real simulation values,
while the UI exposes imperfect scouting estimates whose error range shrinks as
confidence improves. Regional assignments provide passive coverage and direct
reports consume a renewable scouting-capacity resource.

At the end of the playoffs, final standings and a weighted lottery create seven
rounds of draft order. The other 31 clubs select by a combination of long-term
value and positional need. The user makes each of their seven selections in the
Draft Center; starting a new season safely auto-completes any skipped picks.
Selections transfer rights into each club's prospect pipeline. Prospects develop
at annual rollover, can earn an entry-level roster place, and are released to the
open market if they age out. Completed drafts are archived in career state.

The draft, scouting reports, shortlists, picks, club rights, and draft history are
part of the save model. Older version-1 careers remain valid and can initialize the
new system from the Draft Center. Save validation now covers club prospect pools
and draft state.

Rules and odds remain a demonstration model rather than a verified 2026/27 CBA
implementation. Pick trading, detailed scout staff, junior-league statistics,
entry-level slide rules, signing deadlines, and a dedicated farm league are not
implemented yet. Drafted players currently develop through an abstract club
pipeline, and high-level prospects may join the active roster at annual rollover.
