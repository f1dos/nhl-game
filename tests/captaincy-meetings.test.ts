import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { ensureManagementState } from "../src/engine/management";
import {
  answerEvent,
  applyLeadershipChoice,
  captainCandidates,
  evaluateLeadershipChoice,
  incumbentGroup,
  roomPreferredGroup,
} from "../src/engine/leadership";
import {
  MEETING_COOLDOWN_DAYS,
  holdTeamMeeting,
  meetingContext,
} from "../src/engine/teamMeetings";
import { addDays } from "../src/engine/management";
import { validateSave } from "../src/engine/saves";
import type { Game } from "../src/engine/types";

const user = (g: Game) => g.teams.find((team) => team.id === g.user)!;
const avgMorale = (g: Game) =>
  user(g).players.reduce((sum, player) => sum + player.morale, 0) /
  user(g).players.length;

function career(team = "PIT", seed = 9001, language: "ru" | "en" = "en") {
  const g = ensureManagementState(newGame(team, seed));
  g.language = language;
  return g;
}

/** The worst possible captain: youngest, newest, deepest skater. */
function terribleCaptain(g: Game) {
  const candidates = captainCandidates(g);
  const worst = candidates.at(-1)!;
  worst.player.age = 20;
  g.clubTenure![worst.player.id] = g.year;
  return worst.player.id;
}

test("the room ranks the real-world captain first at career start", () => {
  const g = career("PIT");
  const incumbent = incumbentGroup(g);
  const crosby = user(g).players.find((p) => p.name === "Sidney Crosby");
  assert.ok(crosby, "Crosby is on the Penguins roster");
  assert.equal(incumbent.captainId, crosby!.id);
  const candidates = captainCandidates(g);
  assert.ok(candidates.every((item) => item.player.pos !== "G"));
  assert.equal(candidates[0].role, "C");
  assert.equal(roomPreferredGroup(candidates).length, 3);
});

test("a terrible captaincy choice upsets the room and the stripped captain writes once", () => {
  const g = career("PIT", 9001);
  const before = avgMorale(g);
  const preferred = roomPreferredGroup(captainCandidates(g));
  const formerId = incumbentGroup(g).captainId!;
  const pick = terribleCaptain(g);
  const alternates = captainCandidates(g)
    .filter((item) => item.player.id !== pick && item.player.id !== formerId)
    .slice(-2)
    .map((item) => item.player.id);
  const former = user(g).players.find((p) => p.id === formerId)!;
  const formerMorale = former.morale;
  const confidence = g.managerEmployment!.confidence;

  const preview = evaluateLeadershipChoice(g, pick, alternates);
  assert.ok(preview.approval < 30, `approval ${preview.approval}`);
  assert.equal(preview.verdict, "revolt");
  assert.equal(preview.stripped?.player.id, formerId);
  assert.ok(preview.reasons.length >= 3);
  assert.notEqual(preview.preferred[0], pick);
  assert.ok(preferred.includes(formerId));

  const result = applyLeadershipChoice(g, pick, alternates);
  assert.equal(result.applied, true);
  assert.ok(avgMorale(g) <= before - 5, "squad morale drops");
  assert.ok(former.morale <= formerMorale - 12, "the stripped captain takes it worst");
  assert.ok(g.managerEmployment!.confidence < confidence);
  const letters = g.events!.filter((e) => e.kind === "captaincy-letter");
  assert.equal(letters.length, 1);
  const letter = letters[0];
  assert.equal(letter.playerId, formerId);
  assert.equal(letter.priority, "high");
  assert.equal(letter.requiresResponse, true);
  assert.match(letter.title, /Why\?/);
  assert.deepEqual(
    letter.replies!.map((reply) => reply.id),
    ["explain", "apologise", "stand-firm"],
  );

  // Saving the same group again changes nothing and sends nothing.
  const morale = avgMorale(g);
  const again = applyLeadershipChoice(g, pick, [...alternates].reverse());
  assert.equal(again.applied, false);
  assert.equal(avgMorale(g), morale);
  assert.equal(g.events!.filter((e) => e.kind === "captaincy-letter").length, 1);
  assert.equal(g.leadershipLog!.length, 1);
});

