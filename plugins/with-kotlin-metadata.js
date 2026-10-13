// react-native-passkey 3.6 depends on androidx.credentials 1.6 and kotlinx-coroutines 1.10, which are
// compiled with Kotlin 2.1. Expo 52 builds with Kotlin 1.9, which refuses metadata newer than 2.0.
// The bytecode is compatible; only the metadata version check fails, so skip that check.
const { withProjectBuildGradle } = require("expo/config-plugins");

const MARK = "// with-kotlin-metadata";
const BLOCK = `
${MARK}
allprojects {
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        kotlinOptions {
            freeCompilerArgs += ["-Xskip-metadata-version-check"]
        }
    }
}
`;

module.exports = function withKotlinMetadata(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARK)) cfg.modResults.contents += BLOCK;
    return cfg;
  });
};
