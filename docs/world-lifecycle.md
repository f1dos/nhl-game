# World lifecycle and contract foundation

Contracts, player lifecycle and their UI are separate modules. At annual rollover
the entire transition runs on a copy and commits only after completion: a salary
cap failure leaves the original world intact. Players age and develop, veterans
retire, and 240 synthetic players aged 18–21 enter the free-agent pool each year.
Contract years can reach zero; ownership moves to the free-agent pool. Retired
players are archived with their history. Player IDs are conserved across pools.

All teams, including the user club, receive explicit minimum-roster assistance:
affordable free agents fill 4 LW, 4 C, 4 RW, 6 D and 2 G slots. This is a basic
deterministic recruitment policy, not a complete autonomous general manager.
The user can renew expiring deals immediately or recruit free agents through the
new Contracts & market screen. Low offers produce an asking-price counteroffer.
All signings check term, roster size, salary limits and team cap, and record history.

Rules are DEMONSTRATION rules, not verified 2026/27 CBA: 1–7 years, $0.8M minimum,
20% of cap maximum per player. No RFA rights, entry-level rules, deferred extensions,
bonuses, arbitration or salary retention. Annual entrants are not a draft.
Renewal replaces the current deal immediately. Minimum-roster automation also
manages the user team; manual offseason calendar phases are future work.

Backward compatibility: optional freeAgents, retired and contractHistory fields
default to empty collections. Existing version-1 saves load without changing
their original players. Save validation rejects duplicate world IDs.

Tests cover signing/rejection, ownership, persistence, atomic failed rollover,
30 annual transitions with one match round each, replacement of original players,
and a UI renewal scenario. The lifecycle test is not 30 complete simulated seasons.
The existing full-season and 1,000-match suites remain in place.

Next major work: actual offseason calendar, draft ownership and scouting, strategic
AI recruitment and trades, farm development and unified player profile/history UI.
