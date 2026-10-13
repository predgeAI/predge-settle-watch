// Expo config. The default build is exactly app.json. With EXPO_PUBLIC_EDITION=monad it becomes the
// Monad edition: its own application id (installs next to the default app), version, icons and scheme.
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_EDITION !== "monad") return config;
  const plugins = (config.plugins ?? [])
    // No Solana wallet intent queries in the Monad edition.
    .filter((p) => p !== "./plugins/with-mwa-queries")
    .map((p) =>
      Array.isArray(p) && p[0] === "expo-splash-screen" ? ["expo-splash-screen", { ...p[1], image: "./assets/monad/splash-icon.png", backgroundColor: "#0e0b1f" }] : p
    );
  return {
    ...config,
    name: "Settle Watch",
    version: "0.6.2-monad",
    scheme: "settlewatchmonad",
    icon: "./assets/monad/icon.png",
    backgroundColor: "#0e0b1f",
    splash: { ...config.splash, image: "./assets/monad/splash-icon.png", backgroundColor: "#0e0b1f" },
    android: {
      ...config.android,
      versionCode: 3,
      adaptiveIcon: {
        ...config.android.adaptiveIcon,
        foregroundImage: "./assets/monad/adaptive-icon.png",
        backgroundColor: "#0e0b1f",
      },
    },
    extra: { ...(config.extra ?? {}), edition: "monad" },
    // Native code keeps the io.predge.settlewatch namespace; only the installed application id changes.
    plugins: [...plugins, ["./plugins/with-application-id", { applicationId: "io.predge.settlewatch.monad" }]],
  };
};
