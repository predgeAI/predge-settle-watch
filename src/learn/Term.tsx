// Tiny "?" pixel badge that explains a term in a plain one-line dialog.
import React from "react";
import { View } from "react-native";
import { showDialog, type DialogButton } from "../dialog";
import { t, type Key } from "../i18n";
import { alpha, C } from "../theme";
import { PixelBox, Press } from "../ui";
import { PixelIcon } from "../sprites";

export type TermId = "status" | "caution" | "watch" | "quiet" | "settled" | "uma" | "proposal" | "dispute" | "receipt" | "pack" | "xp" | "verified";

// The four statuses reuse the app's own translated status words as titles.
const STATUS_WORD: Partial<Record<TermId, Key>> = {
  caution: "status.caution.word",
  watch: "status.watch.word",
  quiet: "status.ok.word",
  settled: "status.resolved.word",
};
const FOUR: TermId[] = ["caution", "watch", "quiet", "settled"];

export function termTitle(id: TermId): string {
  const w = STATUS_WORD[id];
  if (w) return t(w);
  return t(`term.${id}.title` as Key);
}

export function termBody(id: TermId): string {
  if (id === "status") return FOUR.map((k) => `${termTitle(k)}: ${t(`term.${k}.body` as Key)}`).join("\n\n");
  return t(`term.${id}.body` as Key);
}

/** Opens the explanation. The status dialog offers follow-ups for proposal, dispute and UMA. */
export function explain(id: TermId): void {
  const buttons: DialogButton[] =
    id === "status"
      ? [
          { text: t("term.ask.proposal"), onPress: () => explain("proposal") },
          { text: t("term.ask.dispute"), onPress: () => explain("dispute") },
          { text: t("term.ask.uma"), onPress: () => explain("uma") },
          { text: t("common.ok") },
        ]
      : id === "proposal" || id === "dispute"
        ? [{ text: t("term.ask.uma"), onPress: () => explain("uma") }, { text: t("common.ok") }]
        : [{ text: t("common.ok") }];
  showDialog(id === "status" ? t("term.status.title") : termTitle(id), termBody(id), buttons, { variant: "neutral" });
}

/** The "?" picture on its own, for rows that are already pressable. */
export function QBadge({ color = C.purpleSoft }: { color?: string }) {
  return (
    <View style={{ alignSelf: "flex-start" }}>
      <PixelBox p={2} border={alpha(color, 0.9)} bg={alpha(color, 0.16)} inner={{ padding: 5 }}>
        <PixelIcon name="question" px={2} color={color} />
      </PixelBox>
    </View>
  );
}

/** The "?" badge. Put it next to the term it explains. */
export function Term({ id, color }: { id: TermId; color?: string }) {
  return (
    <Press onPress={() => explain(id)} label={t("term.a11y", { term: id === "status" ? t("term.status.title") : termTitle(id) })}>
      <QBadge color={color} />
    </Press>
  );
}
