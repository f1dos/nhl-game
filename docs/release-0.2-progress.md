# Release 0.2: iteration 1

Implemented: independent injury probability using durability, physicality, age,
fatigue and current match workload; bruises, strains and fractures with different
recovery durations; injured skaters excluded from subsequent shifts; healthy
replacement selection; backup goalie selection when starter is unavailable.
GP now counts actual participation, and fatigue uses this match's TOI.
Existing version-1 saves remain compatible without changing their schema.

Recovery still uses simulation ticks, not calendar days. Injury type is recorded
in match events only. Goalkeeper injuries during play are not implemented.
If fewer than five healthy skaters or no healthy goalie are available at kickoff,
simulation raises an error before changing statistics. In-match injury generation
preserves a minimum of five healthy skaters; emergency roster transactions remain
future work. Persistent line assignments are preserved; substitutions are computed
for each shift.

Observed outstanding defects: playoff news repeats the last user result when the
user no longer plays; rating is an unweighted average; penalties do not remove
skaters; contracts renew indefinitely. These require separate PRs. This iteration
does not constitute completion of release 0.2 or a full repository audit.

Next: manpower and penalty state, playoff news regression; then positional
ratings, contract expiration, trades and autonomous club management.
