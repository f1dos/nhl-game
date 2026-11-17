import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { advance } from "../src/engine/season";
import {
  CONVERSATION_TONES,
  CONVERSATION_TOPICS,
  MAX_EXCHANGES,
  concludeConversation,
  continueConversation,
  conversationEffects,
  conversationEntryText,
  conversationFollowUps,
  conversationOptions,
  openConversation,
  playerConcerns,
  type ConversationState,
  type ConversationTone,
  type ConversationTopic,
} from "../src/engine/conversations";
import {
  answerPressQuestion,
  buildPressConference,
  pressAppearanceText,
  pressConferenceComplete,
  pressConferenceTotals,
} from "../src/engine/press";
import type { Game } from "../src/engine/types";

const CYRILLIC = /[А-Яа-яЁё]/;
const topics = Object.keys(CONVERSATION_TOPICS) as ConversationTopic[];
const tones = Object.keys(CONVERSATION_TONES) as ConversationTone[];

const assertBilingual = (text: { ru: string; en: string }, where: string) => {
  assert.ok(text.ru.trim().length > 0, `${where}: empty ru`);
  assert.ok(text.en.trim().length > 0, `${where}: empty en`);
  assert.match(text.ru, CYRILLIC, `${where}: ru without Cyrillic`);
  assert.doesNotMatch(text.en, CYRILLIC, `${where}: Cyrillic in en: ${text.en}`);
  assert.doesNotMatch(text.ru + text.en, /undefined|NaN|\[object/, where);
};

/** Plays a meeting to the end, always picking the n-th follow-up. */
function playOut(game: Game, state: ConversationState, pick = 0) {
  let current = state;
  while (!current.finished) {
    const options = conversationFollowUps(game, current);
    assert.ok(options.length >= 2, "at least two follow-ups");
    current = continueConversation(
      game,
      current,
      options[Math.min(pick, options.length - 1)].kind,
    );
  }
  return current;
}

test("player meetings are multi-turn, pure until concluded, and apply effects once", () => {
  const g = newGame("TOR", 901);
  const p = g.teams.find((t) => t.id === "TOR")!.players[0];
  const snapshot = JSON.stringify(g);
  const opened = openConversation(g, p.id, "role", "calm");
  assert.equal(opened.turns.length, 2);
  assert.deepEqual(
    opened.turns.map((turn) => turn.speaker),
    ["manager", "player"],
  );
  const finished = playOut(g, opened);
  assert.ok(finished.exchanges >= 2 && finished.exchanges <= MAX_EXCHANGES);
  assert.equal(finished.turns.length, finished.exchanges * 2);
  assert.equal(JSON.stringify(g), snapshot, "open/continue must not mutate");
  // Deterministic: replaying the same choices yields the same transcript.
  assert.deepEqual(playOut(g, openConversation(g, p.id, "role", "calm")), finished);

  const before = {
    morale: p.morale,
    relationship: p.relationship ?? 50,
    motivation: p.motivation ?? 50,
  };
  const effects = conversationEffects(finished);
  const result = concludeConversation(g, finished);
  assert.deepEqual(
    [result.moraleDelta, result.relationshipDelta, result.motivationDelta],
    [effects.moraleDelta, effects.relationshipDelta, effects.motivationDelta],
  );
  const clampTo = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));
  assert.equal(p.morale, clampTo(before.morale + effects.moraleDelta, 20, 100));
  assert.equal(
    p.relationship,
    clampTo(before.relationship + effects.relationshipDelta, 0, 100),
  );
  assert.equal(
    p.motivation,
    clampTo(before.motivation + effects.motivationDelta, 0, 100),
  );
  const after = [p.morale, p.relationship, p.motivation];
  assert.throws(() => concludeConversation(g, finished), /уже говорили/);
  assert.deepEqual([p.morale, p.relationship, p.motivation], after);
  assert.equal(p.conversationHistory?.length, 1);
  const entry = p.conversationHistory![0];
  assert.equal(entry.transcript?.length, finished.turns.length);
  assert.equal(entry.exchanges, finished.exchanges);
  assertBilingual(entry.summary!, "summary");
});

test("follow-up choices depend on the player's mood and the conversation branches", () => {
  const g = newGame("EDM", 77);
  const team = g.teams.find((t) => t.id === "EDM")!;
  const transcripts = new Set<string>();
  const moods = new Set<string>();
  for (const player of team.players.slice(0, 12))
    for (const tone of ["supportive", "demanding", "challenge"] as const) {
      const opened = openConversation(g, player.id, "ice-time", tone);
      moods.add(opened.mood);
      const kinds = conversationFollowUps(g, opened).map((o) => o.kind);
      if (opened.mood === "negative") assert.ok(kinds.includes("listen"));
      if (opened.mood === "positive") assert.ok(kinds.includes("raise-bar"));
      for (const pick of [0, 1, 2])
        transcripts.add(
          playOut(g, opened, pick)
            .turns.map((turn) => turn.text.en)
            .join("|"),
        );
    }
  assert.ok(moods.size >= 2, `moods seen: ${[...moods]}`);
  assert.ok(transcripts.size >= 40, `distinct transcripts: ${transcripts.size}`);
});

