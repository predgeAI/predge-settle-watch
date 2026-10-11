// Settle Watch League: social layer (friends, weekly league, clans). Everything under src/league is self-contained.
// Set LEAGUE_ENABLED to false to drop the League from a build. The App.tsx hook-in is gated on this flag.
export const LEAGUE_ENABLED = false;

export const LEAGUE_API = "https://settle-watch-league.vercel.app";
export const LEAGUE_DISCLAIMER = "League scores are game points reported by the app. They are not verified and have no value.";
export const SESSION_KEY = "settle-watch/league/session/v1";
export const PENDING_INVITE_KEY = "settle-watch/league/pending-invite/v1";
