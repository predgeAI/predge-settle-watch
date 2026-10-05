// Adds a <queries> entry so the app can see Mobile Wallet Adapter wallets
// (solana-wallet:// intents) under Android 11+ package visibility rules.
const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withMwaQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const intent = {
      action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
      category: [{ $: { "android:name": "android.intent.category.BROWSABLE" } }],
      data: [{ $: { "android:scheme": "solana-wallet" } }],
    };
    manifest.queries = manifest.queries || [];
    const already = JSON.stringify(manifest.queries).includes("solana-wallet");
    if (!already) {
      if (manifest.queries.length) {
        manifest.queries[0].intent = manifest.queries[0].intent || [];
        manifest.queries[0].intent.push(intent);
      } else {
        manifest.queries.push({ intent: [intent] });
      }
    }
    return cfg;
  });
};
