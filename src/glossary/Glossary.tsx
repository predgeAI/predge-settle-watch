import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { alpha, C, PX, T } from "../theme";
import { Button, Chip, PixelBox, Press, Scanlines, useReducedMotion } from "../ui";
import { PixelIcon } from "../sprites";
import * as haptic from "../haptic";
import type { GameState } from "../game";
import { CARDS, unlockedCards, type Card } from "./cards";
import { loadSeen, saveSeen } from "./store";

function useSeen(game: GameState, refreshKey: number) {
  const [seen, setSeen] = useState<string[] | null>(null);
  useEffect(() => {
    loadSeen().then(setSeen);
  }, [refreshKey]);
  const unlocked = unlockedCards(game);
  const fresh = seen === null ? [] : unlocked.filter((id) => !seen.includes(id));
  const markSeen = useCallback(
    (ids: string[]) => {
      setSeen((prev) => {
        const next = Array.from(new Set([...(prev ?? []), ...ids]));
        saveSeen(next).catch(() => undefined);
        return next;
      });
    },
    []
  );
  return { unlocked, fresh, markSeen };
}

/** Home entry: how many cards you have and whether there is a new one. */
export function GlossaryEntry({ game, refreshKey, onOpen }: { game: GameState; refreshKey: number; onOpen: () => void }) {
  const { unlocked, fresh } = useSeen(game, refreshKey);
  return (
    <Press onPress={onOpen} label="Open the card collection">
      <PixelBox style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PixelIcon name="medal" px={4} color={C.greenBright} />
        <View style={{ flex: 1 }}>
          <Text style={st.entryKicker}>CARD COLLECTION</Text>
          <Text style={st.entryText}>
            {unlocked.length} of {CARDS.length} cards. Plain-English facts you unlock as you play.
          </Text>
        </View>
        {fresh.length ? <Chip text={`${fresh.length} NEW`} color={C.orange} /> : null}
      </PixelBox>
    </Press>
  );
}

/** Large card that flips between its picture side and its text side. */
function CardViewer({ card, onClose }: { card: Card; onClose: () => void }) {
  const flip = useRef(new Animated.Value(0)).current;
  const [back, setBack] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const id = setTimeout(() => toggle(true), reduced ? 0 : 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = (to?: boolean) => {
    const target = to ?? !back;
    setBack(target);
    haptic.tap();
    Animated.timing(flip, { toValue: target ? 1 : 0, duration: reduced ? 1 : 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  };
  const rotFront = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const rotBack = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  return (
    <View style={st.viewer}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close card" />
      <Pressable onPress={() => toggle()} accessibilityRole="button" accessibilityLabel={back ? `${card.title}. Tap to flip.` : `${card.title}. Tap to read.`}>
        <View style={{ width: 290, height: 380 }}>
          <Animated.View style={[st.face, { transform: [{ perspective: 900 }, { rotateY: rotFront }] }]}>
            <PixelBox border={card.color} bg={C.surfaceHi} inner={st.faceInner} style={{ flex: 1 }}>
              <PixelIcon name={card.icon} px={14} color={card.color} />
              <Text style={[st.cardTitle, { color: card.color }]}>{card.title}</Text>
              <Text style={st.tap}>TAP TO READ</Text>
            </PixelBox>
          </Animated.View>
          <Animated.View style={[st.face, { transform: [{ perspective: 900 }, { rotateY: rotBack }] }]}>
            <PixelBox border={card.color} bg={C.surfaceHi} inner={st.faceInner} style={{ flex: 1 }}>
              <PixelIcon name={card.icon} px={5} color={card.color} />
              <Text style={[st.cardTitle, { color: card.color, fontSize: 12 }]}>{card.title}</Text>
              <Text style={st.cardBody}>{card.text}</Text>
            </PixelBox>
          </Animated.View>
        </View>
      </Pressable>
      <View style={{ marginTop: 18, width: 290 }}>
        <Button title="Close" onPress={onClose} />
      </View>
    </View>
  );
}

export function GlossaryModal(props: { visible: boolean; onClose: () => void; game: GameState; refreshKey: number }) {
  const { unlocked, fresh, markSeen } = useSeen(props.game, props.refreshKey);
  const [open, setOpen] = useState<Card | null>(null);
  return (
    <Modal visible={props.visible} statusBarTranslucent animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={st.root}>
        <ScrollView contentContainerStyle={st.scroll}>
          <View style={st.head}>
            <Button small kind="ghost" title="Back" onPress={props.onClose} />
            <Text style={st.title}>CARD COLLECTION</Text>
            <Text style={st.sub}>
              {unlocked.length} of {CARDS.length} cards. Unlock more by watching, verifying, clocking in and playing.
            </Text>
          </View>
          <View style={st.grid}>
            {CARDS.map((c) => {
              const ok = unlocked.includes(c.id);
              const isNew = fresh.includes(c.id);
              return (
                <View key={c.id} style={{ width: "48%", flexGrow: 1 }}>
                  <Press
                    label={ok ? c.title : `Locked card. ${c.hint}`}
                    disabled={!ok}
                    onPress={() => {
                      setOpen(c);
                      markSeen([c.id]);
                    }}
                  >
                    <PixelBox border={ok ? c.color : C.line} bg={ok ? alpha(c.color, 0.1) : C.surface} inner={st.cell}>
                      {isNew ? (
                        <View style={st.newTag}>
                          <Chip text="NEW" color={C.orange} />
                        </View>
                      ) : null}
                      <PixelIcon name={ok ? c.icon : "question"} px={6} color={ok ? c.color : "#3a4a3f"} />
                      <Text style={[st.cellTitle, !ok && { color: C.dim }]}>{ok ? c.title : "LOCKED"}</Text>
                      <Text style={st.cellHint}>{ok ? "Tap to read" : c.hint}</Text>
                    </PixelBox>
                  </Press>
                </View>
              );
            })}
          </View>
        </ScrollView>
        {open ? <CardViewer card={open} onClose={() => setOpen(null)} /> : null}
        <Scanlines />
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 56 },
  head: { marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 18, backgroundColor: "#160f2b", borderBottomWidth: 4, borderBottomColor: C.purple },
  title: { color: C.greenBright, fontFamily: PX, fontSize: 16, marginTop: 18 },
  sub: { color: C.dim, fontSize: T.small, lineHeight: 19, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  cell: { padding: 12, alignItems: "center", gap: 10, minHeight: 150, justifyContent: "center" },
  cellTitle: { color: C.text, fontFamily: PX, fontSize: 9, lineHeight: 14, textAlign: "center" },
  cellHint: { color: C.dim, fontSize: 12, textAlign: "center", lineHeight: 16 },
  newTag: { position: "absolute", top: 4, right: 4 },
  entryKicker: { color: C.greenBright, fontFamily: PX, fontSize: 9, marginBottom: 8 },
  entryText: { color: C.text, fontSize: T.body, lineHeight: 21 },
  viewer: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000dd", alignItems: "center", justifyContent: "center", zIndex: 50 },
  face: { ...StyleSheet.absoluteFillObject, backfaceVisibility: "hidden" },
  faceInner: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", gap: 18 },
  cardTitle: { fontFamily: PX, fontSize: 14, lineHeight: 22, textAlign: "center" },
  cardBody: { color: C.text, fontSize: 17, lineHeight: 26, textAlign: "center" },
  tap: { color: C.dim, fontFamily: PX, fontSize: 8, marginTop: 6 },
});
