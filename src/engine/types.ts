import type { Locale } from "../i18n/locales";

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
  /** Sum of match ratings (1–10) for rated games; see matchRatings.ts. */
  ratingSum?: number;
  /** Number of games with a match rating. */
  rated?: number;
  /** Times named one of the three stars of a game. */
  stars?: number;
}
export interface ConversationLine {
  speaker: "manager" | "player";
  ru: string;
  en: string;
  mood?: "positive" | "neutral" | "negative";
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
  /** Overall pick number when drafted in this career. */
  draftOverall?: number;
  ratingSource?: "nhl-stats-model" | "generated";
  contractSource?: "puckpedia" | "generated";
  contractExpiryYear?: number;
  contractStatus?: "UFA" | "RFA";
  contractRemainingValue?: number;
  performanceForm?: number;
  formAdjustment?: number;
  /** Permanent ceiling while a hot streak temporarily lifts displayed POT. */
  potentialBeforeForm?: number;
  /** Base OVR before the first skill session of this season. */
  trainingStartOverall?: number;
  injuryBurden?: number;
  motivation?: number;
  relationship?: number;
  /** Set when the player has asked to be traded. */
  tradeRequest?: { year: number; reason: "captaincy" | "meeting" };
  lastConversationRound?: number;
  conversationHistory?: {
    year: number;
    round: number;
    topic: string;
    tone: string;
    managerLine?: string;
    response: string;
    /** Bilingual copies; absent on saves made before multi-turn meetings. */
    managerLineI18n?: { ru: string; en: string };
    responseI18n?: { ru: string; en: string };
    summary?: { ru: string; en: string };
    transcript?: ConversationLine[];
    exchanges?: number;
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
    /** Change of the hidden potential that season (late bloomer / bust). */
    potentialDelta?: number;
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
  /** National-team appearances (absent on older saves). */
  international?: import("./tournaments").InternationalCareerLine[];
}
export interface Tactics {
  benchOpening?: { plan?: "wide" | "slot" | "high"; message?: "attack" | "safe" | "support" };
  markPlayer?: string;
  forecheck: "1-2-2" | "2-1-2" | "1-3-1";
  pace: number;
  physical: number;
  shooting: number;
  width?: number;
  passingRisk?: number;
  shiftSeconds?: number;
  /** Even-strength ice-time distribution; missing in older saves. */
  iceTime?: IceTimePlan;
}
export type IceTimePreset = "balanced" | "top" | "roll" | "short" | "custom";
export interface IceTimePlan {
  preset?: IceTimePreset;
  /** Relative even-strength weights for forward lines L1–L4. */
  forwards: number[];
  /** Relative even-strength weights for defence pairs P1–P3. */
  defense: number[];
  /** Forward who also takes the 4th line's shifts. */
  doubleShift?: string;
}
export type SpecialTeamsSituation =
  "5v4" | "5v3" | "4v3" | "4v5" | "3v5" | "3v4" | "3v3" | "6v5" | "5v6";
export interface SpecialTeamUnit {
  players: string[];
  style:
    | "umbrella"
    | "overload"
    | "net-front"
    | "diamond"
    | "box"
    | "wedge"
    | "triangle"
    | "aggressive"
    | "possession"
    | "protect-lead";
}
export type TrainingSession =
  | "rest"
  | "recovery"
  | "teamwork"
  | "tactical"
  | "offense"
  | "defense"
  | "skills"
  | "goalie"
  | "conditioning";
export interface TrainingDayPlan {
  morning: TrainingSession;
  afternoon: TrainingSession;
}
export interface TrainingSchedule {
  intensity: "low" | "normal" | "high";
  days: TrainingDayPlan[];
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
  scoutGames?: import("./coaching").ScoutGame[];
  aiProfile?: AiGeneralManagerProfile;
  ahlAffiliate?: string;
  ahlLogoUrl?: string;
  training?: import("./training").TrainingPlan;
  trainingTicks?: number;
  trainingSchedule?: TrainingSchedule;
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
  specialTeams?: Partial<Record<SpecialTeamsSituation, SpecialTeamUnit>>;
  captainId?: string;
  alternateCaptainIds?: string[];
  record: RecordStats;
  /** Coaching, medical and scouting staff (absent on older saves). */
  staff?: Partial<
    Record<import("./staff").StaffRole, import("./staff").StaffMember>
  >;
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
export type ProspectTrait =
  | "contender"
  | "big-market"
  | "small-market"
  | "cold-climate"
  | "warm-climate"
  | "close-to-home"
  | "playing-time"
  | "college-first"
  | "development";
export interface DraftProspect {
  player: Player;
  region: ScoutingRegion;
  trueRank: number;
  draftedBy?: string;
  draftedOverall?: number;
  /** Real league identity or a game-generated prospect (absent: generated). */
  source?: "real" | "generated";
  league?: string;
  club?: string;
  hometown?: import("./names").Hometown;
  /** True when the hometown comes from the game model, not the feed. */
  hometownModeled?: boolean;
  heightCm?: number;
  weightKg?: number;
  shoots?: "L" | "R";
  stats?: { gp: number; g: number; a: number };
  /** Personal convictions that shape interest in clubs. */
  traits?: ProspectTrait[];
}
export interface ProspectInterview {
  /** 0–100 interest in the user's club; ≤ 5 with a refusal. */
  interest: number;
  refused?: "rivalry" | "grudge";
  dream?: boolean;
  asked: string[];
  transcript: ConversationLine[];
  /** Traits revealed to the user during the talk. */
  revealed: ProspectTrait[];
  round: number;
}
export interface ScoutingReport {
  observations?: Partial<Record<import("./careerDesk").ScoutFocus,number>>;
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
  /** Absent on older saves (plain exhibition games). */
  kind?: "exhibition" | "cup";
  stage?: "group" | "final" | "third";
  neutral?: boolean;
}
export interface PressAppearance {
  date: string;
  type: "pre-match" | "post-match";
  tone: "protective" | "balanced" | "ambitious";
  headline: string;
  fanDelta: number;
  boardDelta: number;
  moraleDelta: number;
  /** Multi-question conferences (absent on older saves). */
  questionId?: string;
  journalist?: { ru: string; en: string };
  outlet?: { ru: string; en: string };
  question?: { ru: string; en: string };
  style?: { ru: string; en: string };
  headlineI18n?: { ru: string; en: string };
  reaction?: { ru: string; en: string };
  playerId?: string;
  playerMoraleDelta?: number;
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
  publicNewsClubs?: string[];
  assistantReviewed?: boolean;
  id: string;
  date: string;
  category: ManagementEventCategory;
  priority: "low" | "normal" | "high" | "critical";
  title: string;
  body: string;
  teamId?: string;
  playerId?: string;
  action?:
    | "roster"
    | "injuries"
    | "contracts"
    | "trades"
    | "draft"
    | "strategy"
    | "leadership"
    | "tactics"
    | "press"
    | "finances"
    | "preseason"
    | "international";
  responseDue?: string;
  requiresResponse?: boolean;
  /** Bilingual copy of title/body (newer generators); UI prefers it. */
  i18n?: { title: { ru: string; en: string }; body: { ru: string; en: string } };
  /** Message family for messages with special handling (reply options). */
  kind?: "captaincy-letter";
  /** Reply options shown in the inbox (career-language text). */
  replies?: { id: string; label: string; detail?: string }[];
  /** The reply the manager chose; replies apply their effects once. */
  replyId?: string;
  replyOutcome?: string;
  replyEffects?: { morale: number; relationship: number };
  /** Dressing-room approval of the decision the message is about. */
  approval?: number;
  read: boolean;
  resolved: boolean;
}
/** Bookkeeping for generated inbox messages (rate limits and baselines). */
export interface InboxState {
  /** Cooldown key → ISO date the message last fired. */
  cooldowns: Record<string, string>;
  /** User players that were injured at the previous check. */
  injured?: string[];
  /** User games (regular season + playoffs) seen at the previous check. */
  userGames?: number;
  /** Cumulative goalie shots against / goals against after recent user games. */
  goalieLog?: Record<string, [number, number]>[];
  /** Current result streak of the user club. */
  streak?: { kind: "W" | "L"; n: number };
  /** User payroll at the previous check, in $M. */
  payroll?: number;
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
  /** Pre-draft interviews by prospect id (absent on older saves). */
  interviews?: Record<string, ProspectInterview>;
  /** Interviews the user can still hold before the draft. */
  interviewsLeft?: number;
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
  assists?:string[];
  scoutFilm?: import("./coaching").ScoutFrame[];
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
    | "offside"
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
  startingUnits?: Record<string,number>;
  iceMinutes?: Record<string,number>;
  scoutTarget?: { id: string; name: string; marked: boolean; priorShots: number; games: number };
  matchups?: import("./coaching").LineMatchup[];
  date?: string;
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
  /** Match rating (1–10) per player id who appeared. */
  ratings?: Record<string, number>;
  /** Three stars of the game, first star first. */
  stars?: string[];
}
export interface Series {
  a: string;
  b: string;
  wins: number[];
  winner?: string;
  games: Result[];
}
export type TeamMeetingTopic =
  | "praise"
  | "demand-more"
  | "losing-streak"
  | "big-game"
  | "discipline"
  | "back-player"
  | "expectations";
export type TeamMeetingTone = "supportive" | "calm" | "demanding" | "furious";
export type MeetingGroup = "leaders" | "veterans" | "young" | "unhappy";
export type MeetingReaction =
  | "inspired"
  | "positive"
  | "indifferent"
  | "unconvinced"
  | "angry";
export interface TeamMeetingRecord {
  date: string;
  /** Legacy reasons from saves before topic-based meetings, or a topic. */
  reason: "preseason" | "losing-streak" | "playoffs" | "morale" | TeamMeetingTopic;
  tone: TeamMeetingTone;
  leaderId: string;
  outcome: "positive" | "neutral" | "negative";
  message: string;
  topic?: TeamMeetingTopic;
  targetPlayerId?: string;
  score?: number;
  messageI18n?: { ru: string; en: string };
  reactions?: {
    group: MeetingGroup;
    reaction: MeetingReaction;
    count: number;
    ru: string;
    en: string;
  }[];
  moraleDelta?: number;
  motivationDelta?: number;
}
export interface LeadershipLogEntry {
  date: string;
  year: number;
  captainId: string;
  alternateIds: string[];
  previousCaptainId?: string;
  approval: number;
  verdict: "united" | "approved" | "doubts" | "upset" | "revolt";
  letterEventId?: string;
}
export interface Game {
  mediaArchive?: import("./media").MediaStory[];
  gmDiscussions?: {club:string;date:string;offered:string[];requested:string[];accepted:boolean}[];
  iceAgreements?: import("./careerDesk").IceAgreement[];
  developmentPlans?: import("./careerDesk").DevelopmentPlan[];
  matchPreparation?: { date: string; opponent: string; plan?: "wide" | "slot" | "high"; talk?: { tone: "trust" | "challenge"; message: "attack" | "safe" | "support" } };
  matchCoverage?: { date: string; opponent: string; target: string };
  freeAgentOffers?: import("./freeAgency").FreeAgentOffer[];
  calendar?: CalendarState;
  preseasonFixtures?: PreseasonFixture[];
  preseason?: import("./preseason").PreseasonState;
  preseasonCupHistory?: import("./preseason").CupHistoryEntry[];
  /** Mid-season break and international tournaments of the current season. */
  internationalSeason?: import("./tournaments").InternationalSeason;
  internationalHistory?: import("./tournaments").TournamentHistoryEntry[];
  pressHistory?: PressAppearance[];
  events?: ManagementEvent[];
  inboxState?: InboxState;
  /** Player requests, promises and trade-list requests (playerRequests.ts). */
  playerRequests?: import("./playerRequests").PlayerRequestState;
  franchiseStrategy?: FranchiseStrategy;
  strategySeason?: number;
  leadershipSeason?: number;
  leadershipConsequenceSeason?: number;
  leadershipStrategyChanged?: boolean;
  teamMeetings?: TeamMeetingRecord[];
  /** Captaincy changes and the room's verdict, newest first. */
  leadershipLog?: LeadershipLogEntry[];
  /** User-club player id → year he joined the club. */
  clubTenure?: Record<string, number>;
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
  /** Specialists available for hire this season. */
  staffMarket?: import("./staff").StaffMember[];
  /** Season the staff market was last refreshed. */
  staffYear?: number;
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
  /** Potential model the player ceilings were computed with. */
  potentialModel?: number;
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
  clubMatchHistory?: (Pick<Result, "home" | "away" | "goals" | "ot" | "so"> & { date: string; events?:Event[] })[];
  news: string[];
  history: { year: number; champion: string; points: number }[];
  awards?: import("./awards").SeasonAward[];
  rules: { cap: number };
  language: Locale;
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
