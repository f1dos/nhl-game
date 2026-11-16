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
  const freeAgent = game.freeAgents?.some((item) => item.id === player.id);
  const external = !!freeAgent || (!!owner && owner.id !== game.user);
  const eligibility = externalContactEligibility(game, player.id);
  const [externalReply, setExternalReply] = useState("");
  const [followUp, setFollowUp] = useState("");
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
            <span className="eyebrow">
              {freeAgent
                ? "FREE AGENT NEGOTIATION"
                : `OFFICIAL CONTACT · ${owner?.id}`}
            </span>
            <strong>
              {freeAgent
                ? ru
                  ? "Переговоры через агента"
                  : "Negotiation through the player agent"
                : ru
                  ? "Запрос по игроку другого клуба"
                  : "Request about another club's player"}
            </strong>
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
              {freeAgent
                ? ru
                  ? "Свободный агент"
                  : "Free agent"
                : `${owner?.city} ${owner?.name}`}{" "}
              · {player.pos} · {player.ovr} OVR
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
            <span className="eyebrow">
              {freeAgent
                ? ru
                  ? "ОФИЦИАЛЬНЫЕ ПЕРЕГОВОРЫ"
                  : "OFFICIAL NEGOTIATION"
                : ru
                  ? "НЕ ЛИЧНАЯ ВСТРЕЧА"
                  : "NO DIRECT MEETING"}
            </span>
            <h2>
              {freeAgent
                ? ru
                  ? "Обсудите проект и условия контракта"
                  : "Discuss the project and contract framework"
                : ru
                  ? "Контакт только через клуб и агента"
                  : "Contact only through the club and agent"}
            </h2>
            <p>
              {freeAgent
                ? ru
                  ? "Это не разговор со своим игроком: агент оценивает роль, срок, деньги, амбиции клуба и конкуренцию за место."
                  : "This is not an internal player meeting. The agent weighs role, term, salary, club ambition and competition for a roster spot."
                : ru
                  ? "Разговоры о роли, форме и игровом времени доступны только со своими хоккеистами. Обращение к игроку на контракте без разрешения клуба считается tampering."
                  : "Role, form and ice-time meetings are reserved for your own players. Contacting a contracted player without club permission is tampering."}
            </p>
            <div
              className={`contact-permission ${eligibility.allowed ? "allowed" : "blocked"}`}
            >
              <b>
                {eligibility.allowed
                  ? ru
                    ? "Официальный запрос разрешён"
                    : "Official approach available"
                  : ru
                    ? "Контакт недоступен"
                    : "Contact unavailable"}
              </b>
              <span>{eligibility.reason}</span>
            </div>
            {eligibility.allowed && !externalReply && (
              <div className="dialogue-choices">
                <button
                  onClick={() =>
                    setExternalReply(
                      freeAgent
                        ? ru
                          ? "Агент готов продолжить: назовите роль, срок и финансовый диапазон. Интерес игрока зависит от шансов на Кубок и игрового времени."
                          : "The agent is ready to continue: define the role, term and salary range. The player's interest depends on contention and ice time."
                        : ru
                          ? "Агент подтвердил: игрок готов выслушать спортивный проект, но клуб сначала требует согласовать компенсацию."
                          : "The agent confirms some interest, but the club requires compensation to be agreed first.",
                    )
                  }
                >
                  <span>
                    {ru
                      ? "Уточнить интерес игрока"
                      : "Ask about player interest"}
                  </span>
                  <p>
                    {ru
                      ? "Передать агенту роль, срок и направление развития клуба."
                      : "Present the role, term and direction of the club."}
                  </p>
                </button>
                <button
                  onClick={() =>
                    setExternalReply(
                      freeAgent
                        ? ru
                          ? "Агент запросил официальный контрактный оффер через центр контрактов."
                          : "The agent requests a formal offer through the contract centre."
                        : ru
                          ? "GM клуба не дал разрешение на прямой разговор. Предложено начать с официального обмена."
                          : "The club's GM denied direct contact and asks you to begin with a formal trade proposal.",
                    )
                  }
                >
                  <span>
                    {freeAgent
                      ? ru
                        ? "Перейти к офферу"
                        : "Move toward an offer"
                      : ru
                        ? "Запросить разрешение клуба"
                        : "Request club permission"}
                  </span>
                  <p>
                    {freeAgent
                      ? ru
                        ? "Уточнить ожидания перед официальным предложением."
                        : "Clarify expectations before a formal proposal."
                      : ru
                        ? "Официально связаться с GM команды-владельца."
                        : "Contact the owning club's GM formally."}
                  </p>
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
              {!followUp && (
                <div className="dialogue-choices conversation-follow-up">
                  <button
                    onClick={() =>
                      setFollowUp(
                        ru
                          ? "Хорошо, теперь я понимаю конкретно, чего вы от меня ждёте."
                          : "Good. I understand exactly what you expect from me now.",
                      )
                    }
                  >
                    <span>
                      {ru ? "Уточнить ожидания" : "Clarify expectations"}
                    </span>
                    <p>
                      {ru
                        ? "Закрепить разговор конкретной ролью и ближайшей задачей."
                        : "Finish with a specific role and a near-term target."}
                    </p>
                  </button>
                  <button
                    onClick={() =>
                      setFollowUp(
                        ru
                          ? "Спасибо, что выслушали. Для меня было важно сказать это напрямую."
                          : "Thanks for listening. It mattered that I could say that directly.",
                      )
                    }
                  >
                    <span>
                      {ru ? "Выслушать игрока" : "Hear the player out"}
                    </span>
                    <p>
                      {ru
                        ? "Дать игроку последнее слово без нового обещания."
                        : "Give the player the final word without making another promise."}
                    </p>
                  </button>
                </div>
              )}
              {followUp && (
                <div className="speech player">
                  <small>{player.name.toUpperCase()}</small>
                  <p>{followUp}</p>
                </div>
              )}
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
