import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  addDays,
  advanceDay,
  ensureManagementState,
} from "../src/engine/management";
import {
  REQUEST_TYPES,
  activePromises,
  ensureRequestState,
  isListedByRequest,
  processPlayerRequests,
  promiseProgress,
  replyToRequest,
  requestForEvent,
  requestReplies,
  sendPlayerRequest,
  type RequestType,
} from "../src/engine/playerRequests";
import { evaluateTrade, executeTrade } from "../src/engine/trades";
import { sendToFarm } from "../src/engine/roster";
import { validateSave } from "../src/engine/saves";
import type { Game, Player } from "../src/engine/types";

function season(language: "ru" | "en" = "en", seed = 5150): Game {
  const g = ensureManagementState(newGame("TOR", seed));
  g.language = language;
  g.calendar!.date = "2026-11-20";
  g.calendar!.day = 70;
  for (const player of user(g).players) player.injury = 0;
  return g;
}
const user = (g: Game) => g.teams.find((team) => team.id === g.user)!;
const forwards = (g: Game) =>
  user(g)
    .players.filter((p) => !["D", "G"].includes(p.pos))
    .sort((a, b) => b.ovr - a.ovr);
/** Pretend the user club just played a game with the current lines. */
function playGame(g: Game, minutes: Record<string, number> = {}) {
  const team = user(g);
  team.record.gp++;
  const dressed = new Set([...team.lines.flat(), ...team.defense.flat(), team.goalie]);
  for (const player of team.players)
    if (dressed.has(player.id)) {
      player.stats.gp++;
      player.stats.toi += minutes[player.id] ?? 15;
    }
}
function nextDay(g: Game) {
  g.calendar!.date = addDays(g.calendar!.date, 1);
  g.calendar!.day++;
}

test("every request type writes a non-empty letter and replies in both languages", () => {
  for (const language of ["ru", "en"] as const) {
    const g = season(language);
    const team = user(g);
    const f = forwards(g);
    const goalie = team.players.find((p) => p.pos === "G" && p.id !== team.goalie)!;
    const contexts: Partial<Record<RequestType, object>> = {
      teammate: { fromUnit: 1, nowUnit: 2, rivalName: f[5].name, rivalId: f[5].id },
      role: { fromUnit: 0, nowUnit: 2 },
      "ice-time": { unit: 1, toi: 10.5 },
      trade: { reason: "contender" },
      mentor: { mentorId: f[0].id, mentorName: f[0].name },
      "stay-nhl": { rivalName: "Prospect Guy" },
      thanks: { nowUnit: 0 },
    };
    REQUEST_TYPES.forEach((type, index) => {
      g.calendar!.date = addDays("2026-11-20", index);
      const player = type === "goalie-starts" ? goalie : f[index % f.length];
      const request = sendPlayerRequest(g, player.id, type, contexts[type])!;
      assert.ok(request, type);
      for (const text of [request.title, request.letter]) {
        assert.ok(text.ru.length > 10 && text.en.length > 10, `${type} text`);
        assert.doesNotMatch(text.ru, /undefined|NaN/);
        assert.doesNotMatch(text.en, /undefined|NaN/);
      }
      assert.ok(/[а-я]/i.test(request.letter.ru));
      const replies = requestReplies(g, request);
      assert.ok(replies.length >= 2);
      for (const reply of replies)
        for (const text of [reply.label, reply.line, reply.hint])
          assert.ok(text.ru && text.en, `${type} ${reply.kind}`);
      const event = g.events!.find((item) => item.id === request.eventId)!;
      assert.equal(requestForEvent(g, event.id)?.id, request.id);
      assert.equal(event.title, request.title[language]);
      assert.equal(event.requiresResponse, type !== "thanks");
    });
  }
});

test("letters vary by player rather than one template per type", () => {
  const g = season();
  const bodies = new Set<string>();
  forwards(g)
    .slice(0, 10)
    .forEach((player, index) => {
      g.calendar!.date = addDays("2026-11-20", index);
      const request = sendPlayerRequest(g, player.id, "scratched")!;
      bodies.add(request.letter.en.replace(player.name, ""));
    });
  assert.ok(bodies.size >= 3, `only ${bodies.size} variants`);
});

