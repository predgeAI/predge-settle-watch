import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../Text";
import { fmtDec, fmtNum, t, useLang, type Key } from "../i18n";
import { alpha, C, PX, T } from "../theme";
import { Button, Chip, LiveMascot, PixelBox, Press, Scanlines } from "../ui";
import { PixelIcon } from "../sprites";
import { fetchPopular, fetchSegment, fmtVolume, tierOf, type DiscoverMarket, type Segment, type Tier } from "./api";
import { changeFeedPrefs, leadsWithCryptoTech, rankFeed, setFeedMarkets, useFeed } from "./interests";
import { InterestChips } from "./FeedPicker";

const TIER_COLOR: Record<Tier, string> = { low: C.green, mid: C.purpleSoft, high: C.orange };
const tierLabel = (tier: Tier) => t(`dc.tier.${tier}` as Key);

export function DiscoverCard({ onOpen }: { onOpen: () => void }) {
  return (
    <Press onPress={onOpen} label={t("dc.open")}>
      <PixelBox border={C.green} style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PixelIcon name="bell" px={5} color={C.green} />
        <View style={{ flex: 1 }}>
          <Text style={st.kicker}>{t("dc.kicker")}</Text>
          <Text style={st.cardText}>{t("dc.card")}</Text>
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
        setErr((e as Error).message || t("dc.statFail"));
      }
    }
  };
  const tier = seg ? tierOf(seg.rate) : null;
  return (
    <PixelBox border={open && tier ? TIER_COLOR[tier] : C.line} style={{ marginTop: 12 }} inner={{ padding: 14 }}>
      <Press onPress={toggle} label={m.question}>
        <Text style={st.q}>{m.question}</Text>
        <Text style={st.dim}>
          {m.endDate ? t("dc.ends", { date: m.endDate }) : ""}
          {t("dc.volume", { v: fmtDec(fmtVolume(m.volume24hr)) })}
        </Text>
      </Press>
      {open ? (
        <View style={{ marginTop: 12 }}>
          {seg === undefined && !err ? <ActivityIndicator color={C.green} /> : null}
          {err ? <Text style={[st.dim, { color: C.orange }]}>{err}</Text> : null}
          {seg === null ? <Text style={st.dim}>{t("dc.noStat")}</Text> : null}
          {seg && tier ? (
            <>
              <View style={st.rowWrap}>
                <Chip text={t("dc.rate", { tier: tierLabel(tier) })} color={TIER_COLOR[tier]} />
                <Chip text={seg.segment.toUpperCase()} color={C.dim} />
              </View>
              <Text style={[st.stat, { color: TIER_COLOR[tier] }]}>{fmtDec((seg.rate * 100).toFixed(1))}%</Text>
              <Text style={st.body}>{t("dc.of", { segment: seg.segment, disputed: fmtNum(Math.round(seg.disputed)), markets: fmtNum(Math.round(seg.markets)) })}</Text>
              <Text style={[st.dim, { marginTop: 6 }]}>{t("dc.note")}</Text>
            </>
          ) : null}
          <View style={{ marginTop: 12 }}>
            {watching ? <Chip text={t("dc.watching")} color={C.green} /> : <Button small title={t("dc.watch")} onPress={() => onWatch(m.id)} />}
          </View>
        </View>
      ) : null}
    </PixelBox>
  );
}

/**
 * The Discover feed: header, popular markets and their dispute rates. Loads the first time it becomes visible.
 * Used inline by the Discover tab and inside DiscoverModal. Children render between the header and the list.
 */
export function DiscoverFeed(props: { visible: boolean; watchingIds: string[]; onWatch: (id: string) => void; onClose?: () => void; children?: React.ReactNode }) {
  const [list, setList] = useState<DiscoverMarket[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    setList(null);
    try {
      const got = await fetchPopular();
      setList(got);
      setFeedMarkets(got);
    } catch {
      setErr(t("dc.loadFail"));
    }
  }, []);
  useEffect(() => {
    if (props.visible && list === null && !err) load();
  }, [props.visible, list, err, load]);
  const { prefs } = useFeed();
  const lang = useLang();
  // Personal order: interests and country first; the list is never empty if the feed is not.
  const ranked = useMemo(() => (list ? rankFeed(list, prefs, { cryptoTechFirst: leadsWithCryptoTech(prefs, lang) }) : null), [list, prefs, lang]);

  return (
    <>
      <View style={st.head}>
        <View style={[st.rowBetween, !props.onClose && { justifyContent: "flex-end" }]}>
          {props.onClose ? <Button small kind="ghost" title={t("common.back")} onPress={props.onClose} /> : null}
          <Button small kind="ghost" title={t("dc.refresh")} onPress={load} />
        </View>
        <View style={[st.rowBetween, { marginTop: 18 }]}>
          <Text style={st.title}>{t("dc.kicker")}</Text>
          <LiveMascot mood={err ? "sleep" : "idle"} px={5} />
        </View>
        <Text style={[st.dim, { marginTop: 8 }]}>{t("dc.sub")}</Text>
        <View style={{ marginTop: 12 }}>
          <InterestChips prefs={prefs} onChange={changeFeedPrefs} />
        </View>
      </View>
      {props.children}
      {list === null && !err ? (
        <View style={{ marginTop: 30 }}>
          <ActivityIndicator color={C.green} />
        </View>
      ) : null}
      {err ? (
        <PixelBox border={C.orange} style={{ marginTop: 16 }} inner={{ padding: 16 }}>
          <Text style={st.body}>{err}</Text>
          <View style={{ marginTop: 12 }}>
            <Button title={t("common.tryAgain")} onPress={load} />
          </View>
        </PixelBox>
      ) : null}
      {list && list.length === 0 ? <Text style={[st.dim, { marginTop: 20 }]}>{t("dc.none")}</Text> : null}
      {ranked?.map(({ market: m }) => (
        <Row key={m.id} m={m} watching={props.watchingIds.includes(m.id)} onWatch={props.onWatch} />
      ))}
    </>
  );
}

export function DiscoverModal(props: { visible: boolean; onClose: () => void; watchingIds: string[]; onWatch: (id: string) => void; overlay?: React.ReactNode }) {
  return (
    <Modal visible={props.visible} statusBarTranslucent animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={st.root}>
        <ScrollView contentContainerStyle={st.scroll}>
          <DiscoverFeed visible={props.visible} watchingIds={props.watchingIds} onWatch={props.onWatch} onClose={props.onClose} />
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
  kicker: { color: C.green, fontFamily: PX, fontSize: 9, lineHeight: 14, marginBottom: 8 },
  cardText: { color: C.text, fontSize: T.body, lineHeight: 21 },
  q: { color: C.text, fontSize: T.body + 1, fontWeight: "700", lineHeight: 22 },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18, marginTop: 4 },
  body: { color: C.text, fontSize: T.body, lineHeight: 21 },
  stat: { fontFamily: PX, fontSize: 24, marginVertical: 10 },
});
