// Android home-screen widget ("Settle Watch", 4x2, resizable).
// The native sources live in plugins/home-widget/android and mirror android/app/src/main:
//   java/io/predge/settlewatch/widget/  AppWidgetProvider + the SettleWatchWidget native module
//   res/layout, res/xml, res/drawable, res/values*  RemoteViews layout, provider info, strings
// On `expo prebuild` this plugin copies them in, registers the receiver in AndroidManifest.xml
// and adds the native package to MainApplication, so a regenerated android/ keeps the widget.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod, withMainApplication } = require("expo/config-plugins");

const SRC = path.join(__dirname, "home-widget", "android");
const RECEIVER = ".widget.SettleWatchWidgetProvider";
const PACKAGE_LINE = "packages.add(io.predge.settlewatch.widget.SettleWatchWidgetPackage())";

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

const withWidgetFiles = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const main = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main");
      fs.mkdirSync(main, { recursive: true });
      copyTree(SRC, main);
      return cfg;
    },
  ]);

const withWidgetReceiver = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    app.receiver = app.receiver || [];
    if (!app.receiver.some((r) => r.$["android:name"] === RECEIVER)) {
      app.receiver.push({
        $: { "android:name": RECEIVER, "android:exported": "false", "android:label": "@string/app_name" },
        "intent-filter": [{ action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }] }],
        "meta-data": [{ $: { "android:name": "android.appwidget.provider", "android:resource": "@xml/settle_watch_widget_info" } }],
      });
    }
    return cfg;
  });

const withWidgetPackage = (config) =>
  withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language === "kt" && !src.includes("SettleWatchWidgetPackage")) {
      src = src.replace(/(val packages = PackageList\(this\)\.packages\n)/, `$1            ${PACKAGE_LINE}\n`);
      if (!src.includes("SettleWatchWidgetPackage")) throw new Error("with-home-widget: could not register SettleWatchWidgetPackage in MainApplication.kt");
    }
    cfg.modResults.contents = src;
    return cfg;
  });

module.exports = function withHomeWidget(config) {
  return withWidgetPackage(withWidgetReceiver(withWidgetFiles(config)));
};
