import { Star } from "lucide-react";
import type { Game, Player, Result, Team } from "../engine/types";
import { AWARDS, awardRace, REGULAR_AWARDS, type SeasonAward } from "../engine/awards";
import { Crest, RatingBadge } from "./components";

const STAR_LABELS = [
  ["Первая звезда", "First star"],
  ["Вторая звезда", "Second star"],
  ["Третья звезда", "Third star"],
];

function matchLine(player: Player, result: Result) {
  const goals = result.events.filter((e) => e.type === "goal" && e.playerId === player.id).length;
  if (player.pos === "G") return "";
  return goals ? `${goals} G` : "";
}

/** Three stars and every player's rating for one finished game. */
export function MatchRatingsPanel({ game, result }: { game: Game; result: Result }) {
  const ru = game.language === "ru";
  const ratings = result.ratings;
  if (!ratings || !Object.keys(ratings).length) return null;
  const teams = [result.away, result.home].map((id) => game.teams.find((t) => t.id === id)!);
  const find = (id: string) => {
    for (const team of teams) {
      const player = team?.players.find((p) => p.id === id);
      if (player) return { player, team };
    }
    return undefined;
  };
  const stars = (result.stars ?? []).map(find).filter(Boolean) as { player: Player; team: Team }[];
  return (
    <section className="match-ratings" aria-label={ru ? "Оценки за матч" : "Match ratings"}>
      <header>
        <span className="eyebrow">{ru ? "ИТОГИ МАТЧА" : "MATCH REPORT"}</span>
        <h2>{ru ? "Три звезды и оценки игроков" : "Three stars and player ratings"}</h2>
      </header>
      <div className="three-stars">
        {stars.map(({ player, team }, index) => (
          <article key={player.id} className={`star-card star-${index + 1}`}>
            <span className="star-rank">
              {Array.from({ length: 3 - index }, (_, i) => (
                <Star key={i} size={14} fill="currentColor" />
              ))}
            </span>
            <small>{STAR_LABELS[index][ru ? 0 : 1]}</small>
            <b>{player.name}</b>
            <span className="star-club">
              <Crest team={team} size={20} /> {team.id} · {player.pos} {matchLine(player, result)}
            </span>
            <RatingBadge value={ratings[player.id]} size="lg" />
          </article>
        ))}
      </div>
      <div className="rating-columns">
        {teams.map((team) =>
          team ? (
            <div key={team.id} className="rating-column">
              <h3>
                <Crest team={team} size={22} /> {team.city} {team.name}
              </h3>
              <ol>
                {team.players
                  .filter((p) => ratings[p.id] !== undefined)
                  .sort((a, b) => ratings[b.id] - ratings[a.id] || a.name.localeCompare(b.name))
                  .map((p) => (
                    <li key={p.id}>
                      <span className="position">{p.pos}</span>
                      <span className="rating-name">
                        {p.name}
                        {result.stars?.includes(p.id) && (
                          <Star size={12} fill="currentColor" className="inline-star" aria-label="star" />
                        )}
                      </span>
                      <RatingBadge value={ratings[p.id]} />
                    </li>
                  ))}
              </ol>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

/** Live race for the regular-season trophies (top three per award). */
export function AwardRace({ game, onPlayer }: { game: Game; onPlayer: (p: Player) => void }) {
  const ru = game.language === "ru";
  return (
    <div className="award-race">
      {REGULAR_AWARDS.map((key) => {
        const leaders = awardRace(game, key, 3);
        return (
          <article key={key}>
            <header>
              <b>{AWARDS[key][ru ? "ru" : "en"]}</b>
              <small>{ru ? AWARDS[key].aboutRu : AWARDS[key].aboutEn}</small>
            </header>
            {leaders.length ? (
              <ol>
                {leaders.map((entry) => (
                  <li key={entry.player.id}>
                    <button className="award-player" onClick={() => onPlayer(entry.player)}>
                      <Crest team={entry.team} size={20} />
                      <span>
                        <b>{entry.player.name}</b>
                        <small>{entry.line}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">{ru ? "Пока нет кандидатов" : "No candidates yet"}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** Award winners grouped by season, newest first. */
export function AwardHistory({ game, awards }: { game: Game; awards: SeasonAward[] }) {
  const ru = game.language === "ru";
  const years = [...new Set(awards.map((a) => a.year))].sort((a, b) => b - a);
  return (
    <div className="award-history">
      {years.map((year) => (
        <section key={year}>
          <h3>
            {year}/{String(year + 1).slice(2)}
          </h3>
          <ul>
            {awards
              .filter((a) => a.year === year)
              .map((a) => {
                const team = game.teams.find((t) => t.id === a.team);
                return (
                  <li key={a.key} className={a.team === game.user ? "own" : ""}>
                    <span className="award-name">
                      <b>{AWARDS[a.key][ru ? "ru" : "en"]}</b>
                      <small>{ru ? AWARDS[a.key].aboutRu : AWARDS[a.key].aboutEn}</small>
                    </span>
                    <span className="award-winner">
                      {team && <Crest team={team} size={20} />}
                      <b>{a.player}</b>
                      <small>{a.line}</small>
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
