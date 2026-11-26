import { useState } from "react";
import { Mic2, Radio } from "lucide-react";
import type { Game, PressAppearance } from "../engine/types";
import { pressAppearanceText, pressOpponentId } from "../engine/press";
import { Crest } from "./components";
import { quote } from "../engine/dialogueText";
import PressConference from "./PressConference";

type Edit = (fn: (game: Game) => void) => void;

/**
 * Media room: the same multi-question conference as on matchday, reachable
 * from the office, plus the recent press history in the current language.
 */
export default function PressCenter({
  game,
  edit,
}: {
  game: Game;
  edit: Edit;
}) {
  const ru = game.language === "ru";
  const [type, setType] = useState<PressAppearance["type"]>(
    game.last ? "post-match" : "pre-match",
  );
  const team = game.teams.find((club) => club.id === game.user)!;
  const date = game.calendar?.date ?? "";
  const opponentId =
    type === "post-match" && !game.last
      ? undefined
      : pressOpponentId(game, type);
  const opponent = game.teams.find((club) => club.id === opponentId);
  const available = !!opponent;
  return (
    <div className="press-center">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{ru ? "Медиа клуба" : "Club media"}</span>
          <h1>{ru ? "Пресс-центр" : "Press room"}</h1>
          <p>
            {ru
              ? "Журналисты задают вопросы по ситуации в команде. Ответы влияют на ожидания фанатов, раздевалку, руководство и отдельных игроков."
              : "Reporters ask about what is actually happening around the team. Your answers move fan expectations, the dressing room, the board and individual players."}
          </p>
        </div>
        <Radio size={34} />
      </div>
      <div className="tabs">
        <button
          className={type === "pre-match" ? "active" : ""}
          onClick={() => setType("pre-match")}
        >
          {ru ? "Перед матчем" : "Pre-match"}
        </button>
        <button
          className={type === "post-match" ? "active" : ""}
          onClick={() => setType("post-match")}
        >
          {ru ? "После матча" : "Post-match"}
        </button>
      </div>
      <section className="press-room">
        <header>
          <Crest team={team} size={58} />
          <div>
            <small>
              {date} · {ru ? "МЕДИА-ДОСТУП" : "MEDIA AVAILABILITY"}
              {opponent ? ` · vs ${opponent.city} ${opponent.name}` : ""}
            </small>
            <h2>
              {type === "pre-match"
                ? ru
                  ? "Вопросы перед игрой"
                  : "Questions before the game"
                : ru
                  ? "Итоги матча"
                  : "After the game"}
            </h2>
          </div>
          <span>
            <Mic2 size={16} /> {date}
          </span>
        </header>
        <div className="press-room-body">
          {available ? (
            <PressConference game={game} edit={edit} type={type} date={date} />
          ) : (
            <p className="press-question">
              {type === "post-match"
                ? ru
                  ? "Сыгранных матчей пока нет — журналистам нечего обсуждать."
                  : "No game has been played yet, so there is nothing to discuss."
                : ru
                  ? "Ближайший соперник пока не определён."
                  : "There is no upcoming opponent yet."}
            </p>
          )}
        </div>
      </section>
      <section className="press-history">
        <h3>{ru ? "Последние выступления" : "Recent appearances"}</h3>
        {(game.pressHistory ?? []).slice(0, 10).map((item, index) => {
          const text = pressAppearanceText(item, game.language);
          return (
            <p key={`${item.date}-${index}`}>
              <time>{item.date}</time>
              <b>
                {item.type === "pre-match"
                  ? ru
                    ? "До матча"
                    : "Pre-match"
                  : ru
                    ? "После матча"
                    : "Post-match"}
              </b>
              <span>
                {text.outlet ? <em>{text.outlet}: </em> : null}{quote(text.headline, game.language)}
              </span>
            </p>
          );
        })}
      </section>
    </div>
  );
}