test("player replies reflect who the player is, not one stock phrase", () => {
  const g = newGame("TOR", 13);
  const team = g.teams.find((t) => t.id === "TOR")!;
  const young = team.players.find((p) => p.age <= 22) ?? team.players[0];
  const veteran = [...team.players].sort((a, b) => b.age - a.age)[0];
  const unhappy = team.players[3];
  unhappy.morale = 30;
  unhappy.motivation = 25;
  unhappy.relationship = 20;
  const happy = team.players[4];
  happy.morale = 95;
  happy.motivation = 90;
  happy.relationship = 90;
  const reply = (id: string, topic: ConversationTopic, tone: ConversationTone) =>
    openConversation(g, id, topic, tone).turns[1];
  assert.notEqual(
    reply(unhappy.id, "morale", "direct").mood,
    reply(happy.id, "morale", "direct").mood,
  );
  const replies = new Set(
    team.players.map((p) => reply(p.id, "form", "calm").text.en),
  );
  assert.ok(replies.size >= team.players.length * 0.6, `${replies.size}`);
  assert.notEqual(
    reply(young.id, "development", "supportive").text.en,
    reply(veteran.id, "development", "supportive").text.en,
  );
});

test("every conversation line exists in Russian and English", () => {
  const g = newGame("MTL", 5);
  const team = g.teams.find((t) => t.id === "MTL")!;
  const injured = team.players[2];
  injured.injury = 6;
  for (const player of team.players.slice(0, 8)) {
    for (const concern of [
      playerConcerns(player, "ru"),
      playerConcerns(player, "en"),
    ])
      assert.ok(concern.length > 0);
    assert.doesNotMatch(playerConcerns(player, "en").join(" "), CYRILLIC);
    for (const topic of topics) {
      for (const option of conversationOptions(topic, player, g)) {
        assertBilingual(option.label, `${topic} option label`);
        assertBilingual(option.text, `${topic}/${option.tone} option`);
      }
      for (const tone of tones) {
        const opened = openConversation(g, player.id, topic, tone);
        for (const pick of [0, 1, 3]) {
          const done = playOut(g, opened, pick);
          done.turns.forEach((turn, index) =>
            assertBilingual(turn.text, `${player.name} ${topic}/${tone} #${index}`),
          );
          for (const option of conversationFollowUps(g, opened)) {
            assertBilingual(option.line, `follow-up ${option.kind}`);
            assertBilingual(option.label, `follow-up label ${option.kind}`);
            assertBilingual(option.hint, `follow-up hint ${option.kind}`);
          }
        }
      }
    }
  }
});

test("old Russian-only conversation history still renders in both languages", () => {
  const legacy = {
    year: 2025,
    round: 4,
    topic: "form",
    tone: "supportive",
    managerLine: "Я вижу, как ты работаешь.",
    response: "Спасибо, тренер. Я постараюсь.",
    moraleDelta: 3,
    relationshipDelta: 2,
  } as never;
  for (const language of ["ru", "en"]) {
    const text = conversationEntryText(legacy, language);
    assert.equal(text.response, "Спасибо, тренер. Я постараюсь.");
    assert.equal(text.managerLine, "Я вижу, как ты работаешь.");
    assert.deepEqual(text.transcript, []);
  }
  assert.equal(conversationEntryText(legacy, "en").topic, "Current form");
  assert.equal(conversationEntryText(legacy, "ru").topic, "Текущая форма");
  const unknownTopic = conversationEntryText(
    { ...(legacy as object), topic: "старая тема", tone: "x" } as never,
    "en",
  );
  assert.equal(unknownTopic.topic, "старая тема");
});

test("English game stores English meeting text and news", () => {
  const g = newGame("TOR", 21);
  g.language = "en";
  const p = g.teams.find((t) => t.id === "TOR")!.players[1];
  const result = concludeConversation(
    g,
    playOut(g, openConversation(g, p.id, "contract", "direct"), 1),
  );
  assert.doesNotMatch(result.response, CYRILLIC);
  assert.doesNotMatch(p.conversationHistory![0].response, CYRILLIC);
  assert.doesNotMatch(g.news[0], CYRILLIC);
  const ru = conversationEntryText(p.conversationHistory![0], "ru");
  assert.match(ru.response, CYRILLIC);
  assert.ok(ru.transcript.every((line) => CYRILLIC.test(line.text)));
});

function playedGame(seed: number) {
  const g = newGame("TOR", seed);
  g.phase = "regular";
  for (let i = 0; i < 6; i++) advance(g);
  assert.ok(g.last, "a game was played");
  return g;
}

