import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  MessageCircle,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  CONVERSATION_TOPICS,
  MAX_EXCHANGES,
  concludeConversation,
  continueConversation,
  conversationEffects,
  conversationEntryText,
  conversationFollowUps,
  conversationMoodLabel,
  conversationOptions,
  externalContactEligibility,
  openConversation,
  playerConcerns,
  suggestedTopic,
  type ConversationMood,
  type ConversationResult,
  type ConversationState,
  type ConversationTopic,
  type FollowUpKind,
} from "../engine/conversations";
import { dialogueLang, quote } from "../engine/dialogueText";
import type { Game, Player } from "../engine/types";

const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;

function Delta({ value }: { value?: number }) {
  if (!value) return null;
  return (
    <em className={`vital-delta ${value > 0 ? "up" : "down"}`}>
      {value > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {signed(value)}
    </em>
  );
}

function Thread({
  turns,
  playerName,
  ru,
}: {
  turns: {
    speaker: "manager" | "player";
    text: string;
    mood?: ConversationMood;
    label?: string;
  }[];
  playerName: string;
  ru: boolean;
}) {
  return (
    <div className="dialogue-thread">
      {turns.map((turn, index) => (
        <div
          key={index}
          className={`speech ${turn.speaker} ${turn.mood ?? ""}`}
        >
          <small>
            {turn.speaker === "manager"
              ? `${ru ? "ВЫ" : "YOU"}${turn.label ? ` · ${turn.label.toUpperCase()}` : ""}`
              : playerName.toUpperCase()}
            {turn.mood && (
              <span className={`mood-dot ${turn.mood}`}>
                {conversationMoodLabel(turn.mood, ru ? "ru" : "en")}
              </span>
            )}
          </small>
          <p>{turn.text}</p>
        </div>
      ))}
    </div>
  );
}

export default function PlayerConversation({
  player,
  game,
  edit,
  onClose,
  initialTopic,
}: {
  player: Player;
  game: Game;
  edit: (fn: (game: Game) => void) => void;
  onClose: () => void;
  /** Opens on this topic (e.g. from a player's request letter). */
  initialTopic?: ConversationTopic;
}) {
  const ru = game.language === "ru";
  const lang = dialogueLang(game.language);
  const owner = game.teams.find((team) =>
    [...team.players, ...(team.farm ?? [])].some(
      (item) => item.id === player.id,
    ),
  );
  const freeAgent = game.freeAgents?.some((item) => item.id === player.id);
  const international = game.internationalMarket?.some(
    (item) => item.player.id === player.id,
  );
  const junior = game.juniorPlayers?.some((item) => item.id === player.id);
  const unattached = !owner;
  const external = unattached || owner.id !== game.user;
  const eligibility = externalContactEligibility(game, player.id);
  const [externalReply, setExternalReply] = useState("");
  const [topic, setTopic] = useState<ConversationTopic>(
    initialTopic ?? suggestedTopic(player),
  );
  const [session, setSession] = useState<ConversationState | null>(null);
  const [result, setResult] = useState<ConversationResult | null>(null);
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
                : owner
                  ? `OFFICIAL CONTACT · ${owner.id}`
                  : "EXTERNAL PLAYER · AGENT / RIGHTS HOLDER"}
            </span>
            <strong>
              {freeAgent
                ? ru
                  ? "Переговоры через агента"
                  : "Negotiation through the player agent"
                : unattached
                  ? ru
                    ? "Запрос через агента и владельца прав"
                    : "Approach through agent and rights holder"
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
                : owner
                  ? `${owner.city} ${owner.name}`
                  : international
                    ? ru
                      ? "Зарубежный рынок"
                      : "International market"
                    : junior
                      ? ru
                        ? "Юниорские права"
                        : "Junior rights"
                      : ru
                        ? "Организация не установлена"
                        : "Organization not established"}{" "}
              · {player.pos} · {player.ovr} OVR
            </p>
            <div className="conversation-vitals">
              <div>
                <span>{ru ? "Контракт" : "Contract"}</span>
                <b>{player.years}Y</b>
              </div>
              <div>
                <span>{ru ? "Мораль" : "Morale"}</span>
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
                : unattached
                  ? ru
                    ? "Внутренние темы недоступны"
                    : "Internal player topics are unavailable"
                  : ru
                    ? "Контакт только через клуб и агента"
                    : "Contact only through the club and agent"}
            </h2>
            <p>
              {freeAgent
                ? ru
                  ? "Это не разговор со своим игроком: агент оценивает роль, срок, деньги, амбиции клуба и конкуренцию за место."
                  : "This is not an internal player meeting. The agent weighs role, term, salary, club ambition and competition for a roster spot."
                : unattached
                  ? ru
                    ? "Игрок не входит в вашу организацию. Роль в составе, игровое время, настроение и внутренняя критика недоступны; сначала требуется установить права и допустимый канал переговоров."
                    : "This player is not part of your organization. Roster role, ice time, morale and internal feedback are unavailable until rights and a legal negotiation channel are established."
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
                  <small>
                    {ru ? "ОТВЕТ АГЕНТА / КЛУБА" : "AGENT / CLUB REPLY"}
                  </small>
                  <p>{externalReply}</p>
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    );
  const conclude = (state: ConversationState, abrupt = false) => {
    let outcome: ConversationResult | null = null;
    edit((current) => {
      outcome = concludeConversation(current, state, { abrupt });
    });
    if (outcome) setResult(outcome);
    return outcome;
  };
  const close = () => {
    if (session && !result) conclude(session, true);
    onClose();
  };
  const start = (tone: Parameters<typeof openConversation>[3]) => {
    try {
      setSession(openConversation(game, player.id, topic, tone));
      setError("");
    } catch {
      setError(
        ru
          ? "С этим игроком уже говорили в текущем туре."
          : "You've already met this player this round.",
      );
    }
  };
  const followUp = (kind: FollowUpKind) => {
    if (!session) return;
    const next = continueConversation(game, session, kind);
    setSession(next);
    if (next.finished) conclude(next);
  };
  const projected = session && !result ? conversationEffects(session) : null;
  const shown = result ?? projected;
  const options =
    session && !result ? conversationFollowUps(game, session) : [];
  const lastEntry = history[0] ? conversationEntryText(history[0], lang) : null;
  const mood = session?.mood ?? (completed ? history[0]?.outcome : undefined);
  const turns = (session?.turns ?? []).map((turn) => ({
    speaker: turn.speaker,
    text: turn.text[lang],
    mood: turn.mood,
    label: turn.label?.[lang],
  }));
  return (
    <div className="conversation-window" role="dialog" aria-modal="true">
      <header>
        <button className="icon-button" aria-label="Back" onClick={close}>
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
          onClick={close}
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
          {mood && (
            <div className={`conversation-mood ${mood}`}>
              <span>{ru ? "Настрой в разговоре" : "Mood in the room"}</span>
              <b>{conversationMoodLabel(mood, lang)}</b>
            </div>
          )}
          <div className="conversation-vitals">
            {(
              [
                [ru ? "Мораль" : "Morale", player.morale, shown?.moraleDelta],
                [
                  ru ? "Отношения" : "Relationship",
                  player.relationship ?? 50,
                  shown?.relationshipDelta,
                ],
                [
                  ru ? "Мотивация" : "Motivation",
                  player.motivation ?? 50,
                  shown?.motivationDelta,
                ],
              ] as const
            ).map(([label, value, delta]) => (
              <div key={label}>
                <span>{label}</span>
                <i className="vital-bar">
                  <i style={{ width: `${value}%` }} />
                </i>
                <b>
                  {value}% <Delta value={delta} />
                </b>
              </div>
            ))}
          </div>
          {projected && (
            <small className="vital-note">
              {ru
                ? "Прогноз, если закончить разговор сейчас"
                : "Projected if the meeting ended now"}
            </small>
          )}
          <h3>{ru ? "ЧТО БЕСПОКОИТ ИГРОКА" : "PLAYER CONCERNS"}</h3>
          <div className="concern-tags">
            {playerConcerns(player, game.language).map((concern) => (
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
                {session
                  ? `${CONVERSATION_TOPICS[session.topic][lang]} · ${
                      ru ? "обмен" : "exchange"
                    } ${Math.min(session.exchanges, MAX_EXCHANGES)}/${MAX_EXCHANGES}`
                  : ru
                    ? "Выберите тему встречи"
                    : "Choose the meeting topic"}
              </span>
            </div>
            <small>
              {game.year}/{String(game.year + 1).slice(2)} ·{" "}
              {ru ? `тур ${game.round + 1}` : `round ${game.round + 1}`}
            </small>
          </div>
          {!session && (
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
                    {CONVERSATION_TOPICS[key][lang]}
                  </button>
                ),
              )}
            </div>
          )}
          {!session && !completed && (
            <section className="dialogue-choices">
              <span className="eyebrow">
                {ru ? "ВАША ПЕРВАЯ РЕПЛИКА" : "YOUR OPENING LINE"}
              </span>
              <h2>
                {ru
                  ? "Как вы хотите провести разговор?"
                  : "How do you want to handle the conversation?"}
              </h2>
              {conversationOptions(topic, player, game).map((option) => (
                <button key={option.tone} onClick={() => start(option.tone)}>
                  <span>{option.label[lang]}</span>
                  <p>{quote(option.text[lang], lang)}</p>
                </button>
              ))}
            </section>
          )}
          {session && (
            <section
              className={`dialogue-result ${result?.outcome ?? session.mood}`}
            >
              <Thread turns={turns} playerName={player.name} ru={ru} />
              {!result && options.length > 0 && (
                <div className="dialogue-choices conversation-follow-up">
                  <span className="eyebrow">
                    {ru ? "ВАШ ОТВЕТ" : "YOUR REPLY"}
                  </span>
                  {options.map((option) => (
                    <button
                      key={option.kind}
                      onClick={() => followUp(option.kind)}
                    >
                      <span>
                        {option.label[lang]}
                        {option.closes && (
                          <em className="closes-tag">
                            {ru ? "завершает" : "closes"}
                          </em>
                        )}
                      </span>
                      <p>
                        {quote(option.line[lang], lang)}
                        <small>{option.hint[lang]}</small>
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {result && (
                <div className={`conversation-outcome ${result.outcome}`}>
                  <CheckCircle2 size={22} />
                  <div>
                    <span className="eyebrow">
                      {ru ? "ИТОГ РАЗГОВОРА" : "MEETING OUTCOME"} ·{" "}
                      {conversationMoodLabel(result.outcome, lang)}
                    </span>
                    <p>{result.summary[lang]}</p>
                  </div>
                  <div className="conversation-impact">
                    <b className={result.moraleDelta >= 0 ? "up" : "down"}>
                      {signed(result.moraleDelta)} {ru ? "мораль" : "morale"}
                    </b>
                    <b
                      className={result.relationshipDelta >= 0 ? "up" : "down"}
                    >
                      {signed(result.relationshipDelta)}{" "}
                      {ru ? "отношения" : "relationship"}
                    </b>
                    <b className={result.motivationDelta >= 0 ? "up" : "down"}>
                      {signed(result.motivationDelta)}{" "}
                      {ru ? "мотивация" : "motivation"}
                    </b>
                  </div>
                  <button className="primary" onClick={onClose}>
                    {ru ? "Закончить встречу" : "End meeting"}
                  </button>
                </div>
              )}
            </section>
          )}
          {!session && completed && (
            <section className="dialogue-completed">
              <CheckCircle2 size={34} />
              <h2>
                {ru
                  ? "Встреча в этом туре уже состоялась"
                  : "This round's meeting is complete"}
              </h2>
              {lastEntry && lastEntry.transcript.length > 0 ? (
                <Thread
                  turns={lastEntry.transcript}
                  playerName={player.name}
                  ru={ru}
                />
              ) : (
                <p>{lastEntry?.response}</p>
              )}
              {lastEntry?.summary && (
                <p className="completed-summary">{lastEntry.summary}</p>
              )}
            </section>
          )}
          {error && <p className="conversation-error">{error}</p>}
          {history.length > 0 && (
            <section className="conversation-history">
              <h3>{ru ? "ИСТОРИЯ ВСТРЕЧ" : "MEETING HISTORY"}</h3>
              {history.slice(0, 5).map((entry, index) => {
                const text = conversationEntryText(entry, lang);
                return (
                  <div
                    key={`${entry.year}-${entry.round}-${index}`}
                    className={entry.outcome ?? ""}
                  >
                    <small>
                      {entry.year} · {ru ? "тур" : "round"} {entry.round + 1} ·{" "}
                      {text.topic}
                      {entry.exchanges
                        ? ` · ${entry.exchanges} ${ru ? "обм." : "exch."}`
                        : ""}{" "}
                      · {signed(entry.moraleDelta)} MOR ·{" "}
                      {signed(entry.relationshipDelta)} REL
                    </small>
                    {text.managerLine && (
                      <p>
                        <b>GM:</b> {text.managerLine}
                      </p>
                    )}
                    <p>
                      <b>{player.name}:</b> {text.response}
                    </p>
                    {text.summary && (
                      <p className="history-summary">{text.summary}</p>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
