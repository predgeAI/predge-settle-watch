import AsyncStorage from "@react-native-async-storage/async-storage";
import { NEW_GAME, sanitizeGame, type GameState } from "./game";

const KEY = "settle-watch/game/v1";

export async function loadGame(): Promise<GameState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? sanitizeGame(JSON.parse(raw)) : { ...NEW_GAME };
  } catch {
    return { ...NEW_GAME };
  }
}

export async function saveGame(g: GameState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(g));
}