test("standing firm after a terrible choice leads to a trade request; replies apply once", () => {
  const g = career("PIT", 9002);
  const formerId = incumbentGroup(g).captainId!;
  const pick = terribleCaptain(g);
  const alternates = captainCandidates(g)
    .filter((item) => ![pick, formerId].includes(item.player.id))
    .slice(-2)
    .map((item) => item.player.id);
  const { letterEventId } = applyLeadershipChoice(g, pick, alternates);
  const former = user(g).players.find((p) => p.id === formerId)!;
  const morale = former.morale;
  const relationship = former.relationship ?? 50;
  const outcome = answerEvent(g, letterEventId!, "stand-firm");
  assert.ok(outcome);
  assert.equal(former.morale, Math.max(0, morale - 5));
  assert.equal(former.relationship, Math.max(0, relationship - 7));
  assert.deepEqual(former.tradeRequest, { year: g.year, reason: "captaincy" });
  const letter = g.events!.find((e) => e.id === letterEventId)!;
  assert.equal(letter.resolved, true);
  assert.equal(letter.replyId, "stand-firm");
  // A second answer is ignored.
  assert.equal(answerEvent(g, letterEventId!, "apologise"), undefined);
  assert.equal(former.morale, Math.max(0, morale - 5));
  assert.equal(letter.replyId, "stand-firm");
});

test("apologising softens the former captain but the new captain feels undermined", () => {
  const g = career("PIT", 9003, "ru");
  const formerId = incumbentGroup(g).captainId!;
  const [, second, third, fourth] = captainCandidates(g).map(
    (item) => item.player.id,
  );
  // A defensible change: the room's #2 gets the C, the old captain keeps an A.
  const { letterEventId, evaluation } = applyLeadershipChoice(g, second, [
    formerId,
    third,
  ]);
  assert.ok(fourth);
  assert.equal(evaluation!.stripped?.demotedTo, "A");
  const letter = g.events!.find((e) => e.id === letterEventId)!;
  assert.match(letter.title, /Почему\?/);
  const former = user(g).players.find((p) => p.id === formerId)!;
  const captain = user(g).players.find((p) => p.id === second)!;
  const [m, r, cr] = [former.morale, former.relationship ?? 50, captain.relationship ?? 50];
  answerEvent(g, letterEventId!, "apologise");
  assert.equal(former.morale, Math.min(100, m + 5));
  assert.equal(former.relationship, Math.min(100, r + 6));
  assert.equal(captain.relationship, Math.max(0, cr - 3));
  assert.equal(former.tradeRequest, undefined);
});

test("naming the room's own group gives a small boost and no letter", () => {
  const g = career("PIT", 9004);
  const before = avgMorale(g);
  const [captain, a1, a2] = roomPreferredGroup(captainCandidates(g));
  const preview = evaluateLeadershipChoice(g, captain, [a1, a2]);
  assert.ok(preview.approval >= 80, `approval ${preview.approval}`);
  assert.equal(preview.verdict, "united");
  applyLeadershipChoice(g, captain, [a1, a2]);
  assert.ok(avgMorale(g) > before);
  assert.equal(g.events!.filter((e) => e.kind === "captaincy-letter").length, 0);
});

// --- team meetings ---------------------------------------------------------

function inSeason(seed = 4040) {
  const g = career("TOR", seed);
  g.calendar!.date = "2026-11-20";
  user(g).record.gp = 20;
  return g;
}

