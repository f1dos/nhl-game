import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  addDays,
  advanceDay,
  continueGame,
  ensureManagementState,
  isImportantEvent,
  markEventsRead,
  selectFranchiseStrategy,
  unreadImportantCount,
} from "../src/engine/management";
import { generateInboxEvents } from "../src/engine/inbox";
import { validateSave } from "../src/engine/saves";
import type { Game, ManagementEvent, Player } from "../src/engine/types";

/** A career positioned in the regular season on a chosen calendar day. */
function season(
  teamId = "TOR",
  seed = 5150,
  date = "2026-11-20",
  day = 70,
): Game {
  const g = ensureManagementState(newGame(teamId, seed));
  g.calendar!.date = date;
  g.calendar!.day = day;
  return g;
}

const user = (g: Game) => g.teams.find((team) => team.id === g.user)!;
const fresh = (g: Game, before: Set<string>) =>
  g.events!.filter((event) => !before.has(event.id));
const snapshot = (g: Game) => new Set(g.events!.map((event) => event.id));

function topForward(g: Game) {
  return [...user(g).players]
    .filter((player) => !["D", "G"].includes(player.pos))
    .sort((a, b) => b.ovr - a.ovr)[0];
}

function heal(g: Game) {
  for (const player of user(g).players) player.injury = 0;
}

test("a key player's new injury creates an important medical message with a return estimate", () => {
  const g = season();
  heal(g);
  generateInboxEvents(g); // baseline: pre-existing injuries are not re-reported
  const star = topForward(g);
  star.injury = 9;
  star.injuryReason = "strain";
  g.calendar!.date = "2026-11-21";
  const before = snapshot(g);
  generateInboxEvents(g);
  const event = fresh(g, before).find((item) => item.playerId === star.id)!;
  assert.ok(event, "injury message expected");
  assert.equal(event.category, "medical");
  assert.equal(event.priority, "high");
  assert.equal(event.requiresResponse, true);
  assert.equal(event.action, "injuries");
  assert.match(event.body, /2026-11-30/);
  assert.equal(isImportantEvent(g, event), true);
  // Still injured the next day: no duplicate.
  g.calendar!.date = "2026-11-22";
  const again = snapshot(g);
  generateInboxEvents(g);
  assert.equal(
    fresh(g, again).filter((item) => item.playerId === star.id).length,
    0,
  );
});

test("injury baseline and depth injuries do not spam the inbox", () => {
  const g = season();
  const depth = [...user(g).players]
    .filter((player) => !["D", "G"].includes(player.pos))
    .sort((a, b) => a.ovr - b.ovr)[0];
  depth.injury = 30; // already injured when the system first looks
  const before = snapshot(g);
  generateInboxEvents(g);
  assert.equal(
    fresh(g, before).filter((e) => e.category === "medical").length,
    0,
  );
  // A short knock for a depth player is not worth a message at all.
  depth.injury = 0;
  generateInboxEvents(g);
  depth.injury = 2;
  const later = snapshot(g);
  generateInboxEvents(g);
  assert.equal(
    fresh(g, later).filter((e) => e.category === "medical").length,
    0,
  );
});

test("generated messages are capped per day and respect type cooldowns", () => {
  const g = season();
  heal(g);
  generateInboxEvents(g);
  const forwards = [...user(g).players]
    .filter((player) => !["D", "G"].includes(player.pos))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 5);
  for (const player of forwards) player.injury = 12;
  const before = snapshot(g);
  generateInboxEvents(g);
  const important = fresh(g, before).filter((event) =>
    isImportantEvent(g, event),
  );
  assert.equal(important.length, 2);
});

test("an agent asks for talks about an expiring core player, once per cooldown", () => {
  const g = season("TOR", 5150, "2026-12-01", 75); // 75 % 7 === 5
  const star = topForward(g);
  for (const player of user(g).players) player.years = 3;
  star.years = 1;
  const before = snapshot(g);
  generateInboxEvents(g);
  const talks = fresh(g, before).filter(
    (event) => event.category === "contract",
  );
  assert.equal(talks.length, 1);
  assert.equal(talks[0].playerId, star.id);
  assert.equal(talks[0].action, "contracts");
  assert.equal(talks[0].requiresResponse, true);
  // A week later the same player does not trigger again (60-day cooldown).
  g.calendar!.date = "2026-12-08";
  g.calendar!.day = 82;
  const later = snapshot(g);
  generateInboxEvents(g);
  assert.equal(
    fresh(g, later).filter((event) => event.playerId === star.id).length,
    0,
  );
});

