// Keeps MainActivity alive across more configuration changes (font scale, density, locale,
// layout direction). Without this Android can recreate the activity while a wallet is in front,
// which drops an in-flight Mobile Wallet Adapter session.
const { withAndroidManifest } = require("expo/config-plugins");

const EXTRA = ["density", "fontScale", "smallestScreenSize", "locale", "layoutDirection", "navigation", "keyboard", "keyboardHidden", "orientation", "screenSize", "screenLayout", "uiMode"];

module.exports = function withActivityConfig(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$["android:name"] === ".MainActivity");
    if (main) {
      const have = (main.$["android:configChanges"] ?? "").split("|").filter(Boolean);
      main.$["android:configChanges"] = Array.from(new Set([...have, ...EXTRA])).join("|");
    }
    return cfg;
  });
};
