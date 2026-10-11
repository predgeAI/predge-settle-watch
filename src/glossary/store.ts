import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "settle-watch/glossary-seen/v1";

export async function loadSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function saveSeen(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(ids));
}
