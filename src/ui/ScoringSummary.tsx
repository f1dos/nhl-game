import type { Event } from "../engine/types";

export default function ScoringSummary({
  events,
  ru,
}: {
  events?: Event[];
  ru: boolean;
}) {
  const goals = events?.filter(
    (e) => e.type === "goal" || e.type === "shootout",
  );
  if (!goals?.length) return null;
  return (
    <details className="calendar-protocol">
      <summary>{ru ? "Протокол голов" : "Scoring summary"}</summary>
      {goals.map((e, i) => {
        const seconds = Math.floor(e.time);
        const period =
          seconds <= 3600
            ? String(Math.min(3, Math.max(1, Math.ceil(seconds / 1200))))
            : "OT";
        const elapsed = seconds > 0 ? ((seconds - 1) % 1200) + 1 : 0;
        const time =
          e.type === "shootout"
            ? "SO"
            : period +
              " · " +
              Math.floor(elapsed / 60) +
              ":" +
              String(elapsed % 60).padStart(2, "0");
        return (
          <p key={i}>
            <b>
              {e.score.join("–")} · {e.team}
            </b>
            <br />
            {time} · {e.player}
            {e.assists?.length ? " (" + e.assists.join(", ") + ")" : ""}
          </p>
        );
      })}
    </details>
  );
}
