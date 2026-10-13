// Metro config: Expo defaults, plus explicit entry points for @category-labs/mera,
// which publishes only an "exports" map (no "main"), which Metro does not read here.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const MERA = path.join(__dirname, "node_modules/@category-labs/mera/dist");
const MERA_ENTRIES = {
  "@category-labs/mera": "index.js",
  "@category-labs/mera/viem": "viem.js",
  "@category-labs/mera/react-native-webauthn-client": "react-native-webauthn-client.js",
};

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const entry = MERA_ENTRIES[moduleName];
  if (entry) return { type: "sourceFile", filePath: path.join(MERA, entry) };
  // Privy and Dynamic (Monad edition) also publish "exports" maps: resolve them with package exports on.
  if (/^(@privy-io\/|@dynamic-labs\/|permissionless)/.test(moduleName)) {
    const ctx = { ...context, unstable_enablePackageExports: true };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
