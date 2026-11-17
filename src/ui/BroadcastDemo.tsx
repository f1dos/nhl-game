import { useMemo, useState } from "react";
import { newGame } from "../engine/database";
import type { Game } from "../engine/types";
import SpatialMatchCenter from "./SpatialMatchCenter";

/**
 * Stand-alone match broadcast for previews (`?demo=broadcast`): a live game
 * between two real clubs without a career or saves. Choose clubs with
 * `?home=TOR&away=MTL`.
 */
export default function BroadcastDemo() {
  const params = new URLSearchParams(location.search);
  const [round, setRound] = useState(0);
  const game = useMemo<Game>(() => {
    const home = params.get("home")?.toUpperCase() ?? "TOR";
    const g = newGame(home, 260027 + round * 7919);
    g.language = params.get("lang") === "en" ? "en" : "ru";
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);
  const away = params.get("away")?.toUpperCase() ?? "MTL";
  const homeTeam = game.teams.find((t) => t.id === game.user) ?? game.teams[0];
  const awayTeam =
    game.teams.find((t) => t.id === away && t.id !== homeTeam.id) ??
    game.teams.find((t) => t.id !== homeTeam.id)!;
  return (
    <SpatialMatchCenter
      key={round}
      game={game}
      home={homeTeam}
      away={awayTeam}
      edit={(fn) => fn(game)}
      onComplete={() => setRound((r) => r + 1)}
      finishLabel={game.language === "en" ? "Play another game" : "Сыграть ещё матч"}
    />
  );
}
