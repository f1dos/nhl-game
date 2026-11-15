import { useState } from "react";
import { Mic2, Radio, Users } from "lucide-react";
import type { Game, PressAppearance } from "../engine/types";
import { clamp } from "../engine/random";
import { Crest } from "./components";

type Edit = (fn: (game: Game) => void) => void;

const answers: {
  tone: PressAppearance["tone"];
  title: string;
  line: string;
  fan: number;
  board: number;
  morale: number;
}[] = [
  {
    tone: "protective",
    title: "Защитить команду",
    line: "Ответственность на мне. Игроки получают от штаба полную поддержку.",
    fan: 0,
    board: -1,
    morale: 2,
  },
  {
    tone: "balanced",
    title: "Спокойный анализ",
    line: "Мы понимаем сильные стороны соперника и готовы придерживаться нашего плана.",
    fan: 1,
    board: 1,
    morale: -1,
  },
  {
    tone: "ambitious",
    title: "Поднять ставки",
    line: "От этой команды ждут победы. Мы выходим за результатом и не ищем оправданий.",
    fan: 2,
    board: 1,
    morale: -1,
  },
];

export default function PressCenter({
  game,
  edit,
}: {
  game: Game;
  edit: Edit;
}) {
  const [type, setType] = useState<PressAppearance["type"]>(
    game.last ? "post-match" : "pre-match",
  );
  const [result, setResult] = useState<PressAppearance>();
  const team = game.teams.find((club) => club.id === game.user)!;
  const used = game.pressHistory?.some(
    (item) => item.date === game.calendar?.date && item.type === type,
  );
  const submit = (answer: (typeof answers)[number]) => {
    const appearance: PressAppearance = {
      date: game.calendar!.date,
      type,
      tone: answer.tone,
      headline: answer.line,
      fanDelta: answer.fan,
      boardDelta: answer.board,
      moraleDelta: answer.morale,
    };
    edit((current) => {
      current.pressHistory ??= [];
      current.pressHistory.unshift(appearance);
      const fans = current.fans?.[current.user];
      if (fans) {
        fans.happiness = clamp(fans.happiness + answer.fan, 0, 100);
        fans.engagement = clamp(
          fans.engagement + Math.sign(answer.fan),
          0,
          100,
        );
        fans.lastChange = "Пресс-конференция GM";
      }
      if (current.managerEmployment)
        current.managerEmployment.confidence = clamp(
          current.managerEmployment.confidence + answer.board,
          0,
          100,
        );
      current.teams
        .find((club) => club.id === current.user)!
        .players.slice(0, 8)
        .forEach((player) => {
          player.morale = clamp(player.morale + answer.morale, 0, 100);
        });
    });
    setResult(appearance);
  };
  return (
    <div className="press-center">
      <div className="page-intro">
        <div>
          <span className="eyebrow">MEDIA ROOM</span>
          <h1>Пресс-центр</h1>
          <p>
            Предматчевые и послематчевые ответы влияют на ожидания фанатов,
            раздевалку и руководство.
          </p>
        </div>
        <Radio size={34} />
      </div>
      <div className="tabs">
        <button
          className={type === "pre-match" ? "active" : ""}
          onClick={() => {
            setType("pre-match");
            setResult(undefined);
          }}
        >
          Перед матчем
        </button>
        <button
          className={type === "post-match" ? "active" : ""}
          onClick={() => {
            setType("post-match");
            setResult(undefined);
          }}
        >
          После матча
        </button>
      </div>
      <section className="press-room">
        <header>
          <Crest team={team} size={58} />
          <div>
            <small>{game.calendar?.date} · NHL MEDIA AVAILABILITY</small>
            <h2>
              {type === "pre-match"
                ? "Последний вопрос перед игрой"
                : "Итоги матча"}
            </h2>
          </div>
          <span>
            <Mic2 size={16} /> LIVE
          </span>
        </header>
        <div className="press-question">
          <Users size={22} />
          <p>
            {type === "pre-match"
              ? "Какой сигнал вы хотите отправить команде и болельщикам перед сегодняшним матчем?"
              : "Как вы оцениваете выступление команды и что скажете раздевалке после матча?"}
          </p>
        </div>
        {!used && !result ? (
          <div className="press-answers">
            {answers.map((answer) => (
              <button key={answer.tone} onClick={() => submit(answer)}>
                <b>{answer.title}</b>
                <span>«{answer.line}»</span>
                <small>
                  Фанаты {answer.fan >= 0 ? "+" : ""}
                  {answer.fan} · руководство {answer.board >= 0 ? "+" : ""}
                  {answer.board} · мораль {answer.morale >= 0 ? "+" : ""}
                  {answer.morale}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <div className="press-result">
            <Mic2 size={26} />
            <div>
              <b>Комментарий опубликован</b>
              <p>
                «
                {result?.headline ??
                  game.pressHistory?.find(
                    (item) =>
                      item.date === game.calendar?.date && item.type === type,
                  )?.headline}
                »
              </p>
            </div>
          </div>
        )}
      </section>
      <section className="press-history">
        <h3>Последние выступления</h3>
        {(game.pressHistory ?? []).slice(0, 8).map((item, index) => (
          <p key={`${item.date}-${index}`}>
            <time>{item.date}</time>
            <b>{item.type === "pre-match" ? "До матча" : "После матча"}</b>
            <span>{item.headline}</span>
          </p>
        ))}
      </section>
    </div>
  );
}
