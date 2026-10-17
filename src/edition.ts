// Build edition. `EXPO_PUBLIC_EDITION=monad` at bundle time builds the Monad edition
// (io.predge.settlewatch.monad); anything else builds the default app, unchanged.
// Expo inlines EXPO_PUBLIC_* variables into the JS bundle, so this is a build-time constant.
export type Edition = "default" | "monad";
export const EDITION: Edition = process.env.EXPO_PUBLIC_EDITION === "monad" ? "monad" : "default";
export const IS_MONAD = EDITION === "monad";
