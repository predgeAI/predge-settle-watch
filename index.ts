// Polyfills must load before @solana/web3.js.
import "react-native-get-random-values";
import { Buffer } from "buffer";
(global as unknown as { Buffer: typeof Buffer }).Buffer = (global as any).Buffer ?? Buffer;

import { registerRootComponent } from "expo";
import { defineBackgroundTask } from "./src/watcher";
import App from "./App";

// The background task must be defined at module scope, before the app mounts.
defineBackgroundTask();

registerRootComponent(App);
