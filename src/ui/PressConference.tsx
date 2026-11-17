import { CheckCircle2, Mic2 } from "lucide-react";
import {
  answerPressQuestion,
  buildPressConference,
  pressAppearanceText,
  pressAppearances,
  pressConferenceComplete,
  pressConferenceTotals,
  type PressAnswer,
  type PressType,
} from "../engine/press";
import { dialogueLang, quote } from "../engine/dialogueText";
import type { Game } from "../engine/types";

type Edit = (fn: (game: Game) => void) => void;

const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

function Chip({ label, value }: { label: string; value: number }) {
  if (!value) return null;
  return (
    <span className={`press-chip ${value > 0 ? "up" : "down"}`}>
      {label} {signed(value)}
    </span>
  );
}

export function PressEffects({
  answer,
  ru,
}: {
  answer: Pick<PressAnswer, "fan" | "board" | "morale" | "playerName" | "playerMorale">;
  ru: boolean;
}) {
  const none = !answer.fan && !answer.board && !answer.morale && !answer.playerMorale;
  return (
    <span className="press-chips">
      <Chip label={ru ? "Фанаты" : "Fans"} value={answer.fan} />
      <Chip label={ru ? "Руководство" : "Board"} value={answer.board} />
      <Chip label={ru ? "Раздевалка" : "Room"} value={answer.morale} />
      {answer.playerName && (
        <Chip label={answer.playerName} value={answer.playerMorale ?? 0} />
      )}
      {none && <span className="press-chip">{ru ? "без эффекта" : "no effect"}</span>}
    </span>
  );
}

/**
 * Multi-question press conference. Each question comes from a named
 * (fictional) reporter; every answer's consequences are shown up front and
 * applied once through {@link answerPressQuestion}.
 */
export default function PressConference({
  game,
  edit,
  type,
  date,
}: {
  game: Game;
  edit: Edit;
  type: PressType;
  date: string;
}) {
  const ru = game.language === "ru";
  const lang = dialogueLang(game.language);
  const conference = buildPressConference(game, type, date);
  const entries = pressAppearances(game, date, type);
  const legacy = entries.find((entry) => !entry.questionId);
  const complete = pressConferenceComplete(game, conference);
  const answered = conference.questions.filter((question) =>
    entries.some((entry) => entry.questionId === question.id),
  );
  const current = complete
    ? undefined
    : conference.questions.find(
        (question) => !entries.some((entry) => entry.questionId === question.id),
      );
  const totals = pressConferenceTotals(game, conference);
  const answer = (questionId: string, answerId: string) =>
    edit((draft) =>
      answerPressQuestion(
        draft,
        buildPressConference(draft, type, date),
        questionId,
        answerId,
      ),
    );
  if (legacy)
    return (
      <div className="presser">
        <div className="press-consequence">
          <CheckCircle2 size={26} />
          <div>
            <b>{ru ? "Ответ опубликован" : "Statement published"}</b>
            <p>{quote(pressAppearanceText(legacy, game.language).headline, lang)}</p>
          </div>
        </div>
      </div>
    );
  return (
    <div className="presser">
      <div className="presser-progress">
        <span>
          <Mic2 size={14} /> LIVE
        </span>
        {conference.questions.map((question, index) => (
          <i
            key={question.id}
            className={
              answered.includes(question)
                ? "done"
                : question === current
                  ? "current"
                  : ""
            }
            title={`${index + 1}`}
          />
        ))}
        <small>
          {complete
            ? ru
              ? "Пресс-конференция завершена"
              : "Press conference over"
            : ru
              ? `Вопрос ${answered.length + 1} из ${conference.questions.length}`
              : `Question ${answered.length + 1} of ${conference.questions.length}`}
        </small>
      </div>
      {answered.map((question) => {
        const entry = entries.find((item) => item.questionId === question.id)!;
        const text = pressAppearanceText(entry, game.language);
        return (
          <div className="presser-exchange done" key={question.id}>
            <div className="presser-question">
              <span className="press-avatar">{initials(question.journalist.name.en)}</span>
              <div>
                <small>
                  {question.journalist.name[lang]} · {question.journalist.outlet[lang]}
                </small>
                <p>{question.text[lang]}</p>
              </div>
            </div>
            <div className="presser-answer">
              <small>
                {ru ? "ВЫ" : "YOU"} · {text.style.toUpperCase()}
              </small>
              <p>{quote(text.headline, lang)}</p>
            </div>
            <div className="presser-reaction">
              <span>{text.reaction}</span>
              <PressEffects
                ru={ru}
                answer={{
                  fan: entry.fanDelta,
                  board: entry.boardDelta,
                  morale: entry.moraleDelta,
                  playerName: entry.playerId
                    ? game.teams
                        .flatMap((team) => team.players)
                        .find((player) => player.id === entry.playerId)?.name
                    : undefined,
                  playerMorale: entry.playerMoraleDelta,
                }}
              />
            </div>
          </div>
        );
      })}
      {current && (
        <div className="presser-exchange current">
          <div className="presser-question">
            <span className="press-avatar">{initials(current.journalist.name.en)}</span>
            <div>
              <small>
                {current.journalist.name[lang]} · {current.journalist.outlet[lang]}
              </small>
              <p className="press-prompt">{current.text[lang]}</p>
            </div>
          </div>
          <div className="matchday-answer-grid presser-answers">
            {current.answers.map((item) => (
              <button key={item.id} onClick={() => answer(current.id, item.id)}>
                <b>{item.style[lang]}</b>
                <span>{quote(item.line[lang], lang)}</span>
                <PressEffects answer={item} ru={ru} />
              </button>
            ))}
          </div>
        </div>
      )}
      {complete && (
        <div className="press-consequence presser-summary">
          <CheckCircle2 size={26} />
          <div>
            <b>
              {ru
                ? "Медиа-обязательства выполнены"
                : "Media obligations complete"}
            </b>
            <p>
              {ru
                ? `Ответов: ${entries.length}. Итог для клуба:`
                : `${entries.length} answers given. Net effect on the club:`}
            </p>
            <PressEffects
              ru={ru}
              answer={{ fan: totals.fan, board: totals.board, morale: totals.morale }}
            />
            {totals.players.length > 0 && (
              <p className="presser-players">
                {totals.players
                  .map((item) => `${item.name} ${signed(item.delta)}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