test("meeting outcomes depend on the situation and tone", () => {
  const losing = inSeason(4041);
  user(losing).record.form = ["L", "L", "L", "L", "L"];
  const good = holdTeamMeeting(losing, {
    topic: "losing-streak",
    tone: "supportive",
  });
  assert.equal(good.record.outcome, "positive");
  assert.ok(good.record.reactions!.length >= 2);
  assert.ok(good.record.reactions!.every((r) => r.ru && r.en));

  const praiseAfterLosses = inSeason(4041);
  user(praiseAfterLosses).record.form = ["L", "L", "L", "L", "L"];
  const before = avgMorale(praiseAfterLosses);
  const bad = holdTeamMeeting(praiseAfterLosses, {
    topic: "praise",
    tone: "furious",
  });
  assert.equal(bad.record.outcome, "negative");
  assert.ok(avgMorale(praiseAfterLosses) < before);
  assert.ok(
    bad.record.reactions!.some((r) => ["unconvinced", "angry"].includes(r.reaction)),
  );

  const winning = inSeason(4041);
  user(winning).record.form = ["W", "W", "W", "W", "W"];
  const praise = holdTeamMeeting(winning, { topic: "praise", tone: "calm" });
  assert.equal(praise.record.outcome, "positive");
});

test("meetings have a cooldown and repeated meetings lose effect", () => {
  const g = inSeason(4042);
  user(g).record.form = ["L", "L", "L", "L", "L"];
  const first = holdTeamMeeting(g, {
    topic: "losing-streak",
    tone: "supportive",
  });
  assert.equal(meetingContext(g).onCooldown, true);
  assert.throws(
    () => holdTeamMeeting(g, { topic: "losing-streak", tone: "supportive" }),
    /cooldown/,
  );
  g.calendar!.date = addDays(g.calendar!.date, MEETING_COOLDOWN_DAYS);
  assert.equal(meetingContext(g).onCooldown, false);
  const second = holdTeamMeeting(g, {
    topic: "losing-streak",
    tone: "supportive",
  });
  assert.ok(second.record.score! < first.record.score!);
  assert.ok(second.repetition < 1);
  assert.equal(g.teamMeetings!.length, 2);
});

test("meetings are deterministic and backing a struggling player helps him", () => {
  const run = () => {
    const g = inSeason(4043);
    const target = user(g).players.find((p) => p.pos !== "G")!;
    target.performanceForm = -25;
    const morale = target.morale;
    const result = holdTeamMeeting(g, {
      topic: "back-player",
      tone: "supportive",
      targetPlayerId: target.id,
    });
    return { result, gain: target.morale - morale, morale: avgMorale(g) };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.result.record, b.result.record);
  assert.equal(a.morale, b.morale);
  assert.ok(a.gain >= 5);
});

test("leadership and meeting state survives a save round-trip; old saves load", () => {
  const g = career("PIT", 9005);
  const formerId = incumbentGroup(g).captainId!;
  const pick = terribleCaptain(g);
  const alternates = captainCandidates(g)
    .filter((item) => ![pick, formerId].includes(item.player.id))
    .slice(0, 2)
    .map((item) => item.player.id);
  const { letterEventId } = applyLeadershipChoice(g, pick, alternates);
  answerEvent(g, letterEventId!, "explain");
  g.calendar!.date = "2026-11-20";
  holdTeamMeeting(g, { topic: "expectations", tone: "calm" });
  const loaded = validateSave(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(loaded.leadershipLog, g.leadershipLog);
  assert.deepEqual(loaded.teamMeetings, g.teamMeetings);
  assert.equal(
    loaded.events!.find((e) => e.id === letterEventId)!.replyId,
    "explain",
  );

  const legacy = JSON.parse(JSON.stringify(g));
  delete legacy.leadershipLog;
  delete legacy.clubTenure;
  legacy.teamMeetings = [
    {
      date: "2026-09-20",
      reason: "preseason",
      tone: "calm",
      leaderId: pick,
      outcome: "positive",
      message: "ok",
    },
  ];
  for (const event of legacy.events) {
    delete event.replies;
    delete event.replyId;
    delete event.kind;
  }
  assert.doesNotThrow(() => validateSave(legacy));

  const broken = JSON.parse(JSON.stringify(g));
  broken.teamMeetings[0].tone = "shouting";
  assert.throws(() => validateSave(broken), /team meetings/);
  const badReply = JSON.parse(JSON.stringify(g));
  badReply.events.find((e: { id: string }) => e.id === letterEventId).replyId =
    "nope";
  assert.throws(() => validateSave(badReply), /replies/);
});
