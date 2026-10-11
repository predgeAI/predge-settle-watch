import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { alpha, C, PX, T } from "../theme";
import { Button, Chip, LiveMascot, PixelBox, Press, Scanlines } from "../ui";
import { PixelIcon } from "../sprites";
import { fetchPopular, fetchSegment, fmtInt, fmtVolume, tierOf, type DiscoverMarket, type Segment, type Tier } from "./api";

const TIER_COLOR: Record<Tier, string> = { low: C.green, mid: C.purpleSoft, high: C.orange };
const TIER_LABEL: Record<Tier, string> = { low: "LOW", mid: "MEDIUM", high: "HIGH" };

export function DiscoverCard({ onOpen }: { onOpen: () => void }) {
  return (
    <Press onPress={onOpen} label="Open Discover">
      <PixelBox border={C.green} style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PixelIcon name="bell" px={5} color={C.green} />
        <View style={{ flex: 1 }}>
          <Text style={st.kicker}>DISCOVER</Text>
          <Text style={st.cardText}>Popular open markets, each with a plain dispute statistic. Tap WATCH to follow one.</Text>
        </View>
      </PixelBox>
    </Press>
  );
}

function Row({ m, watching, onWatch }: { m: DiscoverMarket; watching: boolean; onWatch: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [seg, setSeg] = useState<Segment | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && seg === undefined) {
      try {
        setErr(null);
        setSeg(await fetchSegment(m.id));
      } catch (e) {
        setErr((e as Error).message || "Could not load the statistic.");
      }
    }
  };
  const tier = seg ? tierOf(seg.rate) : null;
  return (
    <PixelBox border={open && tier ? TIER_COLOR[tier] : C.line} style={{ marginTop: 12 }} inner={{ padding: 14 }}>
      <Press onPress={toggle} label={m.question}>
        <Text style={st.q}>{m.question}</Text>
        <Text style={st.dim}>
          {m.endDate ? `Ends ${m.endDate} . ` : ""}24 h volume {fmtVolume(m.volume24hr)}
        </Text>
      </Press>
      {open ? (
        <View style={{ marginTop: 12 }}>
          {seg === undefined && !err ? <ActivityIndicator color={C.green} /> : null}
          {err ? <Text style={[st.dim, { color: C.orange }]}>{err}</Text> : null}
          {seg === null ? <Text style={st.dim}>No category statistic for this market yet.</Text> : null}
          {seg && tier ? (
            <>
              <View style={st.rowWrap}>
                <Chip text={`DISPUTE RATE ${TIER_LABEL[tier]}`} color={TIER_COLOR[tier]} />
                <Chip text={seg.segment.toUpperCase()} color={C.dim} />
              </View>
              <Text style={[st.stat, { color: TIER_COLOR[tier] }]}>{(seg.rate * 100).toFixed(1)}%</Text>
              <Text style={st.body}>
                of {seg.segment} markets like this were disputed in 2026 ({fmtInt(seg.disputed)} of {fmtInt(seg.markets)}).
              </Text>
              <Text style={[st.dim, { marginTop: 6 }]}>A category statistic from Predge. It is not a prediction about this market.</Text>
            </>
          ) : null}
          <View style={{ marginTop: 12 }}>
            {watching ? <Chip text="WATCHING" color={C.green} /> : <Button small title="Watch" onPress={() => onWatch(m.id)} />}
          </View>
        </View>
      ) : null}
    </PixelBox>
  );
}

export function DiscoverModal(props: { visible: boolean; onClose: () => void; watchingIds: string[]; onWatch: (id: string) => void; overlay?: React.ReactNode }) {
  const [list, setList] = useState<DiscoverMarket[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    setList(null);
    try {
      setList(await fetchPopular());
    } catch {
      setErr("Could not load markets. Check your connection and try again.");
    }
  }, []);
  useEffect(() => {
    if (props.visible && list === null && !err) load();
  }, [props.visible, list, err, load]);

  return (
    <Modal visible={props.visible} statusBarTranslucent animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={st.root}>
        <ScrollView contentContainerStyle={st.scroll}>
          <View style={st.head}>
            <View style={st.rowBetween}>
              <Button small kind="ghost" title="Back" onPress={props.onClose} />
              <Button small kind="ghost" title="Refresh" onPress={load} />
            </View>
            <View style={[st.rowBetween, { marginTop: 18 }]}>
              <Text style={st.title}>DISCOVER</Text>
              <LiveMascot mood={err ? "sleep" : "idle"} px={5} />
            </View>
            <Text style={[st.dim, { marginTop: 8 }]}>Popular open Polymarket markets. Tap one to see its category statistic.</Text>
          </View>
          {list === null && !err ? (
            <View style={{ marginTop: 30 }}>
              <ActivityIndicator color={C.green} />
            </View>
          ) : null}
          {err ? (
            <PixelBox border={C.orange} style={{ marginTop: 16 }} inner={{ padding: 16 }}>
              <Text style={st.body}>{err}</Text>
              <View style={{ marginTop: 12 }}>
                <Button title="Try again" onPress={load} />
              </View>
            </PixelBox>
          ) : null}
          {list && list.length === 0 ? <Text style={[st.dim, { marginTop: 20 }]}>No markets to show right now.</Text> : null}
          {list?.map((m) => (
            <Row key={m.id} m={m} watching={props.watchingIds.includes(m.id)} onWatch={props.onWatch} />
          ))}
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
  head: { marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 18, backgroundColor: "#0f2616", borderBottomWidth: 4, borderBottomColor: C.green },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  title: { color: C.greenBright, fontFamily: PX, fontSize: 18 },
  kicker: { color: C.green, fontFamily: PX, fontSize: 9, marginBottom: 8 },
  cardText: { color: C.text, fontSize: T.body, lineHeight: 21 },
  q: { color: C.text, fontSize: T.body + 1, fontWeight: "700", lineHeight: 22 },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18, marginTop: 4 },
  body: { color: C.text, fontSize: T.body, lineHeight: 21 },
  stat: { fontFamily: PX, fontSize: 24, marginVertical: 10 },
});
