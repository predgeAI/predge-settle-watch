import AsyncStorage from "@react-native-async-storage/async-storage";
import { LEAGUE_API, SESSION_KEY } from "./config";
import { friendlyError } from "./logic";

export class LeagueError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export interface Session { token: string; expiresAt: string }
export interface Me {
  address: string; nickname: string | null; avatar: string; needsNickname: boolean; onboarded: boolean;
  inviteCode: string; inviteLink: string; deepLink: string; friends: number;
  week: string; resetsAt: string; weeklyXp: number; rank: number | null;
  clan: { id: string; name: string; tag: string; emblem: string } | null;
}
export interface BoardRow { rank: number; nickname: string; avatar: string; weeklyXp: number; you: boolean }
export interface Board { week: string; resetsAt: string; rows: BoardRow[]; you: { rank: number | null; weeklyXp: number } | null }
export interface Recap {
  week: string; weeklyXp: number; globalRank: number | null; friendsRank: number | null; friendsCount: number;
  topFriend: { nickname: string; weeklyXp: number } | null;
  clan: { name: string; tag: string; score: number; rank: number } | null; medal: "gold" | "silver" | "bronze" | null;
}
export interface ClanMember { nickname: string; avatar: string; weeklyXp: number; counted: number; founder: boolean; you: boolean }
export interface ClanDetail {
  id: string; name: string; tag: string; emblem: string; code: string; score: number; rank: number;
  memberCap: number; memberXpCap: number; youAreFounder: boolean; members: ClanMember[];
}
export interface ClanRow { rank: number; name: string; tag: string; emblem: string; members: number; weeklyXp: number; you: boolean }
export interface XpResult { granted: number; reason: string; weeklyXp: number; rank: number | null; passed: string[] }

let cached: Session | null | undefined;
export async function loadSession(): Promise<Session | null> {
  if (cached !== undefined) return cached && Date.parse(cached.expiresAt) > Date.now() ? cached : null;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    cached = s && typeof s.token === "string" && Date.parse(s.expiresAt) > Date.now() ? s : null;
  } catch {
    cached = null;
  }
  return cached;
}
export async function saveSession(s: Session | null): Promise<void> {
  cached = s;
  if (s) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else await AsyncStorage.removeItem(SESSION_KEY);
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) {
    const s = await loadSession();
    if (!s) throw new LeagueError("unauthorized", friendlyError("unauthorized", undefined), 401);
    headers.authorization = `Bearer ${s.token}`;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const res = await fetch(`${LEAGUE_API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { code: string; message: string } } | null;
    if (!res.ok || !json || json.ok === false) {
      if (res.status === 401 && auth) await saveSession(null);
      throw new LeagueError(json?.error?.code ?? "http_" + res.status, friendlyError(json?.error?.code, json?.error?.message), res.status);
    }
    return json as T;
  } catch (e) {
    if (e instanceof LeagueError) throw e;
    throw new LeagueError("network", "Cannot reach the League. Check your connection.", 0);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  nonce: (wallet: string) => request<{ nonce: string; message: string }>("POST", "/api/auth/nonce", { wallet }, false),
  verify: (wallet: string, message: string, signature: string) => request<Session>("POST", "/api/auth/verify", { wallet, message, signature }, false),
  invitePreview: (code: string) => request<{ inviter: { nickname: string; avatar: string } }>("GET", `/api/invite/${code}`, undefined, false),
  me: () => request<Me>("GET", "/api/me"),
  deleteMe: () => request<{ deleted: boolean }>("DELETE", "/api/me"),
  setProfile: (p: { nickname?: string; avatar?: string }) => request<Me>("POST", "/api/me/profile", p),
  onboarded: () => request<{ inviterRewarded: boolean }>("POST", "/api/onboarding/complete", {}),
  acceptInvite: (code: string) => request<{ friend: { nickname: string; avatar: string }; already: boolean }>("POST", "/api/invite/accept", { code }),
  friends: () => request<{ friends: { nickname: string; avatar: string; weeklyXp: number }[] }>("GET", "/api/friends"),
  removeFriend: (nickname: string) => request<unknown>("POST", "/api/friends/remove", { nickname }),
  xp: (action: string, key: string) => request<XpResult>("POST", "/api/xp", { action, key }),
  friendsBoard: () => request<Board>("GET", "/api/league/friends"),
  globalBoard: () => request<Board>("GET", "/api/league/global"),
  recap: () => request<Recap>("GET", "/api/league/recap"),
  clan: () => request<{ clan: ClanDetail | null }>("GET", "/api/clans/me"),
  clanBoard: () => request<{ rows: ClanRow[]; memberXpCap: number }>("GET", "/api/clans/board"),
  createClan: (p: { name: string; tag: string; emblem: string }) => request<{ clan: ClanDetail | null }>("POST", "/api/clans", p),
  joinClan: (code: string) => request<{ clan: ClanDetail | null }>("POST", "/api/clans/join", { code }),
  leaveClan: () => request<unknown>("POST", "/api/clans/leave", {}),
  kick: (nickname: string) => request<unknown>("POST", "/api/clans/kick", { nickname }),
};
