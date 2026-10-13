// Sets the Android applicationId without touching the Kotlin namespace (io.predge.settlewatch), so the
// native widget and haptics modules compile unchanged while the app installs under another id.
const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function withApplicationId(config, { applicationId }) {
  return withAppBuildGradle(config, (cfg) => {
    const g = cfg.modResults.contents;
    const next = g.replace(/applicationId\s+['"][^'"]+['"]/, `applicationId '${applicationId}'`);
    if (next === g && !g.includes(`applicationId '${applicationId}'`)) throw new Error("with-application-id: applicationId line not found");
    cfg.modResults.contents = next;
    return cfg;
  });
};
