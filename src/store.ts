import { create } from "zustand";
import type { Game } from "./engine/types";
import { saveGame } from "./engine/saves";
interface Store {
  game: Game | null;
  error: string;
  setGame: (game: Game) => void;
  edit: (fn: (g: Game) => void) => void;
  clearError: () => void;
}
const persist = (g: Game) => {
  saveGame(g).catch((e) =>
    useGame.setState({ error: `Не удалось сохранить: ${e.message}` }),
  );
};
export const useGame = create<Store>((set, get) => ({
  game: null,
  error: "",
  clearError: () => set({ error: "" }),
  setGame: (game) => {
    set({ game });
    persist(game);
  },
  edit: (fn) => {
    const current = get().game;
    if (!current) return;
    try {
      const game = structuredClone(current);
      fn(game);
      set({ game });
      persist(game);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
}));
