import React from "react";
import { View } from "react-native";
import { Text } from "../Text";
import { t } from "../i18n";
import { Sprite } from "../sprites";
import { C, PX } from "../theme";
import { avatarMap, emblemMap, MEDAL_MAP, medalFor } from "./logic";

export function Avatar({ id, px = 4 }: { id: string; px?: number }) {
  const a = avatarMap(id);
  return (
    <View style={{ backgroundColor: C.surfaceHi, padding: px / 2 }} accessibilityLabel={t("lg.avatarA11y")}>
      <Sprite map={a.map} px={px} palette={a.palette} />
    </View>
  );
}

export function Emblem({ id, px = 4 }: { id: string; px?: number }) {
  const e = emblemMap(id);
  return <Sprite map={e.map} px={px} palette={{ A: e.color }} />;
}

/** Pixel medal for ranks 1 to 3, a plain rank number otherwise. */
export function RankMark({ rank, px = 3 }: { rank: number | null; px?: number }) {
  const m = medalFor(rank);
  if (!m) {
    return (
      <View style={{ width: px * 8, alignItems: "center" }}>
        <Text style={{ color: C.dim, fontFamily: PX, fontSize: 9 }}>{rank ?? "-"}</Text>
      </View>
    );
  }
  return <Sprite map={MEDAL_MAP} px={px} palette={{ A: m.main, B: m.dark, R: "#ff5d4d" }} />;
}
