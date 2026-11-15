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
  league?:
    "NHL" | "AHL" | "OHL" | "SHL" | "Liiga" | "NL" | "DEL" | "KHL" | "Czech";
  currentClub?: string;
  leagueSource?: "hockeytech" | "generated";
  contractType?: "NHL" | "AHL" | "ELC" | "international";
  injurySource?: "puckpedia" | "simulation";
  injuryStatus?: string;
  injuryReason?: string;
  injuryTimeline?: string;
  injuryReturnDate?: string;
  injuryReport?: string;
  archetype?: import("./ratings").Archetype;
  externalId?: number;
  headshot?: string;
  birthDate?: string;
  identitySource?: "nhl-api" | "hockeytech" | "generated";
  ratingRank?: number;
  ratingSource?: "nhl-stats-model" | "generated";
  contractSource?: "puckpedia" | "generated";
  contractExpiryYear?: number;
  contractStatus?: "UFA" | "RFA";
  contractRemainingValue?: number;
  performanceForm?: number;
  formAdjustment?: number;
  injuryBurden?: number;
  motivation?: number;
  relationship?: number;
  lastConversationRound?: number;
  conversationHistory?: {
    year: number;
    round: number;
    topic: string;
    tone: string;
    managerLine?: string;
    response: string;
    outcome?: "positive" | "neutral" | "negative";
    moraleDelta: number;
    relationshipDelta: number;
    motivationDelta?: number;
  }[];
  developmentLog?: {
    year: number;
    delta: number;
    reason: string;
    ovrBefore: number;
    ovrAfter: number;
  }[];
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
  moraleOvrBonus?: number;
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
  aiProfile?: AiGeneralManagerProfile;
  ahlAffiliate?: string;
  ahlLogoUrl?: string;
  training?: import("./training").TrainingPlan;
  trainingTicks?: number;
  prospects?: Player[];
  farm?: Player[];
  logoUrl?: string;
  strengthRating?: number;
  strengthRank?: number;
  realWorldForm?: {
    gamesPlayed: number;
    pointPct: number;
    goalDifferential: number;
  };
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
export type InternationalRole = "depth" | "rotation" | "top-six";
export interface InternationalCandidate {
  player: Player;
  league: "SHL" | "Liiga" | "NL" | "DEL" | "KHL" | "Czech";
  club: string;
  contractUntil: number;
  transferStatus: "free" | "release-required" | "rights-restricted";
  desiredSalary: number;
  desiredYears: number;
  desiredRole: InternationalRole;
  adaptationRisk: number;
  agentLeverage: number;
  competingOffers: number;
  scouted: number;
  contactedBy?: string;
}
export interface InternationalOffer {
  id: string;
  playerId: string;
  team: string;
  salary: number;
  years: number;
  signingBonus: number;
  role: InternationalRole;
  developmentPlan: boolean;
  transferFee: number;
  submittedRound: number;
  decisionRound: number;
  status: "pending" | "accepted" | "rejected" | "countered";
  score: number;
  message: string;
}
export type ScoutingRegion =
  "North America" | "Nordic" | "Central Europe" | "Russia";
export interface DraftProspect {
  player: Player;
  region: ScoutingRegion;
  trueRank: number;
  draftedBy?: string;
  draftedOverall?: number;
}
export interface ScoutingReport {
  confidence: number;
  estimatedOvr: number;
  estimatedPotential: number;
  lastUpdatedRound: number;
}
export interface DraftPick {
  year: number;
  round: number;
  overall: number;
  team: string;
  originalTeam: string;
  prospectId?: string;
}
export type FranchiseStrategy =
  "draft-lottery" | "wild-card-hunt" | "playoff-breakthrough" | "stanley-cup";
export type ObjectiveTier = "critical" | "major" | "supporting";
export type ObjectiveMetric =
  | "conference-finish"
  | "playoff-qualification"
  | "playoff-round-wins"
  | "stanley-cup"
  | "young-nhl-players"
  | "cap-space"
  | "premium-draft-picks"
  | "team-morale"
  | "rivalry-wins";
