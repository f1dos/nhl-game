import { Color } from "three";
import type { Team } from "../engine/types";
import type { TeamKit } from "./hockeyRig";

const shade = (hex: string, amount: number) => `#${new Color(hex).multiplyScalar(amount).getHexString()}`;
/** Home plays in its colour, away in a light kit trimmed in its own colour. */
export const kitFor = (team: Pick<Team, "id" | "color" | "logoUrl">, away: boolean): TeamKit => away
  ? { jersey: "#e8edf3", trim: team.color, pants: shade(team.color, 0.55), helmet: "#f0f1ee", socks: team.color, logo: team.logoUrl, abbr: team.id }
  : { jersey: team.color, trim: "#f4f6f8", pants: "#10161e", helmet: shade(team.color, .78), socks: team.color, logo: team.logoUrl, abbr: team.id };

