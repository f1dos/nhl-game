import {
  createContext,
  useContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { Game, Player, Team } from "../engine/types";
import { Crest } from "./components";

/**
 * App-wide navigation to player cards and club pages.
 *
 * The App mounts one <EntityLinkProvider>; any component can then render
 * <PlayerLink> / <ClubLink> (or call useEntityLinks()) without threading
 * callbacks through every page. Outside a provider the links degrade to plain
 * text, so isolated renders (tests, previews) keep working.
 */
export interface EntityLinks {
  game: Game;
  openPlayer: (player: Player | string) => void;
  openClub: (teamId: string) => void;
}

const LinkContext = createContext<EntityLinks | null>(null);

export function EntityLinkProvider({
  value,
  children,
}: {
  value: EntityLinks;
  children: ReactNode;
}) {
  return <LinkContext.Provider value={value}>{children}</LinkContext.Provider>;
}

export function useEntityLinks() {
  return useContext(LinkContext);
}

/** Every player the save knows about, wherever they currently live. */
export function findPlayer(game: Game, id: string): Player | undefined {
  for (const team of game.teams)
    for (const list of [team.players, team.farm ?? [], team.prospects ?? []]) {
      const found = list.find((player) => player.id === id);
      if (found) return found;
    }
  return (
    game.freeAgents?.find((player) => player.id === id) ??
    game.juniorPlayers?.find((player) => player.id === id) ??
    game.internationalMarket?.find((item) => item.player.id === id)?.player ??
    game.draft?.prospects.find((item) => item.player.id === id)?.player ??
    game.retired?.find((item) => item.player.id === id)?.player
  );
}

/** Club that holds the player's rights (NHL roster, AHL or reserve list). */
export function playerClub(game: Game, id: string): Team | undefined {
  return game.teams.find((team) =>
    [...team.players, ...(team.farm ?? []), ...(team.prospects ?? [])].some(
      (player) => player.id === id,
    ),
  );
}

/** Resolves "TOR", "Toronto Maple Leafs" or "Maple Leafs" to a club. */
export function findClub(game: Game, key?: string): Team | undefined {
  if (!key) return undefined;
  const value = key.trim().toLowerCase();
  return game.teams.find(
    (team) =>
      team.id.toLowerCase() === value ||
      `${team.city} ${team.name}`.toLowerCase() === value ||
      team.name.toLowerCase() === value,
  );
}

function activate(event: KeyboardEvent, run: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    run();
  }
}

function linkProps(label: string, run: () => void) {
  return {
    role: "link" as const,
    tabIndex: 0,
    title: label,
    onClick: (event: MouseEvent) => {
      // Links often live inside clickable rows/cards: open only the link.
      event.stopPropagation();
      event.preventDefault();
      run();
    },
    onKeyDown: (event: KeyboardEvent) => activate(event, run),
  };
}

/**
 * Clickable player name. Pass the player object or just an id (`id` + `name`).
 * Renders a span with role="link" so it is valid inside buttons and rows.
 */
export function PlayerLink({
  player,
  id,
  name,
  children,
  className = "",
}: {
  player?: Player;
  id?: string;
  name?: string;
  children?: ReactNode;
  className?: string;
}) {
  const links = useEntityLinks();
  const playerId = player?.id ?? id;
  const label = name ?? player?.name ?? "";
  const content = children ?? label;
  if (!links || !playerId) return <span className={className}>{content}</span>;
  const target = player ?? findPlayer(links.game, playerId);
  if (!target) return <span className={className}>{content}</span>;
  const ru = links.game.language === "ru";
  return (
    <span
      className={`entity-link player-link ${className}`}
      {...linkProps(
        `${ru ? "Карточка игрока" : "Player card"}: ${target.name}`,
        () => links.openPlayer(target),
      )}
    >
      {content}
    </span>
  );
}

/**
 * Clickable club. `label` picks the default text: full name, city or the
 * three-letter id; `crest` prepends the club crest.
 */
export function ClubLink({
  team,
  id,
  label = "full",
  crest,
  children,
  className = "",
}: {
  team?: Team;
  id?: string;
  label?: "full" | "name" | "city" | "id";
  crest?: number;
  children?: ReactNode;
  className?: string;
}) {
  const links = useEntityLinks();
  const club = team ?? (links ? findClub(links.game, id) : undefined);
  const text = club
    ? label === "id"
      ? club.id
      : label === "city"
        ? club.city
        : label === "name"
          ? club.name
          : `${club.city} ${club.name}`
    : (id ?? "");
  const content = (
    <>
      {crest && club ? <Crest team={club} size={crest} /> : null}
      {children ?? text}
    </>
  );
  if (!links || !club)
    return (
      <span className={`${crest ? "club-link-static" : ""} ${className}`}>
        {content}
      </span>
    );
  const ru = links.game.language === "ru";
  return (
    <span
      className={`entity-link club-link ${crest ? "with-crest" : ""} ${className}`}
      style={{ "--club": club.color } as React.CSSProperties}
      {...linkProps(
        `${ru ? "Страница клуба" : "Club page"}: ${club.city} ${club.name}`,
        () => links.openClub(club.id),
      )}
    >
      {content}
    </span>
  );
}

/**
 * Compact chips under an inbox/news item: the player and club it refers to
 * (explicit ids first, then club ids/names mentioned in the text).
 */
export function EventLinks({
  playerId,
  teamId,
  text = "",
}: {
  playerId?: string;
  teamId?: string;
  text?: string;
}) {
  const links = useEntityLinks();
  if (!links) return null;
  const players: Player[] = [];
  const explicit = playerId ? findPlayer(links.game, playerId) : undefined;
  if (explicit) players.push(explicit);
  // Names mentioned in the text (e.g. a medical report listing the injured).
  if (text)
    for (const team of links.game.teams) {
      if (players.length >= 4) break;
      for (const candidate of [...team.players, ...(team.farm ?? [])]) {
        if (players.length >= 4) break;
        if (
          candidate.name.length > 4 &&
          !players.some((known) => known.id === candidate.id) &&
          text.includes(candidate.name)
        )
          players.push(candidate);
      }
    }
  const clubs = new Set<string>();
  if (teamId && findClub(links.game, teamId)) clubs.add(teamId);
  if (explicit) {
    const owner = playerClub(links.game, explicit.id);
    if (owner) clubs.add(owner.id);
  }
  for (const team of links.game.teams) {
    if (clubs.size >= 3) break;
    if (
      new RegExp(`\\b${team.id}\\b`).test(text) ||
      text.includes(`${team.city} ${team.name}`)
    )
      clubs.add(team.id);
  }
  if (!players.length && !clubs.size) return null;
  return (
    <span className="event-links">
      {players.map((player) => (
        <PlayerLink key={player.id} player={player} className="entity-chip">
          {player.name}
        </PlayerLink>
      ))}
      {[...clubs].map((id) => (
        <ClubLink key={id} id={id} crest={16} label="id" className="entity-chip" />
      ))}
    </span>
  );
}
