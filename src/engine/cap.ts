import type { Player } from "./types";
// The game grants replacement room only to an injured player explicitly designated LTIR.
export function capCharge(p: Player, salary = p.salary) {
  return p.injury > 0 && p.injuryStatus === "LTIR" ? 0 : salary;
}
export function rosterCharge(players: Player[]) {
  return (
    players.reduce(
      (dollars, p) => dollars + Math.round(capCharge(p) * 1_000_000),
      0,
    ) / 1_000_000
  );
}
