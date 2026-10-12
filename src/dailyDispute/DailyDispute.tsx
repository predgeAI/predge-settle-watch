import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../Text";
import { t } from "../i18n";
import * as Clipboard from "expo-clipboard";
import raw from "./puzzles.json";
import { dayOf, XP, type ActionKind } from "../game";
import { alpha, C, PX, T } from "../theme";
import { Burst, Button, LiveMascot, PixelBox, Press, Reveal, Scanlines } from "../ui";
import { PixelIcon } from "../sprites";
import * as haptic from "../haptic";
import { loadPuzzleState, savePuzzleState } from "./store";
import { liveStreak, NEW_PUZZLE_STATE, play, playedToday, puzzleFor, revealLine, shareText, type Pick, type Puzzle, type PuzzleState } from "./logic";

const PUZZLES = raw as Puzzle[];

function useState_() {
  const [s, setS] = useState<PuzzleState>(NEW_PUZZLE_STATE);
  const [ready, setReady] = useState(false);
  const reload = useCallback(() => {
    loadPuzzleState().then((v) => {
      setS(v);
      setReady(true);
    });
  }, []);
  useEffect(reload, [reload]);
  return { s, setS, ready, reload };
}

/** Home card. Reloads whenever `refreshKey` changes (for example after the modal closes). */
export function DailyDisputeCard({ refreshKey, onOpen }: { refreshKey: number; onOpen: () => void }) {
  const { s, reload } = useState_();
  useEffect(reload, [refreshKey, reload]);
  const day = dayOf(new Date());
  const { number } = puzzleFor(day, PUZZLES);
  const played = playedToday(s, day);
  const streak = liveStreak(s, day);
  return (
    <Press onPress={onOpen} label={t("dd.open")}>
      <PixelBox border={C.purple} bg="#1b1233" style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PixelIcon name="question" px={5} color={played ? C.green : C.purpleSoft} />
        <View style={{ flex: 1 }}>
          <Text style={st.kicker}>{t("dd.kicker", { n: number })}</Text>
          {played ? (
            <Text style={st.cardText}>
              {played.correct ? t("dd.calledIt") : t("dd.missed")} {t("dd.nextStreak", { n: streak })}
            </Text>
          ) : (
            <Text style={st.cardText}>{t("dd.cardPrompt", { xp: XP.puzzle_win })}</Text>
          )}
        </View>
      </PixelBox>
    </Press>
  );
}

