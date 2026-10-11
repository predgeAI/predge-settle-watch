import AsyncStorage from "@react-native-async-storage/async-storage";
import { onXpAwarded } from "../game";
import { api, loadSession, LeagueError, type XpResult } from "./api";
import { PENDING_INVITE_KEY } from "./config";
import { xpKey } from "./logic";

type Listener = (r: XpResult) => void;
const listeners: Listener[] = [];
export function onLeagueResult(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(kind: string, key: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await loadSession())) return; // not signed in: the League simply is not used
    try {
      const r = await api.xp(kind, key);
      for (const fn of listeners) fn(r);
      return;
    } catch (e) {
      // Same key on every retry, so the server never counts it twice.
      if (!(e instanceof LeagueError) || (e.code !== "network" && e.status < 500)) return;
      await sleep(2000 * 4 ** attempt);
    }
  }
}

let started = false;
/** Reports each XP award from the game module. The server decides the points and applies its own caps. */
export function startReporting(): void {
  if (started) return;
  started = true;
  onXpAwarded((e) => {
    void send(e.kind, xpKey(e));
  });
}

export const setPendingInvite = (code: string) => AsyncStorage.setItem(PENDING_INVITE_KEY, code);
export const takePendingInvite = async () => {
  const c = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (c) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return c;
};
export const peekPendingInvite = () => AsyncStorage.getItem(PENDING_INVITE_KEY);
