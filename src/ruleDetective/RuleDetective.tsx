import React, { useMemo, useState } from "react";
import { Modal, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../Text";
import { joinList, t } from "../i18n";
import raw from "./cases.json";
import { dayOf, XP, type ActionKind } from "../game";
import { puzzleNumber } from "../dailyDispute/logic";
import { alpha, C, PX, T } from "../theme";
import { Button, LiveMascot, PixelBox, Press, Reveal, Scanlines } from "../ui";
import { PixelIcon } from "../sprites";
import * as haptic from "../haptic";
import { caseIndex, kindHint, kindLabel, otherKinds, segments, type Case } from "./logic";

const CASES = raw as Case[];

export function RuleDetectiveCard({ onOpen }: { onOpen: () => void }) {
  return (
    <Press onPress={onOpen} label={t("rd.open")}>
      <PixelBox border={C.teal} bg="#0e2229" style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PixelIcon name="eye" px={5} color={C.teal} />
        <View style={{ flex: 1 }}>
          <Text style={st.kicker}>{t("rd.kicker")}</Text>
          <Text style={st.cardText}>{t("rd.card", { xp: XP.rule_play })}</Text>
        </View>
      </PixelBox>
    </Press>
  );
}

export function RuleDetectiveModal(props: { visible: boolean; onClose: () => void; award: (kind: ActionKind, ref: string) => void; overlay?: React.ReactNode }) {
  const day = dayOf(new Date());
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const idx = caseIndex(puzzleNumber(day), step, CASES.length);
  const c = CASES[idx];
  const segs = useMemo(() => segments(c), [c]);

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    haptic.tap();
    props.award("rule_play", c.id);
  };
  const next = () => {
    setPicked(null);
    setStep((s) => s + 1);
  };

  return (
    <Modal visible={props.visible} statusBarTranslucent animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={st.root}>
        <ScrollView contentContainerStyle={st.scroll}>
          <View style={st.head}>
            <View style={st.rowBetween}>
              <Button small kind="ghost" title={t("common.back")} onPress={props.onClose} />
              <Text style={st.count}>{t("rd.count", { n: (step % CASES.length) + 1, total: CASES.length })}</Text>
            </View>
            <View style={[st.rowBetween, { marginTop: 18 }]}>
              <Text style={st.title}>{t("rd.title")}</Text>
              <LiveMascot mood={picked === null ? "idle" : "cheer"} px={5} />
            </View>
          </View>

          <PixelBox border={C.teal} style={{ marginTop: 16 }} inner={{ padding: 16 }}>
            <Text style={st.label}>{t("common.theMarket")}</Text>
            <Text style={st.question}>{c.q}</Text>
            <Text style={[st.label, { marginTop: 16 }]}>{t("rd.rules")}</Text>
            <Text style={st.rules}>
              {segs.map((s, i) =>
                s.phrase === undefined ? (
                  <Text key={i}>{s.text}</Text>
                ) : (
                  <Text
                    key={i}
                    onPress={() => pick(s.phrase as number)}
                    accessibilityRole="button"
                    style={[st.phrase, picked === s.phrase && st.phraseOn]}
                  >
                    {s.text}
                  </Text>
                )
              )}
            </Text>
          </PixelBox>

          {picked === null ? (
            <Reveal>
              <Text style={st.ask}>{t("rd.ask")}</Text>
              <Text style={[st.dim, { textAlign: "center", marginTop: 8 }]}>{t("rd.noWrong")}</Text>
            </Reveal>
          ) : (
            <Reveal>
              <PixelBox border={C.green} bg={alpha(C.green, 0.08)} style={{ marginTop: 16 }} inner={{ padding: 16 }}>
                <Text style={st.result}>{kindLabel(c.phrases[picked].kind).toUpperCase()}</Text>
                <Text style={st.hint}>{kindHint(c.phrases[picked].kind)}</Text>
                {otherKinds(c, picked).length ? (
                  <Text style={[st.dim, { marginTop: 10 }]}>{t("rd.also", { list: joinList(otherKinds(c, picked).map((k) => kindLabel(k).toLowerCase())) })}</Text>
                ) : null}
                <Text style={[st.dim, { marginTop: 10 }]}>{t("rd.disclaimer")}</Text>
              </PixelBox>
              <View style={{ marginTop: 14 }}>
                <Button title={t("rd.next")} onPress={next} />
              </View>
            </Reveal>
          )}
        </ScrollView>
        {props.overlay}
        <Scanlines />
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 56 },
  head: { marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 18, backgroundColor: "#0b1c22", borderBottomWidth: 4, borderBottomColor: C.teal },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  count: { color: C.teal, fontFamily: PX, fontSize: 9, lineHeight: 14, flexShrink: 1, textAlign: "right" },
  title: { color: C.greenBright, fontFamily: PX, fontSize: 18, lineHeight: 28 },
  kicker: { color: C.teal, fontFamily: PX, fontSize: 9, lineHeight: 14, marginBottom: 8 },
  cardText: { color: C.text, fontSize: T.body, lineHeight: 21 },
  label: { color: C.dim, fontFamily: PX, fontSize: 8, marginBottom: 8 },
  question: { color: C.text, fontSize: 18, fontWeight: "700", lineHeight: 25 },
  rules: { color: C.text, fontSize: 17, lineHeight: 30 },
  phrase: { color: C.teal, textDecorationLine: "underline", fontWeight: "700" },
  phraseOn: { backgroundColor: alpha(C.teal, 0.3), color: C.greenBright },
  ask: { color: C.text, fontFamily: PX, fontSize: 10, lineHeight: 18, marginTop: 20, textAlign: "center" },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18 },
  result: { color: C.green, fontFamily: PX, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  hint: { color: C.text, fontSize: T.body + 1, lineHeight: 23 },
});
