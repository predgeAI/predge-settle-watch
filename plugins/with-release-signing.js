// Release signing without secrets in the repo. If the Gradle properties
// SETTLEWATCH_UPLOAD_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD are
// set (e.g. in ~/.gradle/gradle.properties), release builds are signed with that
// key; otherwise they fall back to the debug key so the project still builds.
const { withAppBuildGradle } = require("expo/config-plugins");

const BLOCK = `
        release {
            if (project.hasProperty('SETTLEWATCH_UPLOAD_STORE_FILE')) {
                storeFile file(SETTLEWATCH_UPLOAD_STORE_FILE)
                storePassword SETTLEWATCH_UPLOAD_STORE_PASSWORD
                keyAlias SETTLEWATCH_UPLOAD_KEY_ALIAS
                keyPassword SETTLEWATCH_UPLOAD_KEY_PASSWORD
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes("SETTLEWATCH_UPLOAD_STORE_FILE")) {
      g = g.replace(/signingConfigs\s*\{([\s\S]*?debug\s*\{[\s\S]*?\})/, (m) => `${m}${BLOCK}`);
      g = g.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        "$1signingConfig signingConfigs.release"
      );
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
