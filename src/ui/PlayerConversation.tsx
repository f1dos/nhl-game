import { useState } from "react";
import { ArrowLeft, CheckCircle2, MessageCircle, X } from "lucide-react";
import {
  CONVERSATION_TONES,
  CONVERSATION_TOPICS,
  conversationOptions,
  playerConcerns,
  talkToPlayer,
  externalContactEligibility,
  type ConversationTopic,
} from "../engine/conversations";
import type { Game, Player } from "../engine/types";

export default function PlayerConversation({
  player,
  game,
  edit,
  onClose,
}: {
  player: Player;
  game: Game;
  edit: (fn: (game: Game) => void) => void;
  onClose: () => void;
}) {
  const ru = game.language === "ru";
  const owner = game.teams.find((team) =>
    [...team.players, ...(team.farm ?? [])].some(
      (item) => item.id === player.id,
    ),
  );
  const external = owner && owner.id !== game.user;
  const eligibility = externalContactEligibility(game, player.id);
  const [externalReply, setExternalReply] = useState("");
  const [topic, setTopic] = useState<ConversationTopic>(
    player.injury > 0
      ? "injury"
      : player.years <= 1
        ? "contract"
        : (player.performanceForm ?? 0) < 0
          ? "form"
          : "role",
  );
  const [result, setResult] = useState<ReturnType<typeof talkToPlayer> | null>(
    null,
  );
  const [error, setError] = useState("");
  const completed = player.lastConversationRound === game.round || !!result;
  const history = player.conversationHistory ?? [];
  if (external)
    return (
      <div
        className="conversation-window external-contact"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <button className="icon-button" aria-label="Back" onClick={onClose}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <span className="eyebrow">OFFICIAL CONTACT · {owner.id}</span>
            <strong>Запрос по игроку другого клуба</strong>
          </div>
          <button
            className="icon-button"
            aria-label="Close conversation"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="external-contact-layout">
          <aside className="conversation-player">
            <div
              className={`conversation-photo ${player.headshot ? "has-photo" : ""}`}
            >
              {player.headshot ? (
                <img src={player.headshot} alt={player.name} />
              ) : (
                <span>{player.number}</span>
              )}
            </div>
            <h1>{player.name}</h1>
            <p>
              {owner.city} {owner.name} · {player.pos} · {player.ovr} OVR
            </p>
            <div className="conversation-vitals">
              <div>
                <span>Контракт</span>
                <b>{player.years}Y</b>
              </div>
              <div>
                <span>Мораль</span>
                <b>{player.morale}%</b>
              </div>
            </div>
          </aside>
          <main className="conversation-room">
            <span className="eyebrow">НЕ ЛИЧНАЯ ВСТРЕЧА</span>
            <h2>Контакт только через клуб и агента</h2>
            <p>
              Разговоры о роли, форме и игровом времени доступны только со
              своими хоккеистами. Обращение к игроку на контракте без разрешения
              клуба считается tampering.
            </p>
            <div
              className={`contact-permission ${eligibility.allowed ? "allowed" : "blocked"}`}
            >
              <b>
                {eligibility.allowed
                  ? "Официальный запрос разрешён"
                  : "Контакт недоступен"}
              </b>
              <span>{eligibility.reason}</span>
            </div>
            {eligibility.allowed && !externalReply && (
              <div className="dialogue-choices">
                <button
                  onClick={() =>
                    setExternalReply(
                      "Агент подтвердил: игрок готов выслушать спортивный проект, но клуб сначала требует согласовать компенсацию.",
                    )
                  }
                >
                  <span>Уточнить интерес игрока</span>
                  <p>
                    Передать агенту роль, срок и направление развития клуба.
                  </p>
                </button>
                <button
                  onClick={() =>
                    setExternalReply(
                      "GM клуба не дал разрешение на прямой разговор. Предложено начать с официального обмена.",
                    )
                  }
                >
                  <span>Запросить разрешение клуба</span>
                  <p>Официально связаться с GM команды-владельца.</p>
                </button>
              </div>
            )}
            {externalReply && (
              <section className="dialogue-result neutral">
                <div className="speech player">
                  <small>ОТВЕТ АГЕНТА / КЛУБА</small>
                  <p>{externalReply}</p>
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    );
  return (
    <div className="conversation-window" role="dialog" aria-modal="true">
      <header>
        <button className="icon-button" aria-label="Back" onClick={onClose}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <span className="eyebrow">
            {ru ? "ЛИЧНАЯ ВСТРЕЧА · КАБИНЕТ GM" : "PRIVATE MEETING · GM OFFICE"}
          </span>
          <strong>{ru ? "Разговор с игроком" : "Player conversation"}</strong>
        </div>
        <button
          className="icon-button"
          aria-label="Close conversation"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="conversation-layout">
        <aside className="conversation-player">
          <div
            className={`conversation-photo ${player.headshot ? "has-photo" : ""}`}
          >
            {player.headshot ? (
              <img src={player.headshot} alt={player.name} />
            ) : (
              <span>{player.number}</span>
            )}
          </div>
          <h1>{player.name}</h1>
          <p>
            {player.pos} · {player.age} {ru ? "лет" : "years"} · {player.ovr}{" "}
            OVR
          </p>
          <div className="conversation-vitals">
            <div>
              <span>{ru ? "Мораль" : "Morale"}</span>
              <b>{player.morale}%</b>
            </div>
            <div>
              <span>{ru ? "Отношения" : "Relationship"}</span>
              <b>{player.relationship ?? 50}%</b>
            </div>
            <div>
              <span>{ru ? "Мотивация" : "Motivation"}</span>
              <b>{player.motivation ?? 50}%</b>
            </div>
          </div>
          <h3>{ru ? "ЧТО БЕСПОКОИТ ИГРОКА" : "PLAYER CONCERNS"}</h3>
          <div className="concern-tags">
            {playerConcerns(player).map((concern) => (
              <span key={concern}>{concern}</span>
            ))}
          </div>
          <small>
            {ru
              ? "Один содержательный разговор доступен между игровыми турами."
              : "One meaningful conversation is available between game rounds."}
          </small>
        </aside>
        <main className="conversation-room">
          <div className="room-heading">
            <div>
              <MessageCircle size={20} />
              <span>
                {ru ? "Выберите тему встречи" : "Choose the meeting topic"}
              </span>
            </div>
            <small>
              {game.year}/{String(game.year + 1).slice(2)} ·{" "}
              {ru ? `тур ${game.round + 1}` : `round ${game.round + 1}`}
            </small>
          </div>
          <div className="topic-grid">
            {(Object.keys(CONVERSATION_TOPICS) as ConversationTopic[]).map(
              (key) => (
                <button
                  key={key}
                  className={topic === key ? "active" : ""}
                  disabled={completed}
                  onClick={() => {
                    setTopic(key);
                    setError("");
                  }}
                >
                  {ru
                    ? CONVERSATION_TOPICS[key].ru
                    : CONVERSATION_TOPICS[key].en}
                </button>
              ),
            )}
          </div>
          {!result && !completed && (
            <section className="dialogue-choices">
              <span className="eyebrow">
                {ru ? "ВАША РЕПЛИКА" : "YOUR RESPONSE"}
              </span>
              <h2>
                {ru
                  ? "Как вы хотите провести разговор?"
                  : "How do you want to handle the conversation?"}
              </h2>
              {conversationOptions(topic).map((option) => (
                <button
                  key={option.tone}
                  onClick={() => {
                    try {
                      let response: ReturnType<typeof talkToPlayer> | null =
                        null;
                      edit((current) => {
                        response = talkToPlayer(
                          current,
                          player.id,
                          topic,
                          option.tone,
                        );
                      });
                      setResult(response);
                      setError("");
                    } catch (caught) {
                      setError((caught as Error).message);
                    }
                  }}
                >
                  <span>
                    {ru
                      ? CONVERSATION_TONES[option.tone].ru
                      : CONVERSATION_TONES[option.tone].en}
                  </span>
                  <p>«{option.line}»</p>
                </button>
              ))}
            </section>
          )}
          {result && (
            <section className={`dialogue-result ${result.outcome}`}>
              <div className="speech manager">
                <small>{ru ? "ВЫ" : "YOU"}</small>
                <p>{result.managerLine}</p>
              </div>
              <div className="speech player">
                <small>{player.name.toUpperCase()}</small>
                <p>{result.response}</p>
              </div>
              <div className="conversation-impact">
                <CheckCircle2 size={18} />
                <span>{ru ? "Итог разговора" : "Conversation impact"}</span>
                <b>
                  {result.moraleDelta >= 0 ? "+" : ""}
                  {result.moraleDelta} MOR
                </b>
                <b>
                  {result.relationshipDelta >= 0 ? "+" : ""}
                  {result.relationshipDelta} REL
                </b>
                <b>
                  {result.motivationDelta >= 0 ? "+" : ""}
                  {result.motivationDelta} MOT
                </b>
              </div>
            </section>
          )}
          {!result && completed && (
            <section className="dialogue-completed">
              <CheckCircle2 size={34} />
              <h2>
                {ru
                  ? "Встреча в этом туре уже состоялась"
                  : "This round's meeting is complete"}
              </h2>
              <p>{history[0]?.response}</p>
            </section>
          )}
          {error && <p className="conversation-error">{error}</p>}
          {history.length > 0 && (
            <section className="conversation-history">
              <h3>{ru ? "ИСТОРИЯ ВСТРЕЧ" : "MEETING HISTORY"}</h3>
              {history.slice(0, 5).map((entry, index) => (
                <div key={`${entry.year}-${entry.round}-${index}`}>
                  <small>
                    {entry.year} · {ru ? "тур" : "round"} {entry.round + 1} ·{" "}
                    {entry.topic}
                  </small>
                  {entry.managerLine && (
                    <p>
                      <b>GM:</b> {entry.managerLine}
                    </p>
                  )}
                  <p>
                    <b>{player.name}:</b> {entry.response}
                  </p>
                </div>
              ))}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
