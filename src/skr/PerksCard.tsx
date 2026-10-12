// "SKR PERKS" card for the ME tab: balance, tier, the three perks and the next threshold.
import React from "react";
import { View } from "react-native";
import { Text } from "../Text";
import { fmtDec, fmtNum, t, useLang } from "../i18n";
import { C } from "../theme";
import { BadgeIcon, PixelBox } from "../ui";
import { styles } from "../tabs/shared";
import { extraSlots, HOLDER_MIN_SKR, multiplierText, nextTier, tierName, watchlistLimit } from "./perks";
import { usePerks } from "./perksStore";
import { formatSkr } from "./spl";

const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function SkrPerksCard() {
  useLang();
  const p = usePerks();
  const active = !!p.tier;
  // With no tier, the rows show what the first tier gives, dimmed.
  const shown = p.tier ?? "holder";
  const next = nextTier(p.tier);
  const row = (text: string, sub?: string) => (
    <View style={{ marginTop: 4 }}>
      <Text style={[styles.body, { color: active ? C.green : C.dim }]}>{`${active ? "+" : "-"} ${text}`}</Text>
      {sub ? <Text style={[styles.dim, { marginLeft: 14 }]}>{sub}</Text> : null}
    </View>
  );
  return (
    <PixelBox style={styles.cardGap} inner={styles.cardPad}>
      <View style={[styles.rowBetween, { alignItems: "flex-start" }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{t("perks.title")}</Text>
          {p.total === null ? (
            p.checked ? <Text style={styles.body}>{t("perks.tierLine", { tier: tierName(null) })}</Text> : <Text style={styles.dim}>{t("perks.reading")}</Text>
          ) : (
            <>
              <Text style={styles.body}>{t("perks.balance", { n: fmtDec(formatSkr(p.total)) })}</Text>
              <Text style={styles.body}>{t("perks.tierLine", { tier: tierName(p.tier) })}</Text>
            </>
          )}
        </View>
        <BadgeIcon id="skr_holder" size={44} locked={!active} />
      </View>
      {!active ? <Text style={[styles.dim, { marginTop: 8 }]}>{t("perks.none", { n: fmtNum(HOLDER_MIN_SKR) })}</Text> : null}
      {row(t("perks.slots", { n: watchlistLimit(shown), extra: extraSlots(shown) }))}
      {row(t("perks.xp", { m: fmtDec(multiplierText(shown)) }), t("perks.league"))}
      {row(t("perks.badge"))}
      <Text style={[styles.dim, { marginTop: 8 }]}>{next ? t("perks.next", { tier: tierName(next.id), n: fmtNum(next.min) }) : t("perks.top")}</Text>
      {p.source === "cache" && p.checked && p.at ? <Text style={[styles.dim, { marginTop: 4, color: C.orange }]}>{t("perks.cached", { time: hm(p.at) })}</Text> : null}
      <Text style={[styles.dim, { marginTop: 8, color: C.green }]}>{t("perks.source")}</Text>
    </PixelBox>
  );
}
