import { useState } from "react";
import {
  Flame,
  GraduationCap,
  HeartCrack,
  Shield,
  Users,
} from "lucide-react";
import type {
  Game,
  MeetingGroup,
  TeamMeetingRecord,
  TeamMeetingTone,
  TeamMeetingTopic,
} from "../engine/types";
import {
  GROUP_LABELS,
  MEETING_TONES,
  MEETING_TOPICS,
  REACTION_LABELS,
  TONE_LABELS,
  TOPIC_LABELS,
  holdTeamMeeting,
  meetingContext,
  topicFit,
} from "../engine/teamMeetings";
import type { L } from "../engine/dialogueText";
import { PlayerLink } from "./links";

type Edit = (fn: (game: Game) => void) => void;

const GROUP_ICONS: Record<MeetingGroup, typeof Users> = {
  leaders: Shield,
  veterans: Flame,
  young: GraduationCap,
  unhappy: HeartCrack,
};

const LEGACY_REASONS: Record<string, L> = {
  preseason: { ru: "Старт сезона", en: "Season launch" },
  playoffs: { ru: "Плей-офф", en: "Playoffs" },
  morale: { ru: "Атмосфера", en: "Morale" },
};

const signed = (value: number) =>
  value > 0 ? `+${value}` : value === 0 ? "0" : `${value}`;

