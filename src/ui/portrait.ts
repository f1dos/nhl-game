import extraFaces from "../assets/regen-portraits-expansion.json";
import faces from "../assets/regen-portraits.json";
import { stableHash } from "../engine/potential";
import type { Player } from "../engine/types";

const allFaces = [...faces, ...extraFaces];

export function portraitUrl(p: Player) {
  if (p.headshot || p.externalId || (p.identitySource && p.identitySource !== "generated")) return p.headshot;
  return allFaces[p.portraitIndex ?? -1] ?? faces[stableHash(p.id) % faces.length];
}
