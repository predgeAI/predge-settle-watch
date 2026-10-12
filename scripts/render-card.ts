// Writes a sample receipt card as SVG and as an HTML page with the pixel font embedded, for review
// on a computer. Run: npx tsx scripts/render-card.ts <out-dir> [en|es|pt|zh|ko] [devnet|mainnet-beta]
// Set QUESTION to try another market question.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cardSvg, CARD_H, CARD_W } from "../src/share/card";
import { receiptCardInput, receiptFromAnchor, shareMessage } from "../src/share/receipt";
import { setLanguage, type Lang } from "../src/i18n";
import type { Cluster } from "../src/config";

const out = process.argv[2] ?? "card-preview";
const lang = (process.argv[3] ?? "en") as Lang;
const cluster = (process.argv[4] ?? "devnet") as Cluster;
setLanguage(lang);

// Sample values for the preview only.
const sample = receiptFromAnchor(
  { key: "5186278", question: process.env.QUESTION ?? "Will the Fed cut interest rates at the December 2026 meeting?", addedAt: "", timeline: [], anchors: [] },
  {
    signature: "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRBrFmSx6fPkMqR4hP2a",
    packHash: "9c1f3a52e07b4d6aa8e2c17f05b93d4e6f2a8c0b1d7e3f9a4c6b8d0e2f4a6c8e",
    riskLevel: "caution",
    at: "2026-10-12T09:30:00.000Z",
    cluster,
  }
);
const input = receiptCardInput(sample, "#e2703a");
const svg = cardSvg(input);
const font = readFileSync(join(__dirname, "../assets/fonts/PressStart2P-Regular.ttf")).toString("base64");
const html = `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:"PressStart2P-Regular";src:url(data:font/ttf;base64,${font})}html,body{margin:0;background:#0a0f0b;width:${CARD_W}px;height:${CARD_H}px;overflow:hidden}</style>${svg}`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "card.svg"), svg);
writeFileSync(join(out, "card.html"), html);
writeFileSync(join(out, "message.txt"), shareMessage(sample) + "\n");
console.log(JSON.stringify({ url: input.explorerUrl, message: shareMessage(sample) }));
