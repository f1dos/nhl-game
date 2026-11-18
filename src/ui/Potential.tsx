import type { Game, Player } from "../engine/types";
import {
  formatPotential,
  scoutedPotentialFor,
  type ScoutedPotential,
} from "../engine/potential";
import { useEntityLinks } from "./links";

/** Five stars with half steps, FM style. */
export function PotentialStars({
  stars,
  size = "sm",
}: {
  stars: number;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={`pot-stars ${size}`}
      role="img"
      aria-label={`${stars}/5`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, stars - i));
        return (
          <span
            key={i}
            className={`pot-star ${fill >= 1 ? "full" : fill > 0 ? "half" : "empty"}`}
          />
        );
      })}
    </span>
  );
}

/** Stars + scouted range, e.g. ★★★★☆ 78–86. */
export function PotentialView({
  value,
  compact = false,
}: {
  value: ScoutedPotential;
  compact?: boolean;
}) {
  return (
    <span className={`pot-view ${compact ? "compact" : ""}`}>
      <PotentialStars stars={value.stars} />
      <b>{formatPotential(value)}</b>
    </span>
  );
}

/** Table cell for any player; uses the career from link context or `game`. */
export function PotentialCell({
  player,
  game,
  compact,
}: {
  player: Player;
  game?: Game;
  compact?: boolean;
}) {
  const links = useEntityLinks();
  const g = game ?? links?.game;
  return (
    <PotentialView value={scoutedPotentialFor(g, player)} compact={compact} />
  );
}

export function PotentialLegend({ ru }: { ru: boolean }) {
  return (
    <p className="pot-legend">
      <PotentialStars stars={3.5} />
      <span>
        {ru
          ? "POT — потолок по оценке штаба. Диапазон сужается, когда игрок в вашем клубе или его изучили скауты. ★5 ≈ 95+, ★4 ≈ 88, ★3 ≈ 80, ★2 ≈ 72."
          : "POT is the staff's estimate of a player's ceiling. The range narrows for your own players and well-scouted ones. ★5 ≈ 95+, ★4 ≈ 88, ★3 ≈ 80, ★2 ≈ 72."}
      </span>
    </p>
  );
}

export const potentialSortValue = (g: Game | undefined, player: Player) =>
  scoutedPotentialFor(g, player).mid;