export interface FranchiseObjective {
  id: string;
  season: number;
  tier: ObjectiveTier;
  metric: ObjectiveMetric;
  title: string;
  detail: string;
  target: number;
  progress: number;
  completed: boolean;
  evaluated: boolean;
}
export interface ManagerEmployment {
  confidence: number;
  status: "secure" | "under-pressure" | "final-warning" | "fired";
  seasonsReviewed: number;
  criticalFailures: number;
  lastReview?: string;
}
export interface FanState {
  supporters: number;
  engagement: number;
  happiness: number;
  attendance: number;
  revenueMultiplier: number;
  lastChange: string;
}
export interface RivalryState {
  id: string;
  teamA: string;
  teamB: string;
  label: string;
  heat: number;
  seasonWins: Record<string, number>;
  seasonLosses: Record<string, number>;
}
export interface TeamNeed {
  position: Position;
  priority: "critical" | "high" | "medium";
  reason: string;
  budget: number;
}
export interface AiGeneralManagerProfile {
  strategy: FranchiseStrategy;
  aggression: number;
  patience: number;
  risk: number;
  youthPreference: number;
  analytics: number;
  financialCaution: number;
  futureAssetWillingness: number;
}
export interface CalendarState {
  date: string;
  seasonStart: string;
  preseasonStart?: string;
  day: number;
  lastProcessedDate: string;
}
export interface PreseasonFixture {
  id: string;
  date: string;
  home: string;
  away: string;
  result?: Result;
}
export interface PressAppearance {
  date: string;
  type: "pre-match" | "post-match";
  tone: "protective" | "balanced" | "ambitious";
  headline: string;
  fanDelta: number;
  boardDelta: number;
  moraleDelta: number;
}
export type ManagementEventCategory =
  | "game"
  | "medical"
  | "contract"
  | "trade"
  | "scouting"
  | "organization"
  | "league";
export interface ManagementEvent {
  id: string;
  date: string;
  category: ManagementEventCategory;
  priority: "low" | "normal" | "high" | "critical";
  title: string;
  body: string;
  teamId?: string;
  playerId?: string;
  action?:
    "roster" | "injuries" | "contracts" | "trades" | "draft" | "strategy";
  responseDue?: string;
  requiresResponse?: boolean;
  read: boolean;
  resolved: boolean;
}
export interface DraftAsset {
  id: string;
  year: number;
  round: number;
  originalTeam: string;
  currentTeam: string;
  projectedOverall: number;
  value: number;
  history: { date: string; from: string; to: string }[];
}
export interface DraftState {
  year: number;
  status: "scouting" | "draft" | "complete";
  prospects: DraftProspect[];
  reports: Record<string, ScoutingReport>;
  picks: DraftPick[];
  currentPick: number;
  scoutingPoints: number;
  assignment: ScoutingRegion;
  shortlist: string[];
}
export interface DraftHistory {
  year: number;
  picks: (DraftPick & { player: string; pos: Position })[];
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
  freeAgentOffers?: import("./freeAgency").FreeAgentOffer[];
  calendar?: CalendarState;
  preseasonFixtures?: PreseasonFixture[];
  pressHistory?: PressAppearance[];
  events?: ManagementEvent[];
  franchiseStrategy?: FranchiseStrategy;
  strategySeason?: number;
  franchiseObjectives?: FranchiseObjective[];
  managerEmployment?: ManagerEmployment;
  fans?: Record<string, FanState>;
  rivalries?: RivalryState[];
  teamNeeds?: Record<string, TeamNeed[]>;
  draftAssets?: DraftAsset[];
  juniorPlayers?: Player[];
  internationalMarket?: InternationalCandidate[];
  internationalOffers?: InternationalOffer[];
  retired?: { year: number; player: Player }[];
  freeAgents?: Player[];
  contractHistory?: {
    year: number;
    team: string;
    player: string;
    years: number;
    salary: number;
  }[];
  transactions?: { year: number; round: number; message: string }[];
  draft?: DraftState;
  draftHistory?: DraftHistory[];
  dataSource?: {
    kind:
      | "official-identities-modeled-ratings"
      | "official-identities-demo-ratings"
      | "fictional";
    season: string;
    source: string;
    fetchedAt: string;
    ratingModel?: string;
    contractSource?: string;
    contractsFetchedAt?: string;
    injurySource?: string;
    injuriesFetchedAt?: string;
    minorsSource?: string;
    minorsFetchedAt?: string;
  };
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
