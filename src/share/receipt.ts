// Turns a confirmed receipt into the card's content and the share message. No React Native imports.
import { CLUSTERS, EXPLORER_TX, VERIFY_CHECKS, type Cluster } from "../config";
import { getLanguage, pixelFontOk, t, tk } from "../i18n";
import type { Anchor, WatchItem } from "../store";
import type { CardInput } from "./card";

/** Fallback count for a receipt whose verification is no longer on screen: every check verifyRecord runs. */
export const VERIFIED_CHECKS = VERIFY_CHECKS;

export interface ReceiptShare {
  question: string;
  riskLevel: string;
  packHash: string;
  signature: string;
  at: string;
  cluster?: Cluster;
  /** Counts from the verification on screen, when it is the one this receipt anchored. */
  checks?: { ok: number; total: number };
}

export function receiptUrl(r: ReceiptShare): string {
  return EXPLORER_TX(r.signature, r.cluster ?? "devnet");
}

export function shareMessage(r: ReceiptShare): string {
  return t("share.message", { url: receiptUrl(r) });
}

export function receiptCardInput(r: ReceiptShare, statusColor: string): CardInput {
  const ok = r.checks?.ok ?? VERIFIED_CHECKS;
  const total = r.checks?.total ?? VERIFIED_CHECKS;
  return {
    question: r.question,
    statusWord: tk(`status.${r.riskLevel}.word`, r.riskLevel.toUpperCase()),
    statusColor,
    checksOk: ok,
    checksTotal: total,
    packHash: r.packHash,
    signature: r.signature,
    at: r.at,
    networkLabel: CLUSTERS[r.cluster ?? "devnet"].label,
    explorerUrl: receiptUrl(r),
    text: {
      headline: t("share.headline"),
      checks: t("share.checks", { ok, n: total }),
      pack: t("share.pack"),
      receipt: t("share.receipt"),
      date: t("share.date"),
      network: t("share.network"),
      scan: t("share.scan"),
      footer: t("share.footer"),
    },
    pixelLabels: pixelFontOk(getLanguage()),
  };
}

/** Card content for one of a market's receipts. Uses the on-screen check counts when they belong to this receipt's pack. */
export function receiptFromAnchor(item: WatchItem, a: Pick<Anchor, "signature" | "packHash" | "riskLevel" | "at" | "cluster">): ReceiptShare {
  const v = item.verification;
  const same = !!v?.verified && v.packHash === a.packHash;
  return {
    question: item.question ?? item.last?.market.question ?? item.key,
    riskLevel: a.riskLevel,
    packHash: a.packHash,
    signature: a.signature,
    at: a.at,
    cluster: a.cluster,
    checks: same && v ? { ok: v.checks.filter((c) => c.ok).length, total: v.checks.length } : undefined,
  };
}
