import {translateEnglish as englishText} from "../i18n/englishMatch";
import MediaDesk from "./MediaDesk";
import { useMemo, useState } from "react";
import { ArrowRight, Radio } from "lucide-react";
import { dateForRound } from "../engine/season";
import type { Game, Result } from "../engine/types";
import { Crest } from "./components";

type Story = {
  id: string;
  home: string;
  away: string;
  date: string;
  result?: Result;
  exhibition: boolean;
};
export default function LeagueNews({ game: g }: { game: Game }) {
  const ru = g.language === "ru",
    tr = (r: string, e: string) => (ru ? r : e);
  const [filter, setFilter] = useState("all"),
    [selected, select] = useState("");
  const teams = new Map(g.teams.map((t) => [t.id, t]));
  const stories = useMemo(() => {
    const fixtures: Story[] = [
      ...(g.preseasonFixtures ?? []).map((f) => ({ ...f, exhibition: true })),
      ...g.schedule.map((f) => ({
        ...f,
        date:
          f.result?.date ?? dateForRound(g, f.round).toISOString().slice(0, 10),
        exhibition: false,
      })),
    ];
    return fixtures
      .filter((f) => f.result || f.date >= (g.calendar?.date ?? ""))
      .sort(
        (a, b) =>
          Number(!!b.result) - Number(!!a.result) ||
          (a.result
            ? b.date.localeCompare(a.date)
            : a.date.localeCompare(b.date)) ||
          a.id.localeCompare(b.id),
      );
  }, [g.schedule, g.preseasonFixtures, g.calendar?.date, g.year, g.round]);
  const items = stories.filter((f) =>
    filter === "club"
      ? [f.home, f.away].includes(g.user)
      : filter === "next"
        ? !f.result
        : true,
  );
  const lead = items.find((f) => f.id === selected) ?? items[0];
  const date = (s: string) =>
    new Intl.DateTimeFormat(ru ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(s + "T12:00:00Z"));
  function title(f: Story) {
    const r = f.result;
    if (!r) return f.away + " " + tr("в гостях у", "visits") + " " + f.home;
    const winner = r.goals[0] > r.goals[1] ? f.home : f.away,
      loser = winner === f.home ? f.away : f.home;
    return (
      winner +
      " " +
      tr("обыгрывает", "beats") +
      " " +
      loser +
      (r.so
        ? tr(" по буллитам", " in a shootout")
        : r.ot
          ? tr(" в овертайме", " in overtime")
          : "")
    );
  }
  const filters = [
    ["all", tr("Вся лига", "League")],
    ["club", tr("Мой клуб", "My club")],
    ["next", tr("Афиша", "Coming up")],
  ];
  const dispatches = [
    ...(g.transactions ?? [])
      .slice(-12)
      .reverse()
      .map((x) => x.year + " · " + (ru ? x.message : englishText(x.message))),
    ...(g.contractHistory ?? [])
      .slice(-8)
      .reverse()
      .map(
        (x) =>
          x.team +
          " · " +
          x.player +
          " · " +
          tr("Контракт", "Contract") +
          " · " +
          x.years +
          tr(" г.", " yr") +
          " / $" +
          x.salary.toFixed(2) +
          "M",
      ),
  ];
  const fixtures = stories.filter((f) => !f.result).slice(0, 5);
  return (
    <section className="league-wire">
      <header className="wire-head">
        <div>
          <small>
            <Radio size={15} /> NHL · {g.year}/{String(g.year + 1).slice(-2)}
          </small>
          <h1>{tr("Новости лиги", "League news")}</h1>
        </div>
        <time>{g.calendar?.date && date(g.calendar.date)}</time>
      </header>
      <MediaDesk game={g}/>
      <h2>{tr("Матч-центр","Match centre")}</h2>
      <div className="desk-switch">
        {filters.map(([k, n]) => (
          <button
            key={k}
            aria-pressed={filter === k}
            onClick={() => {
              setFilter(k);
              select("");
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {lead ? (
        <div className="wire-layout">
          <article className="wire-feature" aria-live="polite">
            <div
              className="wire-match"
              style={{
                background: `linear-gradient(115deg,${teams.get(lead.away)?.color ?? "#204060"},#112033 49%,${teams.get(lead.home)?.color ?? "#243950"})`,
              }}
            >
              {[lead.away, lead.home].map((id) => (
                <div key={id}>
                  {teams.get(id) && <Crest team={teams.get(id)!} size={80} />}
                  <b>{id}</b>
                </div>
              ))}
              <strong>
                {lead.result
                  ? lead.result.goals.slice().reverse().join(" : ")
                  : "VS"}
              </strong>
            </div>
            <div className="wire-copy">
              <small>
                {date(lead.date)} ·{" "}
                {lead.exhibition
                  ? tr("Предсезонка", "Preseason")
                  : tr("Регулярный сезон", "Regular season")}
              </small>
              <h2>{title(lead)}</h2>
              {lead.result ? (
                <>
                  <p>
                    {tr("Броски в створ", "Shots on goal")} · {lead.away}{" "}
                    {lead.result.shots[1]} — {lead.result.shots[0]} {lead.home}
                  </p>
                  {lead.result.events
                    .filter((e) => e.type === "goal")
                    .slice(-3)
                    .map((e, i) => (
                      <div className="wire-line" key={i}>
                        <b>{e.team}</b>
                        {e.player}{e.assists?.length?" ("+e.assists.join(", ")+")":""} · {Math.floor(e.time/60)}:{String(Math.floor(e.time)%60).padStart(2,"0")}
                        <span>{e.score.join(" : ")}</span>
                      </div>
                    ))}
                </>
              ) : (
                <div>
                  {[lead.away, lead.home].map((id) => {
                    const t = teams.get(id);
                    return (
                      t && (
                        <div className="wire-line" key={id}>
                          <b>{id}</b>
                          {t.city} {t.name}
                          <span>
                            {t.record.pts} {tr("очк.", "PTS")} / {t.record.gp}{" "}
                            GP
                          </span>
                        </div>
                      )
                    );
                  })}
                  <h3 className="wire-duel-title">
                    {tr("На кого смотреть", "Players to watch")}
                  </h3>
                  <div className="wire-duel">
                    {[lead.away, lead.home].map((id) => {
                      const roster = teams.get(id)?.players ?? [];
                      const star = roster
                        .filter((p) => !p.injury && p.pos !== "G")
                        .sort(
                          (a, b) =>
                            b.stats.g + b.stats.a - a.stats.g - a.stats.a ||
                            b.ovr - a.ovr,
                        )[0];
                      return (
                        star && (
                          <div key={id}>
                            <small>
                              {id} · {star.pos}
                            </small>
                            <b>{star.name}</b>
                            <span>
                              {star.stats.g} G · {star.stats.a} A · {star.ovr}{" "}
                              OVR
                            </span>
                          </div>
                        )
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </article>
          <aside>
            <h3>{tr("Лента событий", "News feed")}</h3>
            <div className="wire-list">
              {items.slice(0, 36).map((f) => (
                <button
                  key={f.id}
                  aria-pressed={f.id === lead.id}
                  onClick={() => select(f.id)}
                >
                  <small>
                    {date(f.date)} ·{" "}
                    {f.result
                      ? f.result.goals.join(" : ")
                      : tr("Перед матчем", "Preview")}
                  </small>
                  <b>{title(f)}</b>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : (
        <p>{tr("В календаре пока нет событий.", "No fixtures available.")}</p>
      )}
      <div className="wire-bottom">
        <section>
          <h3>{tr("На подходе", "On the schedule")}</h3>
          {fixtures.map((f) => (
            <button
              className="wire-line"
              key={f.id}
              onClick={() => {
                setFilter("next");
                select(f.id);
              }}
            >
              <b>{date(f.date)}</b>
              {f.away} @ {f.home}
              <ArrowRight size={15} />
            </button>
          ))}
        </section>
        <section>
          <h3>{tr("Гонка за лидерство", "Standings watch")}</h3>
          {g.teams.some((t) => t.record.gp) ? (
            [...g.teams]
              .filter((t) => t.record.gp)
              .sort(
                (a, b) =>
                  b.record.pts - a.record.pts || a.record.gp - b.record.gp,
              )
              .slice(0, 5)
              .map((t) => (
                <div className="wire-line" key={t.id}>
                  <Crest team={t} size={23} />
                  {t.name}
                  <span>{t.record.pts} PTS</span>
                </div>
              ))
          ) : (
            <p>
              {tr(
                "Первые результаты регулярного сезона откроют гонку за лидерство.",
                "The standings race begins with the first regular-season results.",
              )}
            </p>
          )}
        </section>
      </div>
      {dispatches.length > 0 && (
        <section className="wire-dispatch">
          <h3>{tr("Хроника лиги", "Around the league")}</h3>
          <ol>
            {dispatches.slice(0, 5).map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ol>
          {dispatches.length > 5 && (
            <details>
              <summary>
                {tr("Предыдущие сообщения", "Earlier dispatches")}
              </summary>
              <ol>
                {dispatches.slice(5).map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}
    </section>
  );
}
