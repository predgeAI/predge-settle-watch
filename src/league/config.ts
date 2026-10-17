import { en } from "../i18n";
import { IS_MONAD } from "../edition";

// Settle Watch League: social layer (friends, weekly league, clans). Everything under src/league is self-contained.
// Defaults to true after the production smoke tests passed (11 Oct 2026). Set LEAGUE_ENABLED to false to drop the League from a build. The App.tsx hook-in is gated on this flag.
export const LEAGUE_ENABLED = true;
/** The Monad edition signs in with the passkey wallet (EIP-191) instead of a wallet app. */
export const LEAGUE_EVM = IS_MONAD;

export const LEAGUE_API = "https://settle-watch-league.vercel.app";
export const LEAGUE_DISCLAIMER = en["lg.disclaimer"]; // shown translated through t("lg.disclaimer")
export const SESSION_KEY = "settle-watch/league/session/v1";
export const PENDING_INVITE_KEY = "settle-watch/league/pending-invite/v1";
