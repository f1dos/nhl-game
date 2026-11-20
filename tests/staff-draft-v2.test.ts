import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  ensureDraft,
  interviewProspect,
  makeUserDraftPick,
  openDraft,
  prospectStance,
  rivalClubs,
} from "../src/engine/draft";
import { ensureFranchiseWorld } from "../src/engine/franchiseWorld";
import { ensureManagementState } from "../src/engine/management";
import {
  ensureStaff,
  hireStaff,
  STAFF_BUDGET,
  STAFF_ROLES,
  staffPayroll,
} from "../src/engine/staff";
import { trainTeam } from "../src/engine/training";
import { KNOWN_NAME_NATIONS, nationalName } from "../src/engine/names";
import { validateSave } from "../src/engine/saves";
import { SpatialMatch } from "../src/engine/spatialMatch";

const career = (team = "NYR") => {
  const g = newGame(team, 2027, "en");
  ensureManagementState(g);
  ensureFranchiseWorld(g);
  return g;
};

test("every club opens with a full staff and real head coaches", () => {
  const g = career();
  for (const team of g.teams) {
    for (const role of STAFF_ROLES) assert(team.staff?.[role], `${team.id} ${role}`);
    assert(team.staff!["head-coach"]!.real, `${team.id} head coach is real`);
  }
  assert.equal(g.teams.find((t) => t.id === "TBL")!.staff!["head-coach"]!.name, "Jon Cooper");
  assert(g.staffMarket!.length >= STAFF_ROLES.length * 3);
  assert(validateSave(JSON.parse(JSON.stringify(g))));
});

test("hiring respects the staff budget and an elite doctor heals faster", () => {
  const g = career();
  const team = g.teams.find((t) => t.id === g.user)!;
  const doctor = g.staffMarket!.filter((m) => m.role === "doctor").sort((a, b) => b.rating - a.rating)[0];
  hireStaff(g, doctor.id);
  assert.equal(team.staff!.doctor!.id, doctor.id);
  assert(staffPayroll(team) <= STAFF_BUDGET);
  // Two identical injured players: one club with an elite doctor heals sooner.
  const elite = structuredClone(team);
  const plain = structuredClone(team);
  elite.staff!.doctor!.rating = 95;
  plain.staff!.doctor!.rating = 50;
  elite.players[0].injury = plain.players[0].injury = 12;
  let a = 0, b = 0;
  while (elite.players[0].injury > 0) { trainTeam(elite); a++; }
  while (plain.players[0].injury > 0) { trainTeam(plain); b++; }
  assert(a < b, `elite doctor ${a} ticks vs ${b}`);
});

test("the staff market refreshes each season with generated candidates", () => {
  const g = career();
  const first = g.staffMarket!.map((m) => m.id).join();
  g.year++;
  ensureStaff(g);
  assert.notEqual(g.staffMarket!.map((m) => m.id).join(), first);
  assert(g.staffMarket!.every((m) => !m.real));
});

test("generated names match their nationality", () => {
  for (const nation of KNOWN_NAME_NATIONS) {
    const name = nationalName(nation, "seed-1");
    assert.match(name, /^\S+ \S+/);
  }
  assert.notEqual(nationalName("RUS", "x"), nationalName("SWE", "x"));
});

test("the 2027 class mixes real league players with generated prospects", () => {
  const g = career();
  const draft = ensureDraft(g);
  assert.equal(draft.prospects.length, 224);
  const real = draft.prospects.filter((p) => p.source === "real");
  assert(real.length > 100, `${real.length} real prospects`);
  assert(new Set(real.map((p) => p.league)).size >= 4);
  assert(draft.prospects.some((p) => p.region === "Russia"));
  // Draft-eligible teenagers are far from NHL level today.
  assert(draft.prospects.every((p) => p.player.ovr <= 70 && p.player.age <= 18));
  assert(draft.prospects.every((p) => p.player.potential >= p.player.ovr));
});

test("hometown rivals refuse, hometown kids dream, interviews move interest", () => {
  const g = career("PHI");
  const draft = ensureDraft(g);
  const pit = draft.prospects[0];
  pit.hometown = { city: "Pittsburgh", region: "PA", country: "USA", club: "PIT" };
  assert(rivalClubs(g, "PIT").includes("PHI"));
  assert.equal(prospectStance(g, pit, "PHI").refused, "rivalry");
  const local = draft.prospects[1];
  local.hometown = { city: "Philadelphia", region: "PA", country: "USA", club: "PHI" };
  assert(prospectStance(g, local, "PHI").dream);
  const before = draft.interviewsLeft!;
  const meeting = interviewProspect(g, pit.player.id, "dream");
  assert.equal(draft.interviewsLeft, before - 1);
  assert(meeting.interest <= 5);
  assert(meeting.transcript.some((line) => line.en.includes("Pittsburgh")));
  interviewProspect(g, local.player.id, "dream");
  assert(draft.interviews![local.player.id].interest >= 90);
  assert.throws(() => interviewProspect(g, local.player.id, "dream"));
});

test("a refusing pick is unhappy and a dream pick is thrilled", () => {
  const g = career("PHI");
  const draft = ensureDraft(g);
  g.teams.forEach((t, i) => (t.record.pts = t.id === "PHI" ? 0 : 50 + i));
  openDraft(g);
  assert.equal(draft.picks[draft.currentPick].team, g.user);
  const target = draft.prospects.find((p) => !p.draftedBy)!;
  target.hometown = { city: "Pittsburgh", region: "PA", country: "USA", club: "PIT" };
  makeUserDraftPick(g, target.player.id);
  const drafted = g.teams.find((t) => t.id === "PHI")!.prospects!.find((p) => p.id === target.player.id)!;
  assert(drafted.morale <= 25);
  assert(g.news.some((n) => n.includes(target.player.name)));
});

test("realistic match flow: hits, blocks, interceptions and rebounds happen", () => {
  const g = newGame();
  const kinds = new Map<string, number>();
  const events = new Map<string, number>();
  for (const seed of [2, 8]) {
    const m = new SpatialMatch(g.teams[seed], g.teams[seed + 4], seed, false, { presentation: true });
    let last = 0;
    for (let i = 0; i < 200000 && !m.done; i++) {
      m.resume();
      m.step();
      for (const c of m.frame.cues) if (c.seq > last) { last = c.seq; kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1); }
      if (m.frame.stoppage) kinds.set(`stop:${m.frame.stoppage.kind}`, 1);
    }
    for (const e of m.result.events) events.set(e.type, (events.get(e.type) ?? 0) + 1);
  }
  for (const kind of ["block", "check", "pass", "shot", "save", "whistle"]) assert((kinds.get(kind) ?? 0) > 0, `no ${kind}`);
  assert((events.get("hit") ?? 0) > 10);
  assert((events.get("turnover") ?? 0) > 10);
});