test("the board warns when the club falls well short of its strategy", () => {
  const g = season("TOR", 5150, "2026-12-10", 71); // 71 % 7 === 1
  selectFranchiseStrategy(g, "stanley-cup");
  for (const team of g.teams) {
    team.record.gp = 25;
    team.record.pts = team.id === g.user ? 10 : 30;
  }
  const before = snapshot(g);
  generateInboxEvents(g);
  const warning = fresh(g, before).find(
    (event) => event.action === "strategy" && event.category === "organization",
  );
  assert.ok(warning);
  assert.equal(isImportantEvent(g, warning), true);
  // Not repeated a week later.
  g.calendar!.date = "2026-12-17";
  g.calendar!.day = 78;
  const later = snapshot(g);
  generateInboxEvents(g);
  assert.equal(
    fresh(g, later).filter((event) => event.action === "strategy").length,
    0,
  );
  // On track: no warning at all.
  const ok = season("TOR", 5150, "2026-12-10", 71);
  selectFranchiseStrategy(ok, "stanley-cup");
  for (const team of ok.teams) {
    team.record.gp = 25;
    team.record.pts = team.id === ok.user ? 45 : 25;
  }
  const quiet = snapshot(ok);
  generateInboxEvents(ok);
  assert.equal(
    fresh(ok, quiet).filter((event) => event.action === "strategy").length,
    0,
  );
});

test("a contending rival GM enquires about one of your players and is rate-limited", () => {
  const g = season("TOR", 5150, "2026-11-22", 72); // 72 % 5 === 2
  for (const team of g.teams)
    if (team.id !== g.user) team.aiProfile!.strategy = "stanley-cup";
  const before = snapshot(g);
  generateInboxEvents(g);
  const inquiry = fresh(g, before).find((event) => event.category === "trade")!;
  assert.ok(inquiry, "trade inquiry expected");
  assert.equal(inquiry.action, "trades");
  assert.equal(inquiry.requiresResponse, true);
  assert.ok(user(g).players.some((player) => player.id === inquiry.playerId));
  g.calendar!.date = "2026-11-27";
  g.calendar!.day = 77;
  const later = snapshot(g);
  generateInboxEvents(g);
  assert.equal(fresh(g, later).filter((e) => e.category === "trade").length, 0);
});

test("a farm prospect outperforming NHL depth pushes for a call-up", () => {
  const g = season("TOR", 5150, "2026-11-20", 76); // 76 % 10 === 6
  const team = user(g);
  const dressed = new Set(team.lines.flat());
  const weakest = team.players
    .filter(
      (player) => dressed.has(player.id) && !["D", "G"].includes(player.pos),
    )
    .sort((a, b) => a.ovr - b.ovr)[0];
  const prospect: Player = {
    ...structuredClone(weakest),
    id: "test-prospect",
    name: "Test Prospect",
    age: 20,
    ovr: weakest.ovr + 6,
    potential: 86,
    injury: 0,
  };
  team.farm = [prospect];
  const before = snapshot(g);
  generateInboxEvents(g);
  const report = fresh(g, before).find(
    (event) => event.playerId === prospect.id,
  )!;
  assert.ok(report);
  assert.equal(report.category, "scouting");
  assert.equal(report.priority, "high");
  assert.equal(report.action, "roster");
});

test("goalie slumps and losing streaks are reported after user games", () => {
  const g = season();
  const team = user(g);
  const goalie = team.players.find((player) => player.id === team.goalie)!;
  generateInboxEvents(g); // baseline
  const created: ManagementEvent[] = [];
  for (let game = 1; game <= 6; game++) {
    team.record.gp++;
    team.record.form = [...team.record.form, "L"].slice(-5);
    goalie.stats.sa += 30;
    goalie.stats.ga += 5;
    g.calendar!.date = addDays("2026-11-20", game * 2);
    const before = snapshot(g);
    generateInboxEvents(g);
    created.push(...fresh(g, before));
  }
  const streak = created.find((event) => event.action === "press")!;
  assert.ok(streak, "losing-streak message expected");
  assert.match(streak.title, /4/);
  const slump = created.find(
    (event) => event.playerId === goalie.id && event.category === "game",
  )!;
  assert.ok(slump, "goalie slump expected");
  assert.match(slump.body, /\.833/);
  assert.equal(slump.action, "tactics");
});

