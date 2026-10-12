// "Show me an example": four short screens on one real curated market (the disputed example),
// in everyday words. Used as the second onboarding screen and from TODAY ("How it works, with an example").
import React, { useState, useSyncExternalStore } from "react";
import { Modal, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../Text";
import { t, useLang, type Key } from "../i18n";
import { alpha, C, PX, STATUS, T } from "../theme";
import { Button, Chip, LiveMascot, PixelBox, Press, Scanlines } from "../ui";
import { PixelIcon, type Mood } from "../sprites";

/** The curated "Disputed, not settled" example (EXAMPLES[0] in tabs/shared.tsx). Market text stays as Polymarket wrote it. */
export const EXAMPLE_MARKET = { key: "5186278", question: "Adam Idah: 1+ goals + assists" };

const STEPS = 4;
const MOODS: Mood[] = ["idle", "idle", "alarm", "cheer"];

/** The market card, with what has happened so far at this step. */
function ExampleCard({ step }: { step: number }) {
  const caution = STATUS.caution?.color ?? C.orange;
  const border = step >= 2 ? caution : C.line;
  return (
    <PixelBox border={border} bg={step >= 2 ? alpha(caution, 0.1) : C.surfaceHi} lift="#0d1710" inner={{ padding: 14, gap: 10 }}>
      <Text style={st.q}>{EXAMPLE_MARKET.question}</Text>
      <View style={st.row}>
        <Chip text={t("learn.yes")} color={C.green} />
        <Chip text={t("learn.no")} color={C.orange} />
      </View>
      {step >= 1 ? (
        <View style={st.row}>
          <Chip text={t("ex.walk.said")} color={C.purpleSoft} />
          {step >= 2 ? <Chip text={t("status.caution.word")} color={caution} /> : null}
        </View>
      ) : null}
      {step >= 3 ? (
        <View style={[st.row, { alignItems: "center" }]}>
          <PixelIcon name="check" px={2} color={C.green} />
          <Chip text={t("chip.verifiedOnDevice")} color={C.green} />
        </View>
      ) : null}
    </PixelBox>
  );
}

/** Full-screen walkthrough. `onWatch` adds the market (quietly); `onClose` leaves without adding. */
export function ExampleWalkthrough({ onWatch, onClose }: { onWatch: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  useLang();
  const last = step === STEPS - 1;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <LiveMascot mood={MOODS[step]} px={6} />
        </View>
        <Text style={st.kicker}>
          {t("ex.walk.kicker")} . {t("learn.step", { n: step + 1, total: STEPS })}
        </Text>
        <ExampleCard step={step} />
        {/* Callout bubble pointing at the card */}
        <View style={st.tail} />
        <PixelBox border={C.teal} bg={alpha(C.teal, 0.14)} inner={{ padding: 14 }}>
          <Text style={st.bubble}>{t(`ex.walk.s${step + 1}` as Key)}</Text>
        </PixelBox>
      </ScrollView>
      <View style={st.dots}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View key={i} style={[st.pip, i === step && { backgroundColor: C.green }, i < step && { backgroundColor: C.greenDeep }]} />
        ))}
      </View>
      {last ? (
        <Button title={t("ex.walk.watch")} onPress={onWatch} />
      ) : (
        <View style={st.between}>
          <Button kind="ghost" title={t("common.back")} onPress={() => (step === 0 ? onClose() : setStep(step - 1))} />
          <Button title={t("common.next")} onPress={() => setStep(step + 1)} />
        </View>
      )}
      <Press onPress={onClose} label={t("onb.plain.skip")} haptics={false}>
        <Text style={st.link}>{last ? t("common.close") : t("onb.plain.skip")}</Text>
      </Press>
    </View>
  );
}

// Open state for the TODAY entry point.
let open = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const setOpen = (v: boolean) => {
  open = v;
  listeners.forEach((fn) => fn());
};
export const openExample = () => setOpen(true);

/** TODAY link: "How it works, with an example". */
export function ExampleLink() {
  return (
    <Press onPress={openExample} label={t("home.exampleLink")}>
      <Text style={st.homeLink}>{t("home.exampleLink")}</Text>
    </Press>
  );
}

export function ExampleModal({ onWatch }: { onWatch: () => void }) {
  const visible = useSyncExternalStore(subscribe, () => open, () => open);
  return (
    <Modal visible={visible} statusBarTranslucent animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={st.root}>
        <View style={st.wrap}>
          {visible ? (
            <ExampleWalkthrough
              onWatch={() => {
                setOpen(false);
                onWatch();
              }}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </View>
        <Scanlines />
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  wrap: { flex: 1, padding: 24, paddingTop: 52 },
  kicker: { color: C.green, fontFamily: PX, fontSize: 9, lineHeight: 14, marginBottom: 10 },
  q: { color: C.text, fontSize: T.body + 1, fontWeight: "700", lineHeight: 22 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tail: { alignSelf: "center", width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 10, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: C.teal, marginTop: 12 },
  bubble: { color: C.text, fontSize: 16, lineHeight: 24 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", marginVertical: 18 },
  pip: { width: 10, height: 10, backgroundColor: C.line },
  between: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  link: { color: C.dim, fontSize: T.small, textAlign: "center", textDecorationLine: "underline", paddingVertical: 14 },
  homeLink: { color: C.teal, fontSize: T.small, textDecorationLine: "underline", paddingVertical: 8 },
});
