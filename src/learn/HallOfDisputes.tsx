// HALL OF DISPUTES: a PLAY card that opens a pixel list of well-known disputed markets (data in ./hall).
import React, { useState } from "react";
import { Linking, Modal, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../Text";
import { fmtNum, t, tk, tn } from "../i18n";
import { alpha, C, PX, T } from "../theme";
import { Button, Chip, PixelBox, Press, Scanlines } from "../ui";
import { PixelIcon } from "../sprites";
import { showDialog } from "../dialog";
import { HALL, POLYGON_TX, type HallCase, type Outcome } from "./hallCases";

// The app registers its add-market path here (LearnHost's onWatch), so PLAY needs no extra props.
let watch: ((marketId: string) => Promise<boolean> | boolean | void) | null = null;
export function setHallWatchHandler(fn: typeof watch): void {
  watch = fn;
}

const outcome = (o: Outcome) => (o === "Yes" ? t("learn.yes") : t("learn.no"));
const day = (iso: string) => iso.slice(0, 10);

function Step({ text, color, last }: { text: string; color: string; last?: boolean }) {
  return (
    <View style={st.stepRow}>
      <Chip text={text} color={color} />
      {last ? null : <Text style={st.arrow}>{">"}</Text>}
    </View>
  );
}

function CaseCard({ c, onWatch }: { c: HallCase; onWatch: (c: HallCase) => void }) {
  const lastTx = c.disputes[c.disputes.length - 1]?.tx;
  return (
    <PixelBox border={C.orange} bg={alpha(C.orange, 0.06)} style={{ marginTop: 14 }} inner={{ padding: 14, gap: 10 }}>
      <Text style={st.q}>{c.question}</Text>
      <Text style={st.meta}>
        {day(c.dates.firstDispute)} · {tn("hall.disputes", c.disputes.length)}
        {c.volumeUsd ? ` · ${t("hall.volume", { usd: fmtNum(String(Math.round(c.volumeUsd))) })}` : ""}
      </Text>
      <View style={st.timeline} accessibilityLabel={t("hall.timelineA11y")}>
        <Step text={t("hall.step.proposed")} color={C.purpleSoft} />
        <Step text={t("hall.step.disputed", { n: c.disputes.length })} color={C.orange} />
        {c.umaVote ? <Step text={t("hall.step.vote")} color={C.teal} /> : null}
        <Step text={t("hall.step.settled")} color={C.green} last />
      </View>
      <Text style={st.result}>{t("hall.result", { proposed: outcome(c.proposedThen), settled: outcome(c.settled) })}</Text>
      <Text style={st.lesson}>{tk(`hall.lesson.${c.id}`, c.lesson)}</Text>
      <View style={st.btnRow}>
        <View style={{ flex: 1 }}>
          <Button small title={t("hall.watch")} onPress={() => onWatch(c)} />
        </View>
        {lastTx ? (
          <View style={{ flex: 1 }}>
            <Button small kind="ghost" title={t("hall.tx")} onPress={() => void Linking.openURL(POLYGON_TX(lastTx)).catch(() => undefined)} />
          </View>
        ) : null}
      </View>
      <Text style={st.src}>{t("hall.source", { date: c.verifiedAt })}</Text>
    </PixelBox>
  );
}

function HallModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const onWatch = (c: HallCase) => {
    if (!watch) {
      void Linking.openURL(c.sources.find((s) => s.startsWith("https://polymarket.com/")) ?? c.sources[0]).catch(() => undefined);
      return;
    }
    onClose();
    Promise.resolve(watch(c.marketId))
      .then((ok) => {
        if (ok !== false) showDialog(t("hall.addedTitle"), t("hall.addedBody", { tab: t("tab.today"), q: c.question }));
      })
      .catch(() => undefined);
  };
  return (
    <Modal visible={visible} statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={st.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.scroll}>
          <View style={st.head}>
            <View style={{ alignSelf: "flex-start" }}>
              <Button small kind="ghost" title={t("common.back")} onPress={onClose} />
            </View>
            <Text style={st.title} accessibilityRole="header">
              {t("hall.title")}
            </Text>
            <Text style={st.sub}>{t("hall.sub")}</Text>
          </View>
          {HALL.map((c) => (
            <CaseCard key={c.id} c={c} onWatch={onWatch} />
          ))}
          <Text style={[st.src, { marginTop: 18 }]}>{t("hall.footer")}</Text>
        </ScrollView>
      </SafeAreaView>
      <Scanlines />
      </View>
    </Modal>
  );
}

/** PLAY tab card: "HALL OF DISPUTES". Owns its modal, so PLAY only renders this element. */
export function HallCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Press onPress={() => setOpen(true)} label={t("hall.open")}>
        <PixelBox border={C.orange} bg={alpha(C.orange, 0.08)} style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <PixelIcon name="caution" px={5} color={C.orange} />
          <View style={{ flex: 1 }}>
            <Text style={st.entryKicker}>{t("hall.title")}</Text>
            <Text style={st.entryText}>{t("hall.cardBody", { n: HALL.length })}</Text>
          </View>
        </PixelBox>
      </Press>
      <HallModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 56 },
  head: { marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 18, backgroundColor: "#2a160c", borderBottomWidth: 4, borderBottomColor: C.orange },
  title: { color: C.orange, fontFamily: PX, fontSize: 16, lineHeight: 24, marginTop: 18 },
  sub: { color: C.dim, fontSize: T.small, lineHeight: 19, marginTop: 10 },
  q: { color: C.text, fontSize: T.body, lineHeight: 21, fontWeight: "700" },
  meta: { color: C.dim, fontSize: T.small, lineHeight: 18 },
  timeline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 6 },
  stepRow: { flexDirection: "row", alignItems: "center" },
  arrow: { color: C.dim, fontFamily: PX, fontSize: 9, marginHorizontal: 6 },
  result: { color: C.text, fontFamily: PX, fontSize: 9, lineHeight: 15 },
  lesson: { color: C.text, fontSize: T.body, lineHeight: 21 },
  btnRow: { flexDirection: "row", gap: 10 },
  src: { color: C.dim, fontSize: 11, lineHeight: 15 },
  entryKicker: { color: C.orange, fontFamily: PX, fontSize: 9, lineHeight: 15, marginBottom: 6 },
  entryText: { color: C.text, fontSize: T.body, lineHeight: 21 },
});