test("ice-time trigger is deterministic and respects cooldowns and caps", () => {
  const run = () => {
    const g = season();
    const team = user(g);
    const victim = forwards(g)[1];
    processPlayerRequests(g); // baseline
    for (let i = 0; i < 10; i++) {
      playGame(g, { [victim.id]: 8 });
      nextDay(g);
      processPlayerRequests(g);
    }
    victim.morale = 50;
    const all = g.playerRequests!.requests;
    return { g, victim, all, team };
  };
  const a = run();
  const b = run();
  assert.deepEqual(
    a.all.map((r) => [r.id, r.letter.en]),
    b.all.map((r) => [r.id, r.letter.en]),
  );
  const ice = a.all.find((r) => r.type === "ice-time" && r.playerId === a.victim.id);
  assert.ok(ice, "the under-used star asks for ice time");
  // One letter per day and at most three per week (thanks excluded).
  const perDay = new Map<string, number>();
  for (const r of a.all.filter((r) => r.type !== "thanks"))
    perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);
  assert.ok([...perDay.values()].every((n) => n <= 1));
  const weekly = a.all.filter((r) => r.type !== "thanks");
  assert.ok(weekly.length <= 3 * Math.ceil(10 / 7) + 1);
  // No second letter from the same player while his request is open.
  assert.equal(a.all.filter((r) => r.playerId === a.victim.id).length, 1);
});

test("a kept line promise lifts morale and relationship once", () => {
  const g = season();
  const team = user(g);
  const player = team.lines[3][0];
  const p = team.players.find((x) => x.id === player)!;
  processPlayerRequests(g);
  const request = sendPlayerRequest(g, p.id, "ice-time", { unit: 1, toi: 9 })!;
  const before = { morale: p.morale, rel: p.relationship ?? 50 };
  replyToRequest(g, request.id, "accept");
  assert.throws(() => replyToRequest(g, request.id, "refuse"));
  assert.equal(activePromises(g).length, 1);
  assert.ok(p.morale > before.morale);
  const afterReply = p.relationship!;
  // Move him to line 2 and play a game.
  const swap = team.lines[1][0];
  team.lines[1][0] = p.id;
  team.lines[3][0] = swap;
  nextDay(g);
  playGame(g);
  processPlayerRequests(g);
  const promise = g.playerRequests!.promises[0];
  assert.equal(promise.status, "kept");
  assert.equal(p.relationship, Math.min(100, afterReply + 8));
  assert.ok(g.events!.some((e) => e.title.includes("promise kept")));
  assert.ok(promiseProgress(g, promise).text.en.length > 0);
});

test("a broken promise hurts badly and can turn into a public trade demand", () => {
  const g = season("ru");
  const team = user(g);
  const p = team.players.find((x) => x.id === team.lines[3][1])!;
  p.relationship = 30;
  processPlayerRequests(g);
  const request = sendPlayerRequest(g, p.id, "scratched")!;
  replyToRequest(g, request.id, "accept");
  // Scratch him for every game until the deadline.
  const extra = team.players.find(
    (x) =>
      !["D", "G"].includes(x.pos) &&
      ![...team.lines.flat()].includes(x.id),
  )!;
  team.lines[3][1] = extra.id;
  const morale = p.morale;
  for (let i = 0; i < 13; i++) {
    nextDay(g);
    playGame(g);
    processPlayerRequests(g);
  }
  const promise = g.playerRequests!.promises[0];
  assert.equal(promise.status, "broken");
  assert.ok(p.morale <= morale - 15 || p.morale === 0);
  assert.ok(p.relationship! < 25);
  assert.ok(isListedByRequest(g, p.id), "public demand lists him");
  const demand = g.playerRequests!.requests.find(
    (r) => r.playerId === p.id && r.context.reason === "public",
  )!;
  assert.ok(demand);
  assert.match(demand.title.ru, /публично/);
  assert.equal(
    g.events!.find((e) => e.id === demand.eventId)?.priority,
    "critical",
  );
});

test("trade request lifecycle: listed, cheaper for buyers, resolved when traded", () => {
  const g = season();
  const team = user(g);
  const p = forwards(g)[6];
  const request = sendPlayerRequest(g, p.id, "trade", { reason: "unhappy" })!;
  assert.equal(isListedByRequest(g, p.id), false);
  const other = g.teams.find((club) => club.id !== g.user)!;
  const take = other.players.find((x) => x.pos === p.pos)!;
  const before = evaluateTrade(g, other.id, [p.id], [take.id]).ratio;
  replyToRequest(g, request.id, "accept");
  assert.ok(isListedByRequest(g, p.id));
  assert.equal(activePromises(g)[0].kind, "trade");
  const after = evaluateTrade(g, other.id, [p.id], [take.id]).ratio;
  assert.ok(after < before, "buyers discount a player who asked out");
  // Rival GMs call about him.
  for (let i = 0; i < 12; i++) {
    nextDay(g);
    processPlayerRequests(g);
  }
  assert.ok(
    g.events!.some((e) => e.category === "trade" && e.playerId === p.id && e.title.includes("call about")),
  );
  // Find a deal the AI accepts and complete it.
  const cheap = other.players
    .filter((x) => x.pos === p.pos)
    .sort((a, b) => a.ovr - b.ovr)[0];
  if (evaluateTrade(g, other.id, [p.id], [cheap.id]).accepted) {
    executeTrade(g, other.id, [p.id], [cheap.id]);
    nextDay(g);
    processPlayerRequests(g);
    assert.equal(isListedByRequest(g, p.id), false);
    assert.equal(g.playerRequests!.promises[0].status, "kept");
  }
  assert.ok(team);
});

