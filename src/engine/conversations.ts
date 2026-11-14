import { clamp } from "./random";
import type { Game, Player } from "./types";

export type ConversationTopic = "role" | "form" | "contract" | "development";
export type ConversationTone = "supportive" | "direct" | "challenge";

export function playerConcerns(player: Player) {
  const concerns: string[] = [];
  if (player.morale < 55) concerns.push("низкая мораль");
  if ((player.performanceForm ?? 0) < -15) concerns.push("плохая форма");
  if (player.years <= 1) concerns.push("истекающий контракт");
  if (player.injury > 0) concerns.push("восстановление после травмы");
  return concerns.length ? concerns : ["серьёзных проблем нет"];
}

export function talkToPlayer(
  game: Game,
  playerId: string,
  topic: ConversationTopic,
  tone: ConversationTone,
) {
  const player = game.teams
    .flatMap((t) => [...t.players, ...(t.farm ?? []), ...(t.prospects ?? [])])
    .find((p) => p.id === playerId);
  if (!player) throw Error("Player unavailable");
  if (player.lastConversationRound === game.round)
    throw Error("С этим игроком уже говорили в текущем туре");

  const relationship = player.relationship ?? 50;
  const resilience = player.attributes.resilience ?? 70;
  const form = player.performanceForm ?? 0;
  let fit = 0;
  if (tone === "supportive") fit = player.morale < 70 || player.injury ? 16 : 7;
  if (tone === "direct")
    fit = (player.attributes.composure ?? 70) >= 72 ? 12 : -3;
  if (tone === "challenge") fit = resilience >= 78 ? 15 : -12;
  if (topic === "form") fit += form < 0 ? 8 : -2;
  if (topic === "contract") fit += player.years <= 1 ? 9 : -5;
  if (topic === "development") fit += player.age <= 25 ? 8 : 1;
  const outcome =
    relationship + fit >= 55
      ? "positive"
      : relationship + fit >= 42
        ? "neutral"
        : "negative";
  const moraleDelta =
    outcome === "positive"
      ? tone === "supportive"
        ? 5
        : 3
      : outcome === "neutral"
        ? 0
        : -5;
  const relationshipDelta =
    outcome === "positive" ? 4 : outcome === "neutral" ? 1 : -6;
  const motivationDelta =
    outcome === "positive"
      ? tone === "challenge"
        ? 8
        : 5
      : outcome === "neutral"
        ? 1
        : -7;
  const response =
    outcome === "positive"
      ? `Спасибо за честный разговор. Я понимаю свою задачу и постараюсь ответить игрой.`
      : outcome === "neutral"
        ? `Я услышал вашу позицию. Посмотрим, как всё сложится на льду.`
        : `Мне не понравился этот подход. Сейчас это только добавляет давления.`;
  player.morale = clamp(player.morale + moraleDelta, 20, 100);
  player.relationship = clamp(relationship + relationshipDelta, 0, 100);
  player.motivation = clamp(
    (player.motivation ?? 50) + motivationDelta,
    0,
    100,
  );
  player.lastConversationRound = game.round;
  (player.conversationHistory ??= []).unshift({
    year: game.year,
    round: game.round,
    topic,
    tone,
    response,
    moraleDelta,
    relationshipDelta,
  });
  player.conversationHistory = player.conversationHistory.slice(0, 20);
  game.news.unshift(`${player.name}: ${response}`);
  return { response, outcome, moraleDelta, relationshipDelta, motivationDelta };
}
