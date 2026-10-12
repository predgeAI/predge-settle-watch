// Rich haptics for Android: a tiny native module (RichHaptics) that plays a whole haptic pattern
// as one vibration, using Android 12+ composition primitives with waveform fallbacks.
// The Kotlin sources live in plugins/rich-haptics/android and mirror android/app/src/main.
// On `expo prebuild` this plugin copies them in, makes sure the VIBRATE permission is declared and
// adds RichHapticsPackage to MainApplication. Safe to run repeatedly and alongside with-home-widget
// (both add one line to getPackages()).
const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod, withMainApplication } = require("expo/config-plugins");

const SRC = path.join(__dirname, "rich-haptics", "android");
const PACKAGE_CLASS = "io.predge.settlewatch.haptics.RichHapticsPackage";
const VIBRATE = "android.permission.VIBRATE";

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(b, { recursive: true });
      copyTree(a, b);
    } else {
      fs.copyFileSync(a, b);
    }
  }
}

const withHapticsFiles = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const main = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main");
      fs.mkdirSync(main, { recursive: true });
      copyTree(SRC, main);
      return cfg;
    },
  ]);

const withVibratePermission = (config) =>
  withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermission(cfg.modResults, VIBRATE);
    return cfg;
  });

/** Adds the package to getPackages() in MainApplication (Kotlin or Java). Idempotent. */
function addPackage(src, language) {
  if (src.includes("RichHapticsPackage")) return src;
  if (language === "kt") {
    const line = `packages.add(${PACKAGE_CLASS}())`;
    // Expo template: `val packages = PackageList(this).packages`, possibly followed by other
    // plugins' packages.add(...) lines. Insert right after the declaration.
    const decl = /^([ \t]*)val packages = PackageList\(this\)\.packages[^\n]*\n/m;
    if (decl.test(src)) return src.replace(decl, (m, indent) => `${m}${indent}${line}\n`);
    // Older template: `PackageList(this).packages.apply { ... }`
    const apply = /^([ \t]*)PackageList\(this\)\.packages\.apply \{[^\n]*\n/m;
    if (apply.test(src)) return src.replace(apply, (m, indent) => `${m}${indent}  add(${PACKAGE_CLASS}())\n`);
  } else {
    const line = `packages.add(new ${PACKAGE_CLASS}());`;
    const decl = /^([ \t]*)List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);[^\n]*\n/m;
    if (decl.test(src)) return src.replace(decl, (m, indent) => `${m}${indent}${line}\n`);
  }
  throw new Error("with-rich-haptics: could not register RichHapticsPackage in MainApplication");
}

const withHapticsPackage = (config) =>
  withMainApplication(config, (cfg) => {
    cfg.modResults.contents = addPackage(cfg.modResults.contents, cfg.modResults.language);
    return cfg;
  });

module.exports = function withRichHaptics(config) {
  return withHapticsPackage(withVibratePermission(withHapticsFiles(config)));
};
module.exports.addPackage = addPackage;
