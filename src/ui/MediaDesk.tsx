import { useMemo, useState } from "react";
import { mediaFeed, type Beat } from "../engine/media";
import type { Game } from "../engine/types";

const sections = {
  all: ["Все материалы", "All stories"],
  market: ["Слухи", "Rumours"],
  analysis: ["Аналитика", "Analysis"],
  interview: ["Интервью", "Interviews"],
  league: ["События", "League desk"],
} as const;
export default function MediaDesk({ game }: { game: Game }) {
  const [beat, change] = useState<Beat | "all">("all"),
    [own, scope] = useState(false),
    [limit, show] = useState(6);
  const index = game.language === "ru" ? 0 : 1,
    ru = !index;
  const feed = useMemo(() => mediaFeed(game), [game]);
  const rows = feed.filter(
    (x) =>
      (beat === "all" || beat === x.beat) &&
      (!own || x.clubs.includes(game.user)),
  );
  return (
    <section className="media-desk">
      <header>
        <h2>{ru ? "Вокруг лиги" : "Around the league"}</h2>
        <label>
          <input
            type="checkbox"
            checked={own}
            onChange={(e) => {
              scope(e.target.checked);
              show(6);
            }}
          />
          {ru ? "Только мой клуб" : "My club only"}
        </label>
      </header>
      <div className="desk-switch">
        {(Object.keys(sections) as (keyof typeof sections)[]).map((k) => (
          <button
            key={k}
            aria-pressed={k === beat}
            onClick={() => {
              change(k);
              show(6);
            }}
          >
            {sections[k][index]}
          </button>
        ))}
      </div>
      <div className="media-grid">
        {rows.slice(0, limit).map((s) => (
          <article className={"media-story beat-" + s.beat} key={s.id}>
            <div className="media-byline">
              <b>{sections[s.beat][index]}</b>
              <time dateTime={s.date}>{s.date}</time>
            </div>
            <small>{s.clubs.join(" / ")}</small>
            <h3>{s.headline[index]}</h3>
            <p>{s.body[index]}</p>
            {s.question && (
              <p className="media-question">{s.question[index]}</p>
            )}
            {s.quote && <blockquote>«{s.quote[index]}»</blockquote>}
          </article>
        ))}
      </div>
      {!rows.length && (
        <p>
          {ru
            ? "В этой рубрике пока нет публикаций по выбранным клубам."
            : "No coverage for the selected clubs yet."}
        </p>
      )}
      {rows.length > limit && (
        <button className="media-older" onClick={() => show(limit + 9)}>
          {ru ? "Более ранние публикации" : "Earlier stories"}
        </button>
      )}
    </section>
  );
}
