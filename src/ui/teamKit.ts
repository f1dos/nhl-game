import { Color } from "three";
import type { Team } from "../engine/types";
import type { TeamKit } from "./hockeyRig";

const shade = (hex: string, amount: number) => `#${new Color(hex).multiplyScalar(amount).getHexString()}`;
// The database colour also paints UI cards and is often too light for dyed
// cloth. Keep uniform swatches independent of that interface palette.
const uniforms: Record<string,[string,string]> = {
  TOR:["#003777","#002c60"], MTL:["#a71930","#182c57"], BOS:["#191919","#151515"],
  NYR:["#073d93","#b02135"], EDM:["#11315c","#142743"], DET:["#b71930","#a8192c"],
  PIT:["#17191c","#18191b"], CHI:["#bd1d32","#1a1c20"], VAN:["#073c76","#082e54"],
  LAK:["#212126","#191b1f"], COL:["#73243b","#17394a"], SEA:["#112f3c","#112933"],
};

/** Match lighting acts on these fabric colours in linear space. */
export function kitFor(team: Pick<Team, "id" | "color" | "logoUrl">, away: boolean): TeamKit {
  const [primary,pants]=uniforms[team.id] ?? [shade(team.color,.68),shade(team.color,.24)];
  const chalk="#e6e8e8";
  return {jersey:away?chalk:primary,trim:away?primary:chalk,pants,
    helmet:away?"#eceded":primary,socks:away?chalk:primary, logo:team.logoUrl,abbr:team.id};
}
