import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { Team } from "../engine/types";
import { Crest } from "./components";

const DIVISIONS = [
  ["East", "Atlantic"],
  ["East", "Metropolitan"],
  ["West", "Central"],
  ["West", "Pacific"],
] as const;

/**
 * Club selector: a crest button that opens a searchable board of clubs
 * grouped by division, instead of a plain system dropdown.
 */
export default function TeamPicker({
  teams,
  value,
  onChange,
  ru,
  label,
  extra,
}: {
  teams: Team[];
  value: string;
  onChange: (id: string) => void;
  ru: boolean;
  label?: string;
  /** Optional detail per club shown under its name (record, need…). */
  extra?: (team: Team) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const selected = teams.find((t) => t.id === value);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((t) => !q || `${t.id} ${t.city} ${t.name}`.toLowerCase().includes(q));
  }, [teams, query]);
  return (
    <div className={`team-picker ${open ? "open" : ""}`} ref={box}>
      <button
        type="button"
        className="team-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label ?? (ru ? "Выбор клуба" : "Choose club")}
        style={{ "--club": selected?.color ?? "#48a9df" } as React.CSSProperties}
        onClick={() => setOpen((v) => !v)}
      >
        {selected && <Crest team={selected} size={30} />}
        <span>
          <small>{label ?? (ru ? "ПАРТНЁР ПО СДЕЛКЕ" : "TRADE PARTNER")}</small>
          <b>{selected ? `${selected.city} ${selected.name}` : "—"}</b>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="team-picker-pop" role="listbox">
          <label className="team-picker-search">
            <Search size={15} />
            <input
              autoFocus
              value={query}
              placeholder={ru ? "Город, клуб или аббревиатура…" : "City, club or abbreviation…"}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="team-picker-groups">
            {DIVISIONS.map(([conference, division]) => {
              const list = filtered.filter((t) => t.division === division);
              if (!list.length) return null;
              return (
                <section key={division}>
                  <h4>
                    {division}
                    <small>{conference === "East" ? (ru ? "Восток" : "East") : ru ? "Запад" : "West"}</small>
                  </h4>
                  <div>
                    {list.map((t) => (
                      <button
                        key={t.id}
                        role="option"
                        aria-selected={t.id === value}
                        className={t.id === value ? "selected" : ""}
                        style={{ "--club": t.color } as React.CSSProperties}
                        onClick={() => {
                          onChange(t.id);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <Crest team={t} size={34} />
                        <span>
                          <b>{t.name}</b>
                          <small>{extra?.(t) ?? t.city}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {!filtered.length && <p className="muted">{ru ? "Ничего не найдено" : "No clubs found"}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