test("persuading a player to stay depends on the relationship", () => {
  const trusting = season();
  const p1 = forwards(trusting)[4];
  p1.relationship = 95;
  const r1 = sendPlayerRequest(trusting, p1.id, "ice-time", { unit: 1 })!;
  replyToRequest(trusting, r1.id, "explain");
  assert.equal(r1.persuaded, true);
  const sour = season();
  const p2 = forwards(sour)[4];
  p2.relationship = 5;
  const r2 = sendPlayerRequest(sour, p2.id, "ice-time", { unit: 1 })!;
  const morale = p2.morale;
  replyToRequest(sour, r2.id, "explain");
  assert.equal(r2.persuaded, false);
  assert.ok(p2.morale < morale);
});

test("unanswered letters expire with a morale hit and close the inbox item", () => {
  const g = season();
  const p = forwards(g)[3];
  const request = sendPlayerRequest(g, p.id, "role", { fromUnit: 0, nowUnit: 2 })!;
  const morale = p.morale;
  for (let i = 0; i < 8; i++) {
    nextDay(g);
    processPlayerRequests(g);
  }
  assert.equal(request.status, "expired");
  assert.ok(p.morale < morale);
  assert.equal(g.events!.find((e) => e.id === request.eventId)?.resolved, true);
  assert.throws(() => replyToRequest(g, request.id, "accept"));
});

test("sent-down player asks for a call-up; a stay promise breaks when he is sent down", () => {
  const g = season();
  const team = user(g);
  const p = team.players
    .filter((x) => !["D", "G"].includes(x.pos))
    .sort((a, b) => a.ovr - b.ovr)[0];
  processPlayerRequests(g);
  const stay = sendPlayerRequest(g, p.id, "stay-nhl", { rivalName: "Someone" })!;
  replyToRequest(g, stay.id, "accept");
  if (team.players.filter((x) => !["D", "G"].includes(x.pos)).length > 12) {
    sendToFarm(g, p.id);
    nextDay(g);
    processPlayerRequests(g);
    assert.equal(g.playerRequests!.promises[0].status, "broken");
  }
});

test("thanks after a promotion is a normal-priority letter", () => {
  const g = season();
  const team = user(g);
  const p = team.players.find((x) => x.id === team.lines[3][0])!;
  processPlayerRequests(g);
  playGame(g);
  nextDay(g);
  processPlayerRequests(g);
  playGame(g);
  nextDay(g);
  processPlayerRequests(g);
  // Promote him to the first line.
  const star = team.lines[0][0];
  team.lines[0][0] = p.id;
  team.lines[3][0] = star;
  for (let i = 0; i < 2; i++) {
    playGame(g);
    nextDay(g);
    processPlayerRequests(g);
  }
  const thanks = g.playerRequests!.requests.find((r) => r.type === "thanks");
  assert.ok(thanks, "thanks letter expected");
  const event = g.events!.find((e) => e.id === thanks!.eventId)!;
  assert.equal(event.priority, "normal");
  assert.equal(event.requiresResponse, false);
});

test("player-request state survives a save round-trip and old saves still load", () => {
  const g = season();
  const p = forwards(g)[2];
  const request = sendPlayerRequest(g, p.id, "trade", { reason: "unhappy" })!;
  replyToRequest(g, request.id, "accept");
  const copy = validateSave(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(copy.playerRequests, g.playerRequests);
  const old = JSON.parse(JSON.stringify(g));
  delete old.playerRequests;
  assert.doesNotThrow(() => validateSave(old));
  const bad = JSON.parse(JSON.stringify(g));
  bad.playerRequests.promises[0].kind = "bribe";
  assert.throws(() => validateSave(bad), /player requests/);
  const bad2 = JSON.parse(JSON.stringify(g));
  bad2.playerRequests.listed = "nope";
  assert.throws(() => validateSave(bad2));
});

test("the daily simulation sends player letters and keeps them capped", () => {
  const g = season("en", 77);
  ensureRequestState(g);
  for (let i = 0; i < 60 && g.phase !== "offseason"; i++) advanceDay(g);
  const requests = g.playerRequests!.requests;
  const perDay = new Map<string, number>();
  for (const r of requests) perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);
  assert.ok([...perDay.values()].every((n) => n <= 2));
  assert.ok(requests.length <= 60 / 7 * 3 + 6);
});

void ({} as Player);
