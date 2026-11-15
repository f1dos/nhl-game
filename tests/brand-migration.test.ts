import { test } from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { newGame } from "../src/engine/database";
import { listGames, saveGame } from "../src/engine/saves";

test("NHL Manager 27 imports 26 careers without losing or overwriting newer saves", async () => {
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: indexedDB,
  });
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  });

  const old = newGame("TOR", 70027);
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("nhlm26", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("careers", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = legacy.transaction("careers", "readwrite");
    tx.objectStore("careers").put(old);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  legacy.close();

  const imported = await listGames();
  assert.equal(imported.length, 1);
  assert.equal(imported[0].id, old.id);

  const newer = structuredClone(imported[0]);
  newer.news.unshift("Career progressed in NHL Manager 27");
  await saveGame(newer);
  assert.equal(values.get("nhlm27-last"), newer.id);

  const twice = await listGames();
  assert.equal(twice.length, 1);
  assert.equal(twice[0].news[0], "Career progressed in NHL Manager 27");
});
