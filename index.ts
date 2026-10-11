// Polyfills must load before @solana/web3.js.
import "react-native-get-random-values";
import { Buffer } from "buffer";
(global as unknown as { Buffer: typeof Buffer }).Buffer = (global as any).Buffer ?? Buffer;

import { registerRootComponent } from "expo";
import * as SplashScreen from "expo-splash-screen";
import { defineBackgroundTask } from "./src/watcher";
import App from "./App";

// Keep the native splash (app mark on the brand background) up until the in-app intro is laid out.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

// The background task must be defined at module scope, before the app mounts.
defineBackgroundTask();

registerRootComponent(App);
