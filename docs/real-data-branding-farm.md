# Real identity data, club branding and organizational reserve

The repository now carries a generated, reviewable identity snapshot for the
2026/27 season. `npm run sync:nhl` reads the public NHL roster endpoint for all 32
clubs and regenerates `src/data/nhl-2026-27.ts`. The snapshot contains 794 player
records fetched on 2026-11-14: names, NHL IDs, sweater numbers, positions, birth
dates, calculated opening-day ages, countries and official headshot URLs.

This is deliberately an identity layer, not an invented claim of authoritative
ratings or financial data. Attributes, OVR, potential, salaries and contract terms
remain deterministic fictional game values. The career state records this split in
`dataSource`, and the UI repeats it on career creation and in Settings.

Team crests load from the official NHL asset CDN through a replaceable URL manifest.
The Crest component falls back to the existing neutral abbreviation shield when an
asset is unavailable. Headshots use the URLs supplied by the roster API. These marks
and photographs remain the property of their respective rights holders; this project
is not licensed or endorsed by the NHL. A commercial release requires a separate
rights review or replacement asset pack.

Extra roster-endpoint entries beyond the active game roster enter an organizational
reserve. The new Farm & Reserve screen supports assignments and recalls, preserves
ownership, refreshes line combinations and checks active-roster composition and cap
space. Reserve players age, retire and expire contracts with the rest of the world.
This is not yet a verified AHL affiliate database: waivers, two-way deals, separate
farm schedules and affiliate standings remain future work.
