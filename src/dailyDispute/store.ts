import AsyncStorage from "@react-native-async-storage/async-storage";
import { NEW_PUZZLE_STATE, sanitizePuzzleState, type PuzzleState } from "./logic";

const KEY = "settle-watch/daily-dispute/v1";

export async function loadPuzzleState(): Promise<PuzzleState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? sanitizePuzzleState(JSON.parse(raw)) : { ...NEW_PUZZLE_STATE, plays: {} };
  } catch {
    return { ...NEW_PUZZLE_STATE, plays: {} };
  }
}

export async function savePuzzleState(s: PuzzleState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}
