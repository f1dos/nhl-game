import { autoLines } from "./database";
import { askingSalary, salaryTotal, signContract, CONTRACT_RULES } from "./contracts";
import type { Game, Player, Team } from "./types";

export type PromisedRole = "depth" | "middle-six" | "top-six" | "star";
export type FreeAgentOfferStatus =
  | "pending" | "countered" | "accepted" | "rejected"
  | "signed-elsewhere" | "withdrawn" | "expired";
export type AgentResponse =
  | "reviewing" | "salary" | "role" | "term"
  | "club-fit" | "accepted" | "competitor"
  | "cap" | "unavailable" | "withdrawn" | "expired";

export interface FreeAgentOffer {
  id: string;
  playerId: string;
  teamId: string;
  salary: number;
  years: number;
  role: PromisedRole;
  submittedDate: string;
  decisionDate: string;
  status: FreeAgentOfferStatus;
  agentResponse: AgentResponse;
  counterSalary?: number;
  counterYears?: number;
  counterRole?: PromisedRole;
  competingTeamId?: string;
  attempts: number;
}

export const OFFER_ROLES: PromisedRole[] = ["depth", "middle-six", "top-six", "star"];
const round2 = (n: number) => Math.round(n * 100) / 100;
const hash = (s: string) => {
  let v = 2166136261;
  for (const c of s) v = Math.imul(v ^ c.charCodeAt(0), 16777619) >>> 0;
  return v >>> 0;
};
const datePlus = (date: string, days: number) => {
  const dt = new Date(date + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};
const dateOf = (g: Game) => g.calendar?.date ?? `${g.year}-10-07`;
const roleRank = (role: PromisedRole) => OFFER_ROLES.indexOf(role);
export function desiredFreeAgentRole(p: Player): PromisedRole {
  return p.ovr >= 84 ? "star" : p.ovr >= 78 ? "top-six" : p.ovr >= 72 ? "middle-six" : "depth";
}
export function desiredFreeAgentYears(p: Player): number {
  return p.age <= 25 ? 3 : p.age <= 31 ? 2 : 1;
}
export function freeAgentInterest(g: Game, p: Player, team: Team): number {
  const rank = team.strengthRank ?? 16;
  const temperament = (hash(p.id + ":" + team.id) % 21) - 10;
  const veteran = p.age >= 29 ? (17 - rank) * 0.75 : (rank - 17) * 0.30;
  const rosterFit = team.players.filter((member) => member.pos === p.pos && member.ovr >= p.ovr).length;
  return Math.max(0, Math.min(100, Math.round(55 + temperament + veteran - rosterFit * 4)));
}
function cannotJoin(g: Game, p: Player, team: Team): boolean {
  // A subset of established veterans categorically refuses a struggling club.
  // Deterministic and based on player/team identity so reloading cannot reroll it.
  return p.age >= 27 && p.ovr >= 80 && (team.strengthRank ?? 16) >= 24 &&
    hash(p.id + ":club-preference:" + team.id) % 5 === 0;
}
function competingTeam(g: Game, p: Player, user: Team): {team: Team; salary: number; years: number} | null {
  const chance = hash(p.id + ":rival-market:" + g.year) % 100;
  if (chance >= 45) return null;
  const options = g.teams.filter((team) => team.id !== user.id &&
    team.players.length < CONTRACT_RULES.maxRoster &&
    salaryTotal(team) + askingSalary(p, g, team.id) * 1.2 <= g.rules.cap);
  if (!options.length) return null;
  options.sort((a,b) => freeAgentInterest(g,p,b) - freeAgentInterest(g,p,a) || a.id.localeCompare(b.id));
  const team = options[0];
  const salary = round2(askingSalary(p,g,team.id)*(1.04+(hash(p.id + team.id) % 16)/100));
  return {team,salary,years:desiredFreeAgentYears(p)};
}

function assertOfferTerms(g: Game, team: Team, player: Player, years: number, salary: number, role: PromisedRole) {
  if (!OFFER_ROLES.includes(role) ||
      !Number.isInteger(years) || years < 1 || years > CONTRACT_RULES.maxYears ||
      !Number.isFinite(salary) || salary < CONTRACT_RULES.minimumSalary ||
      salary > g.rules.cap * .2)
    throw Error("Invalid free-agent offer terms");
  if (team.players.length >= CONTRACT_RULES.maxRoster)
    throw Error("Roster is full");
  if (salaryTotal(team) + salary > g.rules.cap + 1e-8)
    throw Error("Salary cap exceeded");
  if (!g.freeAgents?.some(p => p.id === player.id))
    throw Error("Player is no longer a free agent");
}

export function proposeFreeAgentContract(g: Game, playerId: string, years: number, salary: number, role: PromisedRole) {
  const p = g.freeAgents?.find(player => player.id === playerId);
  const team = g.teams.find(club => club.id === g.user);
  if (!p || !team) throw Error("Free agent unavailable");
  assertOfferTerms(g,team,p,years,salary,role);
  g.freeAgentOffers ??= [];
  const prior = [...g.freeAgentOffers].reverse().find(o=>o.playerId===playerId && o.teamId===g.user);
  if (prior?.status === "pending") throw Error("Agent is already reviewing your offer");
  if (prior?.status === "countered" && prior.attempts >= 3) throw Error("Agent has ended negotiations");
  if (prior?.status === "countered" && prior.decisionDate < dateOf(g)) {
    // A counter is valid for seven calendar days, not indefinitely.
    if (datePlus(prior.decisionDate,7) < dateOf(g)) throw Error("Agent counteroffer has expired");
  }
  const current = dateOf(g);
  const attempts = (prior?.status==="countered" ? prior.attempts : 0) + 1;
  const offer: FreeAgentOffer = {
    id: `fa-${g.year}-${g.freeAgentOffers.length + 1}-${playerId}`,
    playerId,teamId:g.user,salary:round2(salary),years,role,
    submittedDate:current,
    decisionDate:datePlus(current,2+(hash(playerId+":"+attempts) % 3)),
    status:"pending",agentResponse:"reviewing",attempts,
  };
  if (prior?.status==="countered") {
    prior.status="withdrawn";
    prior.agentResponse="withdrawn";
  }
  g.freeAgentOffers.push(offer);
  return offer;
}

export function withdrawFreeAgentOffer(g: Game, id: string) {
  const offer = g.freeAgentOffers?.find(o=>o.id===id && o.teamId===g.user);
  if (!offer || !["pending","countered"].includes(offer.status)) throw Error("Offer cannot be withdrawn");
  offer.status="withdrawn";
  offer.agentResponse="withdrawn";
}

export function processFreeAgentOffers(g: Game): FreeAgentOffer[] {
  const now = dateOf(g);
  const done: FreeAgentOffer[] = [];
  for (const offer of g.freeAgentOffers ?? []) {
    if (offer.status==="countered" && now>datePlus(offer.decisionDate,7)) {
      offer.status="expired";offer.agentResponse="expired";done.push(offer);
      continue;
    }
    if (offer.status!=="pending" || offer.decisionDate>now) continue;
    const p = g.freeAgents?.find(player=>player.id===offer.playerId);
    const team = g.teams.find(club=>club.id===offer.teamId);
    if (!p || !team) {
      offer.status="signed-elsewhere";offer.agentResponse="unavailable";done.push(offer);continue;
    }
    if (salaryTotal(team)+offer.salary>g.rules.cap || team.players.length>=CONTRACT_RULES.maxRoster) {
      offer.status="rejected";offer.agentResponse="cap";done.push(offer);continue;
    }
    if (cannotJoin(g,p,team)) {
      offer.status="rejected";offer.agentResponse="club-fit";done.push(offer);continue;
    }
    const ask=askingSalary(p,g,team.id);
    const roleGap=roleRank(desiredFreeAgentRole(p))-roleRank(offer.role);
    const needed = round2(ask*(1 + Math.max(0,55-freeAgentInterest(g,p,team))/160));
    const yearsNeeded=desiredFreeAgentYears(p);
    const score = (offer.salary/Math.max(ask,.1))*76 +
      (offer.years >= yearsNeeded ? 8 : -8) -
      Math.max(0,roleGap)*14 + (freeAgentInterest(g,p,team)-50)*.35;
    const rival=competingTeam(g,p,team);
    const rivalPrefers = rival &&
      (rival.salary > offer.salary * 1.06) &&
      (freeAgentInterest(g,p,rival.team) > freeAgentInterest(g,p,team)+3);
    if (rivalPrefers) {
      try {
        signContract(g,rival.team.id,p.id,rival.years,rival.salary);
        autoLines(rival.team);
        offer.status="signed-elsewhere";
        offer.agentResponse="competitor";
        offer.competingTeamId=rival.team.id;
        done.push(offer);
        continue;
      } catch { /* Agent keeps negotiating if rival offer is no longer legal */ }
    }
    if (score>=90 && offer.salary>=Math.max(ask, needed*.96) && roleGap<=0) {
      try {
        signContract(g,team.id,p.id,offer.years,offer.salary);
        autoLines(team);
        offer.status="accepted";offer.agentResponse="accepted";done.push(offer);continue;
      } catch {
        offer.status="rejected";offer.agentResponse="cap";done.push(offer);continue;
      }
    }
    if (offer.attempts>=3 || offer.salary<ask*.56) {
      offer.status="rejected";
      offer.agentResponse=offer.salary<ask*.56?"salary":"club-fit";
    } else {
      offer.status="countered";
      offer.agentResponse=roleGap>0?"role":offer.years<yearsNeeded?"term":"salary";
      offer.counterSalary=round2(Math.max(needed,offer.salary*1.08));
      offer.counterYears=Math.max(offer.years,yearsNeeded);
      offer.counterRole=desiredFreeAgentRole(p);
    }
    done.push(offer);
  }
  return done;
}