export function DailyDisputeModal(props: { visible: boolean; onClose: () => void; award: (kind: ActionKind, ref: string) => void; overlay?: React.ReactNode }) {
  const { s, setS, ready, reload } = useState_();
  const [just, setJust] = useState(0); // bumps to replay the reveal animation
  const [copied, setCopied] = useState(false);
  const day = dayOf(new Date());
  const { number, puzzle } = useMemo(() => puzzleFor(day, PUZZLES), [day]);
  const played = playedToday(s, day);

  useEffect(() => {
    if (props.visible) {
      reload();
      setCopied(false);
    }
  }, [props.visible, reload]);

  const choose = async (pick: Pick) => {
    if (played || !ready) return;
    const r = play(s, day, pick, puzzle);
    if (r.already) return;
    setS(r.state);
    setJust((n) => n + 1);
    await savePuzzleState(r.state);
    if (r.correct) haptic.verifySteps(3);
    else haptic.rejected();
    props.award(r.correct ? "puzzle_win" : "puzzle_play", day);
  };

  const share = async () => {
    if (!played) return;
    await Clipboard.setStringAsync(shareText(number, played.correct, liveStreak(s, day)));
    haptic.tap();
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <Modal visible={props.visible} statusBarTranslucent animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={st.root}>
        <ScrollView contentContainerStyle={st.scroll}>
          <View style={st.head}>
            <View style={st.rowBetween}>
              <Button small kind="ghost" title={t("common.back")} onPress={props.onClose} />
              <Text style={st.headStreak}>{t("dd.streak", { n: liveStreak(s, day) })}</Text>
            </View>
            <View style={[st.rowBetween, { marginTop: 18 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.title}>{t("dd.title")}</Text>
                <Text style={st.num}>#{number}</Text>
              </View>
              <LiveMascot mood={played ? (played.correct ? "cheer" : "alarm") : "idle"} px={5} />
            </View>
          </View>

          <PixelBox border={C.purple} bg={C.surface} style={{ marginTop: 16 }} inner={{ padding: 16 }}>
            <Text style={st.label}>{t("common.theMarket")}</Text>
            <Text style={st.question}>{puzzle.q}</Text>
            <Text style={[st.dim, { marginTop: 6 }]}>{t("dd.firstDisputed", { date: puzzle.date })}</Text>
            <View style={{ marginTop: 14 }}>
              <PixelBox p={3} border={C.purpleSoft} bg="#1b1233" inner={{ padding: 12 }}>
                <Text style={st.label}>{t("dd.proposed")}</Text>
                <Text style={st.proposal}>{puzzle.proposal.toUpperCase()}</Text>
              </PixelBox>
            </View>
          </PixelBox>

          {!played ? (
            <Reveal>
              <Text style={st.ask}>{t("dd.ask")}</Text>
              <View style={st.choices}>
                <View style={{ flex: 1 }}>
                  <Press onPress={() => choose("hold")} label={t("dd.holdLabel")} haptics>
                    <PixelBox border="#2f6b38" bg={C.green} lift="#2f6b38" inner={{ paddingVertical: 18, alignItems: "center", gap: 6 }}>
                      <Text style={st.choiceText}>{t("dd.hold")}</Text>
                      <Text style={st.choiceSub}>{t("dd.holdSub")}</Text>
                    </PixelBox>
                  </Press>
                </View>
                <View style={{ flex: 1 }}>
                  <Press onPress={() => choose("change")} label={t("dd.changeLabel")} haptics>
                    <PixelBox border="#8a3e1a" bg={C.orange} lift="#8a3e1a" inner={{ paddingVertical: 18, alignItems: "center", gap: 6 }}>
                      <Text style={st.choiceText}>{t("dd.change")}</Text>
                      <Text style={st.choiceSub}>{t("dd.changeSub")}</Text>
                    </PixelBox>
                  </Press>
                </View>
              </View>
              <Text style={[st.dim, { marginTop: 12, textAlign: "center" }]}>{t("dd.noMoney")}</Text>
            </Reveal>
          ) : (
            <Reveal key={`r${just}`}>
              <PixelBox border={played.correct ? C.green : C.orange} bg={alpha(played.correct ? C.green : C.orange, 0.1)} style={{ marginTop: 16 }} inner={{ padding: 16 }}>
                <View style={st.revealHead}>
                  <Burst play={1} kind={played.correct ? "ok" : "bad"} size={64} haptic="none" />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.result, { color: played.correct ? C.green : C.orange }]}>{played.correct ? t("dd.niceCall") : t("dd.notThisTime")}</Text>
                    <Text style={st.xp}>+{played.correct ? XP.puzzle_win : XP.puzzle_play} XP</Text>
                  </View>
                </View>
                <Text style={st.yourCall}>{t("dd.youCalled", { pick: played.pick === "hold" ? t("dd.hold") : t("dd.change") })}</Text>
                <Text style={st.reveal}>{revealLine(puzzle)}</Text>
                <Text style={[st.dim, { marginTop: 8 }]}>{t("dd.nextBest", { n: liveStreak(s, day), best: s.best })}</Text>
              </PixelBox>
              <View style={{ marginTop: 14 }}>
                <Button title={copied ? t("common.copied") : t("dd.shareBtn")} onPress={share} />
              </View>
              <Text style={[st.dim, { marginTop: 8, textAlign: "center" }]}>{t("dd.copiesPlain")}</Text>
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
  head: { marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 18, backgroundColor: "#160f2b", borderBottomWidth: 4, borderBottomColor: C.purple },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  headStreak: { color: C.orange, fontFamily: PX, fontSize: 10 },
  title: { color: C.greenBright, fontFamily: PX, fontSize: 18, lineHeight: 26 },
  num: { color: C.purpleSoft, fontFamily: PX, fontSize: 14, marginTop: 10 },
  kicker: { color: C.purpleSoft, fontFamily: PX, fontSize: 9, lineHeight: 14, marginBottom: 8 },
  cardText: { color: C.text, fontSize: T.body, lineHeight: 21 },
  label: { color: C.dim, fontFamily: PX, fontSize: 8, marginBottom: 8 },
  question: { color: C.text, fontSize: 19, fontWeight: "700", lineHeight: 26 },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18 },
  proposal: { color: C.greenBright, fontFamily: PX, fontSize: 16, lineHeight: 24 },
  ask: { color: C.text, fontFamily: PX, fontSize: 11, lineHeight: 18, marginTop: 22, textAlign: "center" },
  choices: { flexDirection: "row", gap: 12, marginTop: 14 },
  choiceText: { color: "#07120a", fontFamily: PX, fontSize: 14, lineHeight: 20, textAlign: "center" },
  choiceSub: { color: "#07120a", fontSize: T.small, textAlign: "center" },
  revealHead: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 10 },
  result: { fontFamily: PX, fontSize: 14, lineHeight: 22 },
  xp: { color: C.text, fontFamily: PX, fontSize: 12, marginTop: 8 },
  yourCall: { color: C.dim, fontFamily: PX, fontSize: 9, marginTop: 6 },
  reveal: { color: C.text, fontSize: T.body + 1, lineHeight: 23, marginTop: 10 },
});
