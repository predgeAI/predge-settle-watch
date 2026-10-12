// The receipt card screen: shows the card, shares the explorer link with Android's share sheet,
// and copies the 1080 x 1350 PNG to the clipboard (the app has no file-sharing module, so the image
// travels by paste or screenshot).
import React, { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Modal, PixelRatio, SafeAreaView, ScrollView, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import * as Clipboard from "expo-clipboard";
import { Text } from "../Text";
import { t } from "../i18n";
import { C, PX, STATUS, T } from "../theme";
import { Button } from "../ui";
import * as haptic from "../haptic";
import { CARD_H, CARD_W, cardShapes, FONT_FAMILY, type CardInput } from "./card";
import type { Anchor, WatchItem } from "../store";
import { receiptCardInput, receiptFromAnchor, shareMessage, type ReceiptShare } from "./receipt";

// One card open at a time, opened from anywhere with openShareCard().
let current: ReceiptShare | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function openShareCard(r: ReceiptShare) {
  current = r;
  emit();
}
function closeShareCard() {
  current = null;
  emit();
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getCurrent = () => current;

function CardSvg({ input, width, svgRef }: { input: CardInput; width: number; svgRef?: React.Ref<Svg> }) {
  const shapes = useMemo(() => cardShapes(input), [input]);
  return (
    <Svg ref={svgRef} width={width} height={(width * CARD_H) / CARD_W} viewBox={`0 0 ${CARD_W} ${CARD_H}`}>
      {shapes.map((s, i) =>
        s.kind === "rect" ? (
          <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={s.fill} />
        ) : (
          <SvgText key={i} x={s.x} y={s.y} fontFamily={FONT_FAMILY[s.font]} fontSize={s.size} fontVariantLigatures="none" fontWeight={s.bold ? "700" : "400"} fill={s.fill} textAnchor={s.anchor}>
            {s.text}
          </SvgText>
        )
      )}
    </Svg>
  );
}

/** Mount once near the root. Renders nothing until openShareCard() is called. */
export function ShareCardHost() {
  const r = useSyncExternalStore(subscribe, getCurrent, getCurrent);
  return r ? <ShareCardModal receipt={r} onClose={closeShareCard} /> : null;
}

function ShareCardModal({ receipt, onClose }: { receipt: ReceiptShare; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const input = useMemo(() => receiptCardInput(receipt, STATUS[receipt.riskLevel]?.color ?? C.dim), [receipt]);
  const exportRef = useRef<Svg>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const previewW = Math.min(width - 32, 460);
  // Drawn off screen at exactly 1080 x 1350 device pixels, so the PNG has the card's real size.
  const exportW = CARD_W / PixelRatio.get();

  const shareLink = async () => {
    try {
      await Share.share({ message: shareMessage(receipt) });
    } catch {
      // The user closed the sheet or no app took it; nothing to report.
    }
  };

  const copyImage = () => {
    const svg = exportRef.current;
    if (!svg || busy) return;
    setBusy(true);
    try {
      svg.toDataURL(async (base64: string) => {
        try {
          await Clipboard.setImageAsync(base64.replace(/^data:image\/png;base64,/, ""));
          haptic.success();
          setNote(t("share.copied"));
        } catch {
          setNote(t("share.copyFailed"));
        } finally {
          setBusy(false);
        }
      });
    } catch {
      setNote(t("share.copyFailed"));
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={st.root}>
        <ScrollView contentContainerStyle={st.scroll}>
          <Text style={st.title}>{t("share.title")}</Text>
          <View style={st.cardWrap}>
            <CardSvg input={input} width={previewW} />
          </View>
          <Text style={st.hint}>{note ?? t("share.hint")}</Text>
          <View style={st.row}>
            <Button title={t("share.shareLink")} onPress={shareLink} style={st.flex} />
            <Button kind="ghost" title={t("share.copyImage")} onPress={copyImage} disabled={busy} style={st.flex} />
          </View>
          <Button kind="ghost" title={t("common.close")} onPress={onClose} style={{ marginTop: 10 }} />
        </ScrollView>
        <View style={st.offscreen} pointerEvents="none">
          <CardSvg input={input} width={exportW} svgRef={exportRef} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  title: { fontFamily: PX, fontSize: T.small, color: C.greenBright, marginBottom: 14, lineHeight: 20 },
  cardWrap: { alignItems: "center" },
  hint: { color: C.dim, fontSize: T.small, marginTop: 14, marginBottom: 12, lineHeight: 19 },
  row: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  offscreen: { position: "absolute", left: -10000, top: 0, opacity: 0 },
});

/** Opens the card for one of a market's receipts. */
export function shareReceipt(item: WatchItem, a: Pick<Anchor, "signature" | "packHash" | "riskLevel" | "at" | "cluster">) {
  openShareCard(receiptFromAnchor(item, a));
}
