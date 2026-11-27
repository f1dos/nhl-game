import type { Game, Player } from "./types";

export function playerTrades(g: Game, p: Player) {
  return (g.transactions ?? []).filter(entry => {
    if (entry.playerIds) return entry.playerIds.includes(p.id);
    // Legacy deals stored two asset lists or two acquisition sentences.
    const sides = entry.message.split("; ");
    if (sides.length !== 2) return false;
    return sides.some(side => {
      const assets = /^\S+ → \S+: (.+)$/.exec(side)?.[1];
      if (assets) return assets.split(", ").includes(p.name);
      return /^\S+ (?:получает|acquire) (.+)$/.exec(side)?.[1] === p.name;
    });
  });
}
