import React, { useState } from "react";
import { Alert, Share, View } from "react-native";
import { Text } from "../Text";
import { t } from "../i18n";
import { C } from "../theme";
import { Button, PixelBox, Press } from "../ui";
import { api, LeagueError } from "./api";
import { clanShareText, EMBLEM_IDS } from "./logic";
import { Avatar, Emblem } from "./pixels";
import { Disclaimer, Field, Loading, SectionTitle, Tabs, st, useAsync } from "./parts";

export function ClanScreen({ onChanged }: { onChanged: () => void }) {
  const clan = useAsync(() => api.clan(), []);
  const [tab, setTab] = useState<"mine" | "board">("mine");
  const [mode, setMode] = useState<"join" | "create">("join");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [emblem, setEmblem] = useState(EMBLEM_IDS[0]);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const board = useAsync(() => api.clanBoard(), [tab]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      clan.reload();
      board.reload();
      onChanged();
    } catch (e) {
      setErr(e instanceof LeagueError ? e.message : t("common.wrong"));
    }
  };
  const c = clan.data?.clan ?? null;

  return (
    <View>
      <Tabs tabs={[{ id: "mine", label: t("lg.tab.mine") }, { id: "board", label: t("lg.tab.board") }]} value={tab} onChange={setTab} />

      {tab === "board" ? (
        board.data ? (
          <View>
            <Text style={[st.dim, { marginTop: 12 }]}>{t("lg.clanScore", { cap: board.data.memberXpCap })}</Text>
            {board.data.rows.map((r) => (
              <PixelBox key={r.tag + r.name} p={2} border={r.you ? C.green : C.line} bg={C.surface} style={{ marginTop: 8 }} inner={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={[st.xp, { width: 28, color: C.dim }]}>#{r.rank}</Text>
                <Emblem id={r.emblem} px={3} />
                <View style={{ flex: 1 }}>
                  <Text style={st.name} numberOfLines={1}>[{r.tag}] {r.name}</Text>
                  <Text style={st.dim}>{t("lg.members", { n: r.members })}</Text>
                </View>
                <Text style={st.xp}>{r.weeklyXp}</Text>
              </PixelBox>
            ))}
            {board.data.rows.length === 0 ? <Text style={[st.body, { marginTop: 14 }]}>{t("lg.noClans")}</Text> : null}
          </View>
        ) : (
          <Loading error={board.error} onRetry={board.reload} />
        )
      ) : c ? (
        <View>
          <PixelBox border={C.purple} bg="#1b1233" style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Emblem id={c.emblem} px={6} />
            <View style={{ flex: 1 }}>
              <Text style={st.h}>[{c.tag}]</Text>
              <Text style={st.body}>{c.name}</Text>
              <Text style={st.dim}>{t("lg.clanRank", { rank: c.rank, score: c.score })}</Text>
            </View>
          </PixelBox>
          <Text style={[st.dim, { marginTop: 8 }]}>{t("lg.memberCount", { n: c.members.length, cap: c.memberCap, xp: c.memberXpCap })}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}><Button small title={t("lg.shareCode", { code: c.code })} onPress={() => void Share.share({ message: clanShareText(c.name, c.code) }).catch(() => undefined)} /></View>
          </View>
          <SectionTitle>{t("lg.membersTitle")}</SectionTitle>
          {c.members.map((m) => (
            <PixelBox key={m.nickname} p={2} border={m.you ? C.green : C.line} bg={C.surface} style={{ marginTop: 8 }} inner={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Avatar id={m.avatar} px={3} />
              <View style={{ flex: 1 }}>
                <Text style={st.name} numberOfLines={1}>{m.nickname}{m.founder ? t("lg.founder") : ""}</Text>
                <Text style={st.dim}>{m.weeklyXp} XP{m.weeklyXp > m.counted ? t("lg.counted", { n: m.counted }) : ""}</Text>
              </View>
              {c.youAreFounder && !m.you ? (
                <Button small kind="ghost" title={t("common.remove")} onPress={() => Alert.alert(t("lg.removeMember"), t("lg.removeBody", { name: m.nickname }), [{ text: t("common.cancel"), style: "cancel" }, { text: t("common.remove"), style: "destructive", onPress: () => void act(() => api.kick(m.nickname)) }])} />
              ) : null}
            </PixelBox>
          ))}
          <Button kind="ghost" title={t("lg.leaveClan")} style={{ marginTop: 16 }} onPress={() => Alert.alert(t("lg.leaveClan"), t("lg.leaveBody"), [{ text: t("common.cancel"), style: "cancel" }, { text: t("common.leave"), style: "destructive", onPress: () => void act(() => api.leaveClan()) }])} />
        </View>
      ) : clan.loading ? (
        <Loading error={clan.error} onRetry={clan.reload} />
      ) : (
        <View>
          <Tabs tabs={[{ id: "join", label: t("lg.tab.join") }, { id: "create", label: t("lg.tab.create") }]} value={mode} onChange={setMode} />
          {mode === "join" ? (
            <View>
              <Field label={t("lg.clanCode")} value={code} onChange={setCode} placeholder={t("lg.ph6")} max={6} caps />
              <Button title={t("lg.joinClan")} disabled={code.trim().length !== 6} onPress={() => void act(() => api.joinClan(code.trim()))} style={{ marginTop: 12 }} />
            </View>
          ) : (
            <View>
              <Field label={t("lg.clanName")} value={name} onChange={setName} placeholder={t("lg.ph20")} max={20} />
              <Field label={t("lg.tag")} value={tag} onChange={(v) => setTag(v.toUpperCase())} placeholder={t("lg.ph4")} max={4} caps />
              <Text style={[st.label, { marginTop: 14 }]}>{t("lg.emblem")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {EMBLEM_IDS.map((id) => (
                  <Press key={id} onPress={() => setEmblem(id)} label={t("lg.emblemLabel", { id })}>
                    <PixelBox p={2} border={emblem === id ? C.green : C.line} bg={C.surface} inner={{ padding: 6 }}>
                      <Emblem id={id} px={4} />
                    </PixelBox>
                  </Press>
                ))}
              </View>
              <Button title={t("lg.createClan")} disabled={name.trim().length < 3 || tag.length < 2} onPress={() => void act(() => api.createClan({ name: name.trim(), tag, emblem }))} style={{ marginTop: 14 }} />
            </View>
          )}
        </View>
      )}
      {err ? <Text style={[st.err, { marginTop: 10 }]}>{err}</Text> : null}
      <Disclaimer />
    </View>
  );
}