test("press conferences ask several context questions from different reporters", () => {
  const g = playedGame(31);
  const date = g.calendar?.date ?? "d";
  for (const type of ["pre-match", "post-match"] as const) {
    const conference = buildPressConference(g, type, date);
    assert.equal(conference.questions.length, type === "pre-match" ? 3 : 4);
    assert.equal(
      new Set(conference.questions.map((q) => q.journalist.id)).size,
      conference.questions.length,
    );
    assert.equal(
      new Set(conference.questions.map((q) => q.topic)).size,
      conference.questions.length,
    );
    for (const question of conference.questions) {
      assertBilingual(question.text, `${type} ${question.topic}`);
      assertBilingual(question.journalist.name, "journalist");
      assertBilingual(question.journalist.outlet, "outlet");
      assert.ok(question.answers.length >= 3 && question.answers.length <= 4);
      for (const answer of question.answers) {
        assertBilingual(answer.style, `${question.topic} style`);
        assertBilingual(answer.line, `${question.topic} line`);
        assertBilingual(answer.reaction, `${question.topic} reaction`);
      }
    }
    assert.deepEqual(buildPressConference(g, type, date), conference);
  }
  assert.equal(
    buildPressConference(g, "post-match", date).questions[0].topic,
    "result",
  );
  // Different situations lead to different questions.
  const topicsSeen = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6])
    for (const type of ["pre-match", "post-match"] as const)
      buildPressConference(playedGame(seed), type, "x").questions.forEach((q) =>
        topicsSeen.add(q.topic),
      );
  assert.ok(topicsSeen.size >= 6, [...topicsSeen].join(","));
});

test("press answers apply their consequences exactly once", () => {
  const g = playedGame(32);
  g.managerEmployment ??= { confidence: 50 } as never;
  const date = "2026-01-10";
  const conference = buildPressConference(g, "post-match", date);
  const team = g.teams.find((t) => t.id === g.user)!;
  const fans = g.fans?.[g.user];
  for (const question of conference.questions) {
    const answer = question.answers[question.answers.length - 1];
    const fanBefore = fans?.happiness ?? 0;
    const boardBefore: number = g.managerEmployment!.confidence;
    const morale = new Map(team.players.map((p) => [p.id, p.morale]));
    const entry = answerPressQuestion(g, conference, question.id, answer.id);
    assert.ok(entry);
    if (fans)
      assert.equal(
        fans.happiness,
        Math.max(0, Math.min(100, fanBefore + answer.fan)),
      );
    assert.equal(
      g.managerEmployment!.confidence,
      Math.max(0, Math.min(100, boardBefore + answer.board)),
    );
    for (const p of team.players) {
      const expected =
        answer.morale + (p.id === answer.playerId ? answer.playerMorale ?? 0 : 0);
      assert.equal(
        p.morale,
        Math.max(0, Math.min(100, morale.get(p.id)! + expected)),
      );
    }
    const snapshot = JSON.stringify(g);
    assert.equal(
      answerPressQuestion(g, conference, question.id, question.answers[0].id),
      undefined,
    );
    assert.equal(JSON.stringify(g), snapshot, "second answer is ignored");
    // Answering never reshuffles the remaining questions.
    assert.deepEqual(
      buildPressConference(g, "post-match", date).questions.map((q) => q.id),
      conference.questions.map((q) => q.id),
    );
  }
  assert.ok(pressConferenceComplete(g, conference));
  const totals = pressConferenceTotals(g, conference);
  assert.equal(
    totals.fan,
    conference.questions.reduce(
      (sum, q) => sum + q.answers[q.answers.length - 1].fan,
      0,
    ),
  );
  const stored = g.pressHistory![0];
  assert.match(pressAppearanceText(stored, "ru").headline, CYRILLIC);
  assert.doesNotMatch(pressAppearanceText(stored, "en").headline, CYRILLIC);
  assert.doesNotMatch(pressAppearanceText(stored, "en").question, CYRILLIC);
});

test("legacy single-answer press entries close the conference and still render", () => {
  const g = playedGame(33);
  const date = "2026-01-11";
  g.pressHistory = [
    {
      date,
      type: "pre-match",
      tone: "ambitious",
      headline: "Сегодня нам нужны два очка.",
      fanDelta: 2,
      boardDelta: 2,
      moraleDelta: -1,
    },
  ];
  const conference = buildPressConference(g, "pre-match", date);
  assert.ok(pressConferenceComplete(g, conference));
  assert.equal(
    answerPressQuestion(
      g,
      conference,
      conference.questions[0].id,
      conference.questions[0].answers[0].id,
    ),
    undefined,
  );
  const text = pressAppearanceText(g.pressHistory[0], "en");
  assert.equal(text.headline, "Сегодня нам нужны два очка.");
  assert.equal(text.style, "Ambitious");
});
