import {
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  Handshake,
  MessageCircle,
  XCircle,
} from "lucide-react";
import {
  REQUEST_TYPE_LABELS,
  listingFor,
  promiseLabel,
  promiseProgress,
  promisesFor,
  replyToRequest,
  requestReplies,
  type PlayerPromise,
  type PlayerRequest,
  type ReplyKind,
} from "../engine/playerRequests";
import { findPlayer, PlayerLink } from "./links";
import type { Game, Player } from "../engine/types";

type Edit = (fn: (game: Game) => void) => void;
export type TalkHandler = (player: Player, request: PlayerRequest) => void;

const pick = (text: { ru: string; en: string }, ru: boolean) =>
  ru ? text.ru : text.en;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const q = (text: string, ru: boolean) => (ru ? `«${text}»` : `“${text}”`);

/** A player's letter with reply buttons, shown inside an inbox row. */
export function RequestLetter({
  game,
  request,
  edit,
  onTalk,
}: {
  game: Game;
  request: PlayerRequest;
  edit: Edit;
  onTalk?: TalkHandler;
}) {
  const ru = game.language === "ru";
  const player = findPlayer(game, request.playerId);
  const open = request.status === "open";
  const replies = open ? requestReplies(game, request) : [];
  const chosen = !open && request.reply
    ? requestReplies(game, request).find((item) => item.kind === request.reply)
    : undefined;
  const promise = request.promiseId
    ? game.playerRequests?.promises.find((item) => item.id === request.promiseId)
    : undefined;
  const reply = (kind: ReplyKind) =>
    edit((g) => {
      replyToRequest(g, request.id, kind);
    });
  return (
    <div className={`request-letter ${request.status}`} data-request-id={request.id}>
      <div className="request-tags">
        <span className="request-type">{pick(REQUEST_TYPE_LABELS[request.type], ru)}</span>
        {request.context.reason === "public" && (
          <span className="request-type public">{ru ? "ПУБЛИЧНО" : "PUBLIC"}</span>
        )}
      </div>
      <blockquote>
        {pick(request.letter, ru)}
        <cite>
          —{" "}
          {player ? <PlayerLink player={player}>{request.playerName}</PlayerLink> : request.playerName}
          {player && (
            <small>
              {player.pos} · {player.age} {ru ? "лет" : "yrs"} · {ru ? "мораль" : "morale"} {Math.round(player.morale)} ·{" "}
              {ru ? "отношения" : "relationship"} {player.relationship ?? 50}%
            </small>
          )}
        </cite>
      </blockquote>
      {open ? (
        <div className="request-replies">
          {replies.map((option) => (
            <button
              key={option.kind}
              className={`request-reply ${option.kind}`}
              onClick={() => reply(option.kind)}
            >
              <b>{pick(option.label, ru)}</b>
              <span>{q(pick(option.line, ru), ru)}</span>
              <small>{pick(option.hint, ru)}</small>
            </button>
          ))}
          {onTalk && player && request.type !== "thanks" && (
            <button className="request-talk" onClick={() => onTalk(player, request)}>
              <MessageCircle size={14} />
              {ru ? "Поговорить лично" : "Talk to him"}
            </button>
          )}
        </div>
      ) : (
        <div className="request-outcome">
          {chosen && (
            <p className="request-you">
              <small>{ru ? "ВЫ" : "YOU"}</small>
              {q(pick(chosen.line, ru), ru)}
            </p>
          )}
          {request.status === "expired" && (
            <p className="request-you muted">
              {ru ? "Вы не ответили вовремя." : "You didn't reply in time."}
            </p>
          )}
          {request.reaction && (
            <p className={`request-reaction ${request.status === "refused" || request.status === "expired" || request.persuaded === false ? "negative" : "positive"}`}>
              <small>{request.playerName.toUpperCase()}</small>
              {q(pick(request.reaction, ru), ru)}
            </p>
          )}
          <div className="request-effects">
            {request.effects && (
              <>
                <span>{ru ? "Мораль" : "Morale"} {signed(request.effects.morale)}</span>
                <span>{ru ? "Отношения" : "Relationship"} {signed(request.effects.relationship)}</span>
              </>
            )}
            {promise && <PromiseChip game={game} promise={promise} />}
            {listingFor(game, request.playerId) && request.type === "trade" && (
              <span className="request-listed">
                <ArrowRightLeft size={12} /> {ru ? "В списке на обмен" : "On the trade list"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL = {
  active: ["Действует", "Active"],
  kept: ["Выполнено", "Kept"],
  broken: ["Нарушено", "Broken"],
  void: ["Снято", "Void"],
} as const;

export function PromiseChip({ game, promise }: { game: Game; promise: PlayerPromise }) {
  const ru = game.language === "ru";
  const Icon =
    promise.status === "kept" ? CheckCircle2 : promise.status === "broken" ? XCircle : promise.status === "active" ? Clock3 : Handshake;
  return (
    <span className={`promise-chip ${promise.status}`}>
      <Icon size={12} />
      {pick(promiseLabel(promise.kind, promise.target, promise.group), ru)} ·{" "}
      {STATUS_LABEL[promise.status][ru ? 0 : 1]}
      {promise.status === "active" && ` · ${ru ? "до" : "by"} ${promise.deadline}`}
    </span>
  );
}

function PromiseRow({ game, promise }: { game: Game; promise: PlayerPromise }) {
  const ru = game.language === "ru";
  const player = findPlayer(game, promise.playerId);
  const progress = promiseProgress(game, promise);
  const active = promise.status === "active";
  return (
    <div className={`promise-row ${promise.status}${active && progress.daysLeft <= 2 ? " urgent" : ""}`}>
      <div>
        <strong>
          {player ? <PlayerLink player={player}>{promise.playerName}</PlayerLink> : promise.playerName}
        </strong>
        <span>{pick(promiseLabel(promise.kind, promise.target, promise.group), ru)}</span>
      </div>
      <small>{active ? pick(progress.text, ru) : promise.resolved}</small>
      <em>
        {active
          ? ru
            ? `${progress.daysLeft} дн.`
            : `${progress.daysLeft}d left`
          : STATUS_LABEL[promise.status][ru ? 0 : 1]}
      </em>
    </div>
  );
}

/** Active promises, recent outcomes and the requested trade list. */
export function PromisesPanel({ game }: { game: Game }) {
  const ru = game.language === "ru";
  const state = game.playerRequests;
  if (!state) return null;
  const active = state.promises.filter((item) => item.status === "active");
  const recent = state.promises
    .filter((item) => item.status !== "active" && item.status !== "void")
    .slice(0, 4);
  const listed = state.listed
    .map((item) => ({ item, player: findPlayer(game, item.playerId) }))
    .filter((entry) => entry.player);
  if (!active.length && !recent.length && !listed.length) return null;
  const kept = state.promises.filter((item) => item.status === "kept").length;
  const broken = state.promises.filter((item) => item.status === "broken").length;
  return (
    <section className="promises-panel" aria-label={ru ? "Обещания игрокам" : "Promises to players"}>
      <header>
        <div>
          <span className="eyebrow">{ru ? "ДАННОЕ СЛОВО" : "YOUR WORD"}</span>
          <h3>{ru ? "Обещания игрокам" : "Promises to players"}</h3>
        </div>
        <div className="promise-score">
          <span className="kept">{kept} {ru ? "выполнено" : "kept"}</span>
          <span className="broken">{broken} {ru ? "нарушено" : "broken"}</span>
        </div>
      </header>
      <div className="promise-list">
        {active.map((promise) => (
          <PromiseRow key={promise.id} game={game} promise={promise} />
        ))}
        {!active.length && (
          <p className="muted">{ru ? "Активных обещаний нет." : "No active promises."}</p>
        )}
        {recent.map((promise) => (
          <PromiseRow key={promise.id} game={game} promise={promise} />
        ))}
      </div>
      {listed.length > 0 && (
        <div className="listed-strip">
          <ArrowRightLeft size={14} />
          <b>{ru ? "Просят обмен:" : "Asked to be traded:"}</b>
          {listed.map(({ item, player }) => (
            <PlayerLink key={item.playerId} player={player!} className={`listed-chip${item.public ? " public" : ""}`}>
              {player!.name}
              {item.public ? (ru ? " · публично" : " · public") : ""}
            </PlayerLink>
          ))}
        </div>
      )}
    </section>
  );
}

/** Player-card box: listing status, promises and latest requests. */
export function PlayerRequestsBox({ game, player }: { game: Game; player: Player }) {
  const ru = game.language === "ru";
  const promises = promisesFor(game, player.id).slice(0, 4);
  const listing = listingFor(game, player.id);
  const requests = (game.playerRequests?.requests ?? [])
    .filter((item) => item.playerId === player.id)
    .slice(0, 3);
  if (!promises.length && !listing && !requests.length) return null;
  return (
    <section className="pc-box pc-requests">
      <h3>
        <Handshake size={14} /> {ru ? "ЗАПРОСЫ И ОБЕЩАНИЯ" : "REQUESTS & PROMISES"}
      </h3>
      {listing && (
        <p className={`request-listed${listing.public ? " public" : ""}`}>
          <ArrowRightLeft size={12} />
          {listing.public
            ? ru
              ? `Публично требует обмена с ${listing.since}`
              : `Publicly demanding a trade since ${listing.since}`
            : ru
              ? `Просит обмен с ${listing.since}`
              : `Asked to be traded on ${listing.since}`}
        </p>
      )}
      {promises.map((promise) => (
        <PromiseChip key={promise.id} game={game} promise={promise} />
      ))}
      {requests.map((request) => (
        <small key={request.id}>
          {request.date} · {pick(REQUEST_TYPE_LABELS[request.type], ru)} ·{" "}
          {request.status === "open"
            ? ru ? "ждёт ответа" : "awaiting reply"
            : request.status === "accepted"
              ? ru ? "приняли" : "accepted"
              : request.status === "explained"
                ? request.persuaded === false
                  ? ru ? "не убедили" : "not convinced"
                  : ru ? "объяснили" : "explained"
                : request.status === "refused"
                  ? ru ? "отказали" : "refused"
                  : ru ? "без ответа" : "ignored"}
        </small>
      ))}
    </section>
  );
}

/** Small badge for roster / trade tables. */
export function RequestBadge({ game, playerId }: { game: Game; playerId: string }) {
  const ru = game.language === "ru";
  const listing = listingFor(game, playerId);
  const promise = promisesFor(game, playerId).find((item) => item.status === "active");
  if (!listing && !promise) return null;
  return (
    <>
      {listing && (
        <em
          className={`request-badge${listing.public ? " public" : ""}`}
          title={ru ? "Игрок попросил обмен" : "Player asked to be traded"}
        >
          {ru ? "ПРОСИТ ОБМЕН" : "TRADE REQUEST"}
        </em>
      )}
      {promise && (
        <em
          className="request-badge promise"
          title={pick(promiseLabel(promise.kind, promise.target, promise.group), ru)}
        >
          {ru ? "ОБЕЩАНИЕ" : "PROMISE"}
        </em>
      )}
    </>
  );
}
