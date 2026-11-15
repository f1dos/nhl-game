import { useState } from "react";
import type { Game, Player } from "../engine/types";
import {
  evaluateTrade,
  executeTrade,
  payroll,
  tradeValue,
} from "../engine/trades";
import { rivalryBetween } from "../engine/franchiseWorld";
import { Panel } from "./components";

type Edit = (fn: (game: Game) => void) => void;

export default function TradeCenter({
  game,
  edit,
}: {
  game: Game;
  edit: Edit;
}) {
  const [other, setOther] = useState(
    game.teams.find((team) => team.id !== game.user)!.id,
  );
  const [give, setGive] = useState<string[]>([]);
  const [take, setTake] = useState<string[]>([]);
  const [givePicks, setGivePicks] = useState<string[]>([]);
  const [takePicks, setTakePicks] = useState<string[]>([]);
  const [reply, setReply] = useState<string>();
  const user = game.teams.find((team) => team.id === game.user)!;
  const partner = game.teams.find((team) => team.id === other)!;
  const rival = rivalryBetween(game, game.user, other);
  const assets = { givePicks, takePicks };
  const evaluation = evaluateTrade(game, other, give, take, assets);
  const picks = (owner: string) =>
    (game.draftAssets ?? []).filter((pick) => pick.currentTeam === owner);
  const toggle = (
    id: string,
    selected: string[],
    setSelected: (value: string[]) => void,
  ) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  const playerList = (
    players: Player[],
    selected: string[],
    setSelected: (value: string[]) => void,
  ) => (
    <table>
      <thead>
        <tr>
          <th>АКТИВ</th>
          <th>POS</th>
          <th>OVR</th>
          <th>AAV</th>
          <th>VALUE</th>
        </tr>
      </thead>
      <tbody>
        {players.map((player) => (
          <tr key={player.id}>
            <td>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(player.id)}
                  onChange={() => toggle(player.id, selected, setSelected)}
                />{" "}
                {player.name}
              </label>
            </td>
            <td>{player.pos}</td>
            <td>{player.ovr}</td>
            <td>${player.salary}M</td>
            <td>{tradeValue(player).toFixed(0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const pickList = (
    owner: string,
    selected: string[],
    setSelected: (value: string[]) => void,
  ) => (
    <div className="trade-picks">
      {picks(owner)
        .slice(0, 14)
        .map((pick) => (
          <label key={pick.id}>
            <input
              type="checkbox"
              checked={selected.includes(pick.id)}
              onChange={() => toggle(pick.id, selected, setSelected)}
            />{" "}
            {pick.year} · R{pick.round} · {pick.originalTeam}{" "}
            <small>{pick.value} value</small>
          </label>
        ))}
    </div>
  );
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">GM-TO-GM NEGOTIATION</span>
          <h1>Центр обменов</h1>
          <p>
            Соберите пакет из игроков и драфт-пиков, затем отправьте его
            генеральному менеджеру.
          </p>
        </div>
      </div>
      <Panel title="ПЕРЕГОВОРЫ С КЛУБОМ">
        <select
          value={other}
          onChange={(event) => {
            setOther(event.target.value);
            setTake([]);
            setTakePicks([]);
            setReply(undefined);
          }}
        >
          {game.teams
            .filter((team) => team.id !== game.user)
            .map((team) => (
              <option key={team.id} value={team.id}>
                {team.city} {team.name} · GM {team.id}
              </option>
            ))}
        </select>
        <div className="gm-chat">
          <p>
            <b>GM {partner.id}</b>
            <br />
            Готов выслушать предложение. Нас интересуют позиции:{" "}
            {(game.teamNeeds?.[other] ?? [])
              .map((need) => need.position)
              .join(", ") || "лучший доступный актив"}
            .
          </p>
          {rival && (
            <p className="rival-warning">
              <b>{rival.label}</b>
              <br />
              Между клубами горячее противостояние. Мы потребуем премию за
              сделку.
            </p>
          )}
          {reply && (
            <p>
              <b>GM {partner.id}</b>
              <br />
              {reply}
            </p>
          )}
        </div>
      </Panel>
      <div className="overview-grid">
        <Panel title={`${user.id} · $${payroll(user.players).toFixed(2)}M`}>
          {playerList(user.players, give, setGive)}
          <h3>Драфт-пики</h3>
          {pickList(game.user, givePicks, setGivePicks)}
        </Panel>
        <Panel
          title={`${partner.id} · $${payroll(partner.players).toFixed(2)}M`}
        >
          {playerList(partner.players, take, setTake)}
          <h3>Драфт-пики</h3>
          {pickList(other, takePicks, setTakePicks)}
        </Panel>
      </div>
      <p className="note">
        Прямая денежная доплата не используется как обычный актив NHL. Потолок
        зарплат проверяется до ответа GM; удержание зарплаты станет отдельным
        условием переговоров.
      </p>
      <button className="primary" onClick={() => setReply(evaluation.reason)}>
        Отправить предложение GM
      </button>{" "}
      <button
        disabled={!evaluation.accepted || !reply}
        onClick={() => {
          edit((current) => executeTrade(current, other, give, take, assets));
          setGive([]);
          setTake([]);
          setGivePicks([]);
          setTakePicks([]);
          setReply("Сделка зарегистрирована лигой.");
        }}
      >
        Зарегистрировать согласованный обмен
      </button>
      <Panel title="ИСТОРИЯ ОБМЕНОВ">
        {[...(game.transactions ?? [])].reverse().map((transaction, index) => (
          <p key={index}>
            {transaction.year} · {transaction.message}
          </p>
        ))}
      </Panel>
    </>
  );
}
