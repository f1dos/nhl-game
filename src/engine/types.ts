export type Position = "LW" | "C" | "RW" | "D" | "G";
export interface Stats {
  gp: number;
  g: number;
  a: number;
  sog: number;
  pim: number;
  plus: number;
  toi: number;
  sa: number;
  ga: number;
  wins: number;
}
export interface Player {
  archetype?: import('./ratings').Archetype;
  id: string;
  name: string;
  number: number;
  pos: Position;
  age: number;
  nation: string;
  attributes: Record<string, number>;
  ovr: number;
  potential: number;
  salary: number;
  years: number;
  fatigue: number;
  morale: number;
  injury: number;
  stats: Stats;
  history: { year: number; ovr: number; stats: Stats }[];
}
export interface Tactics {
  forecheck: "1-2-2" | "2-1-2" | "1-3-1";
  pace: number;
  physical: number;
  shooting: number;
}
export interface RecordStats {
  gp: number;
  w: number;
  l: number;
  otl: number;
  gf: number;
  ga: number;
  pts: number;
  rw: number;
  pp: number;
  ppo: number;
  pk: number;
  pko: number;
  form: string[];
}
export interface Team {
  id: string;
  city: string;
  name: string;
  division: string;
  conference: string;
  color: string;
  players: Player[];
  lines: string[][];
  defense: string[][];
  goalie: string;
  tactics: Tactics;
  record: RecordStats;
}
export interface Fixture {
  id: string;
  round: number;
  home: string;
  away: string;
  result?: Result;
}
export interface Event {
  playerId?: string;
  skaters?: string[][];
  time: number;
  type:
    | "shot"
    | "goal"
    | "penalty"
    | "hit"
    | "turnover"
    | "faceoff"
    | "injury"
    | "shootout";
  team: string;
  player: string;
  text: string;
  x: number;
  y: number;
  score: number[];
  xg?: number;
}
export interface Result {
  home: string;
  away: string;
  goals: number[];
  shots: number[];
  xg: number[];
  pp: number[];
  ppo: number[];
  ot: boolean;
  so: boolean;
  duration: number;
  events: Event[];
}
export interface Series {
  a: string;
  b: string;
  wins: number[];
  winner?: string;
  games: Result[];
}
export interface Game {
  transactions?: {year:number;round:number;message:string}[];
  version: 1;
  id: string;
  seed: number;
  year: number;
  user: string;
  round: number;
  phase: "regular" | "playoffs" | "offseason";
  teams: Team[];
  schedule: Fixture[];
  bracket: Series[][];
  playoffRound: number;
  last?: Result;
  news: string[];
  history: { year: number; champion: string; points: number }[];
  rules: { cap: number };
  language: "ru" | "en";
}
export const emptyStats = (): Stats => ({
  gp: 0,
  g: 0,
  a: 0,
  sog: 0,
  pim: 0,
  plus: 0,
  toi: 0,
  sa: 0,
  ga: 0,
  wins: 0,
});
export const emptyRecord = (): RecordStats => ({
  gp: 0,
  w: 0,
  l: 0,
  otl: 0,
  gf: 0,
  ga: 0,
  pts: 0,
  rw: 0,
  pp: 0,
  ppo: 0,
  pk: 0,
  pko: 0,
  form: [],
});