export default function TeamMeetingPanel({
  game,
  edit,
}: {
  game: Game;
  edit: Edit;
}) {
  const ru = game.language === "ru";
  const lang = ru ? "ru" : "en";
  const tr = (russian: string, english: string) => (ru ? russian : english);
  const team = game.teams.find((club) => club.id === game.user)!;
  const ctx = meetingContext(game);
  const [topic, setTopic] = useState<TeamMeetingTopic>();
  const [tone, setTone] = useState<TeamMeetingTone>();
  const [target, setTarget] = useState(ctx.struggling[0]?.player.id ?? "");
  const [result, setResult] = useState<{
    record: TeamMeetingRecord;
    notes: L[];
  }>();
  const offseason = game.phase === "offseason";
  const blocked = ctx.onCooldown || offseason;
  const ready =
    !!topic && !!tone && !blocked && (topic !== "back-player" || !!target);

  const hold = () => {
    if (!ready) return;
    let outcome: ReturnType<typeof holdTeamMeeting> | undefined;
    edit((current) => {
      outcome = holdTeamMeeting(current, {
        topic: topic!,
        tone: tone!,
        targetPlayerId: topic === "back-player" ? target : undefined,
      });
    });
    if (outcome) setResult({ record: outcome.record, notes: outcome.notes });
    setTopic(undefined);
    setTone(undefined);
  };

  const fitClass = (score: number) =>
    score >= 3 ? "good" : score <= -2 ? "bad" : "mixed";
  const nameOf = (id?: string) =>
    team.players.find((player) => player.id === id)?.name;
  const streak = ctx.streak;
  const history = (game.teamMeetings ?? []).slice(0, 8);
  const selectedFit = topic
    ? topicFit(game, ctx, topic, topic === "back-player" ? target : undefined)
    : undefined;

  return (
    <div className="meeting-layout">
      <section className="leadership-panel meeting-context">
        <span className="eyebrow">
          {tr("СИТУАЦИЯ В КОМАНДЕ", "TEAM SITUATION")}
        </span>
        <div className="context-grid">
          <div>
            <small>{tr("Последние 5", "Last 5")}</small>
            <div className="form-strip">
              {ctx.last5.length ? (
                ctx.last5.map((result, index) => (
                  <i key={index} className={result === "W" ? "w" : "l"}>
                    {result === "W" ? tr("В", "W") : result === "OT" ? tr("ОТ", "OT") : tr("П", "L")}
                  </i>
                ))
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
          <div>
            <small>{tr("Серия", "Streak")}</small>
            <b>
              {streak
                ? `${streak.kind === "W" ? tr("В", "W") : tr("П", "L")}${streak.n}`
                : "—"}
            </b>
          </div>
          <div>
            <small>{tr("Мораль", "Morale")}</small>
            <b>{Math.round(ctx.averageMorale)}</b>
          </div>
          <div>
            <small>{tr("Штраф/матч", "PIM/game")}</small>
            <b>
              {ctx.gamesPlayed ? ctx.pimPerGame.toFixed(1) : "—"}
              <em> / {ctx.leaguePimPerGame.toFixed(1)}</em>
            </b>
          </div>
          <div>
            <small>{tr("Важный матч", "Big game")}</small>
            <b>{ctx.bigGame ? ctx.bigGame.opponent : "—"}</b>
          </div>
          <div>
            <small>{tr("Прошлое собрание", "Last meeting")}</small>
            <b>
              {ctx.daysSinceLast === undefined
                ? tr("не было", "none")
                : tr(`${ctx.daysSinceLast} дн. назад`, `${ctx.daysSinceLast}d ago`)}
            </b>
          </div>
        </div>
        {blocked && (
          <p className="meeting-blocked">
            {offseason
              ? tr(
                  "Межсезонье. Игроки разъехались, собирать некого.",
                  "Offseason. The players have gone home.",
                )
              : tr(
                  `Слишком рано для нового собрания. Следующее — не раньше ${ctx.cooldownUntil}.`,
                  `Too soon for another meeting. Next one no earlier than ${ctx.cooldownUntil}.`,
                )}
          </p>
        )}
        {!blocked && ctx.recentMeetings > 0 && (
          <p className="meeting-warning">
            {tr(
              `За три недели уже было собраний: ${ctx.recentMeetings}. Каждое следующее действует слабее.`,
              `Meetings in the last three weeks: ${ctx.recentMeetings}. Each new one lands softer.`,
            )}
          </p>
        )}
      </section>

      <section className="leadership-panel meeting-builder">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{tr("1. ТЕМА", "1. TOPIC")}</span>
            <h2>{tr("О чём говорим", "What it's about")}</h2>
          </div>
          <Users size={22} />
        </div>
        <div className="topic-grid">
          {MEETING_TOPICS.map((item) => {
            const fit = topicFit(
              game,
              ctx,
              item,
              item === "back-player" ? target : undefined,
            );
            return (
              <button
                key={item}
                data-topic={item}
                className={`topic-card ${topic === item ? "active" : ""}`}
                disabled={blocked}
                onClick={() => {
                  setTopic(item);
                  setResult(undefined);
                }}
              >
                <i className={`fit-dot ${fitClass(fit.score)}`} />
                <b>{TOPIC_LABELS[item].title[lang]}</b>
                <span>{TOPIC_LABELS[item].detail[lang]}</span>
              </button>
            );
          })}
        </div>
        {topic === "back-player" && (
          <label className="meeting-target">
            {tr("Кого поддержать", "Who to back")}
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">—</option>
              {ctx.struggling.length > 0 && (
                <optgroup label={tr("В спаде", "Struggling")}>
                  {ctx.struggling.map(({ player, why }) => (
                    <option key={player.id} value={player.id}>
                      {player.name} ·{" "}
                      {why === "goalie"
                        ? tr("процент сейвов", "save %")
                        : why === "form"
                          ? tr("форма", "form")
                          : tr("мораль", "morale")}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={tr("Весь состав", "Whole roster")}>
                {team.players
                  .filter(
                    (player) =>
                      !ctx.struggling.some((item) => item.player.id === player.id),
                  )
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name} · {player.pos}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
        )}
        {selectedFit && (
          <p className={`assistant-read ${fitClass(selectedFit.score)}`}>
            <b>{tr("Помощник", "Assistant")}:</b> {selectedFit.note[lang]}
          </p>
        )}

        <span className="eyebrow tone-heading">{tr("2. ТОН", "2. TONE")}</span>
        <div className="tone-row">
          {MEETING_TONES.map((item) => (
            <button
              key={item}
              data-tone={item}
              className={`tone-card ${item} ${tone === item ? "active" : ""}`}
              disabled={blocked}
              onClick={() => setTone(item)}
            >
              <b>{TONE_LABELS[item].title[lang]}</b>
              <span>{TONE_LABELS[item].detail[lang]}</span>
            </button>
          ))}
        </div>
        <button
          className="primary leadership-confirm"
          disabled={!ready}
          onClick={hold}
        >
          <Users size={17} />
          {tr("Собрать команду", "Call the meeting")}
        </button>
      </section>

      {result && (
        <section
          className={`leadership-panel meeting-result ${result.record.outcome}`}
          role="status"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                {tr("РЕАКЦИЯ РАЗДЕВАЛКИ", "DRESSING-ROOM REACTION")}
              </span>
              <h2>
                {result.record.messageI18n?.[lang] ?? result.record.message}
              </h2>
            </div>
            <div className="meeting-deltas">
              <span>
                {tr("Мораль", "Morale")}{" "}
                <b>{signed(result.record.moraleDelta ?? 0)}</b>
              </span>
              <span>
                {tr("Мотивация", "Motivation")}{" "}
                <b>{signed(result.record.motivationDelta ?? 0)}</b>
              </span>
            </div>
          </div>
          <ul className="reaction-reasons">
            {result.notes.map((note) => (
              <li key={note.en}>{note[lang]}</li>
            ))}
          </ul>
          <div className="group-reactions">
            {result.record.reactions?.map((reaction) => {
              const Icon = GROUP_ICONS[reaction.group];
              return (
                <div
                  key={reaction.group}
                  className={`group-reaction ${reaction.reaction}`}
                >
                  <header>
                    <Icon size={16} />
                    <b>{GROUP_LABELS[reaction.group][lang]}</b>
                    <small>{reaction.count}</small>
                  </header>
                  <strong>{REACTION_LABELS[reaction.reaction][lang]}</strong>
                  <p>{reaction[lang]}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="leadership-panel meeting-history">
          <span className="eyebrow">{tr("ИСТОРИЯ СОБРАНИЙ", "MEETING LOG")}</span>
          {history.map((meeting, index) => {
            const topicLabel = meeting.topic
              ? TOPIC_LABELS[meeting.topic].title[lang]
              : (LEGACY_REASONS[meeting.reason]?.[lang] ??
                (TOPIC_LABELS[meeting.reason as TeamMeetingTopic]?.title[lang] ??
                  meeting.reason));
            return (
              <div key={`${meeting.date}-${index}`} className={meeting.outcome}>
                <small>{meeting.date}</small>
                <span>
                  {topicLabel} · {TONE_LABELS[meeting.tone]?.title[lang]}
                  {meeting.targetPlayerId && (
                    <>
                      {" · "}
                      <PlayerLink
                        id={meeting.targetPlayerId}
                        name={nameOf(meeting.targetPlayerId)}
                      />
                    </>
                  )}
                </span>
                <b>
                  {meeting.outcome === "positive"
                    ? tr("сработало", "worked")
                    : meeting.outcome === "negative"
                      ? tr("провал", "backfired")
                      : tr("без эффекта", "no effect")}
                  {meeting.moraleDelta !== undefined &&
                    ` · ${signed(meeting.moraleDelta)}`}
                </b>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