test("an unhappy key player complains about ice time", () => {
  const g = season("TOR", 5150, "2026-11-20", 73); // 73 % 7 === 3
  const team = user(g);
  team.record.gp = 12;
  const forwards = team.players
    .filter((player) => !["D", "G"].includes(player.pos))
    .sort((a, b) => b.ovr - a.ovr);
  forwards.forEach((player, index) => {
    player.morale = 70;
    player.injury = 0;
    player.stats.gp = 12;
    player.stats.toi = 12 * (20 - index * 0.5);
  });
  const benched = forwards[1];
  benched.stats.toi = 12 * 6;
  benched.morale = 40;
  const before = snapshot(g);
  generateInboxEvents(g);
  const complaint = fresh(g, before).find(
    (event) => event.playerId === benched.id,
  )!;
  assert.ok(complaint);
  assert.equal(complaint.priority, "high");
  assert.equal(complaint.requiresResponse, true);
  assert.match(complaint.body, /6\.0/);
});

test("messages are written in the career language", () => {
  const ru = season();
  const en = season();
  en.language = "en";
  for (const g of [ru, en]) {
    heal(g);
    generateInboxEvents(g);
    const star = topForward(g);
    star.injury = 9;
    generateInboxEvents(g);
  }
  const title = (g: Game) =>
    g.events!.find((event) => event.category === "medical" && event.playerId)!
      .title;
  assert.match(title(ru), /Травма/);
  assert.match(title(en), /^Injury:/);
});

test("continue stops for an important message and the inbox state survives saves", () => {
  const g = ensureManagementState(newGame("TOR", 777));
  selectFranchiseStrategy(g, "wild-card-hunt");
  while (g.calendar!.date < "2026-10-03") continueGame(g, "day");
  const control = structuredClone(g);
  // A new contract pushes the club over the cap: the next processed day
  // reports it and must interrupt a seven-day continue.
  topForward(g).salary += 25;
  const before = snapshot(g);
  assert.equal(continueGame(g, "week"), 1);
  assert.equal(g.calendar!.date, "2026-10-04");
  const stop = fresh(g, before).find((event) => event.action === "finances")!;
  assert.ok(stop);
  assert.equal(stop.requiresResponse, true);
  assert.ok(unreadImportantCount(g) >= 1);
  markEventsRead(g, [stop.id]);
  assert.equal(g.events!.find((event) => event.id === stop.id)!.read, true);
  // Without the cap problem the same continue runs on to the opener.
  continueGame(control, "week");
  assert.ok(control.calendar!.date > "2026-10-04");
  const restored = validateSave(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(restored.inboxState, g.inboxState);
  const legacy = JSON.parse(JSON.stringify(g));
  delete legacy.inboxState;
  assert.doesNotThrow(() => validateSave(legacy));
  advanceDay(ensureManagementState(validateSave(legacy)));
  assert.throws(
    () => validateSave({ ...JSON.parse(JSON.stringify(g)), inboxState: [] }),
    /inbox state/,
  );
});

test("routine and league-wide messages are not important", () => {
  const g = season();
  const base = {
    id: "x",
    date: "2026-11-20",
    read: false,
    resolved: false,
    title: "",
    body: "",
  };
  assert.equal(
    isImportantEvent(g, {
      ...base,
      category: "game",
      priority: "normal",
      teamId: g.user,
    }),
    false,
  );
  assert.equal(
    isImportantEvent(g, { ...base, category: "trade", priority: "high" }),
    false,
  );
  assert.equal(
    isImportantEvent(g, {
      ...base,
      category: "contract",
      priority: "high",
      teamId: "EDM",
    }),
    false,
  );
  assert.equal(
    isImportantEvent(g, { ...base, category: "league", priority: "critical" }),
    true,
  );
  assert.equal(
    isImportantEvent(g, {
      ...base,
      category: "trade",
      priority: "high",
      requiresResponse: true,
    }),
    true,
  );
});
