// Generated/replaced by scripts/sync-scout-leagues.mjs. Never invent real player identities.
export type ScoutLeague = "OHL" | "WHL" | "USHL" | "SHL" | "Liiga";
export interface ScoutEntry {
  id: string; name: string; club: string; pos: "LW"|"C"|"RW"|"D"|"G";
  number: number; nation: string; age: number; ovr: number; potential: number;
  model: "stats" | "provisional" | "game"; games?: number; goals?: number; assists?: number;
}
export const SCOUT_LEAGUE_META = { fetchedAt: "", season: "2026/27", sources: { WHL: "", USHL: "", SHL: "", Liiga: "" } } as const;
export const SCOUT_LEAGUE_PLAYERS: Record<Exclude<ScoutLeague,"OHL">, ScoutEntry[]> = { WHL: [], USHL: [], SHL: [], Liiga: [] };
