import React, { useState } from "react";
import { Alert, Share, Text, View } from "react-native";
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
      setErr(e instanceof LeagueError ? e.message : "Something went wrong.");
    }
  };
  const c = clan.data?.clan ?? null;

  return (
    <View>
      <Tabs tabs={[{ id: "mine", label: "MY CLAN" }, { id: "board", label: "CLAN BOARD" }]} value={tab} onChange={setTab} />

      {tab === "board" ? (
        board.data ? (
          <View>
            <Text style={[st.dim, { marginTop: 12 }]}>Clan score is the sum of weekly XP. Each member counts up to {board.data.memberXpCap} XP.</Text>
            {board.data.rows.map((r) => (
              <PixelBox key={r.tag + r.name} p={2} border={r.you ? C.green : C.line} bg={C.surface} style={{ marginTop: 8 }} inner={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={[st.xp, { width: 28, color: C.dim }]}>#{r.rank}</Text>
                <Emblem id={r.emblem} px={3} />
                <View style={{ flex: 1 }}>
                  <Text style={st.name} numberOfLines={1}>[{r.tag}] {r.name}</Text>
                  <Text style={st.dim}>{r.members} members</Text>
                </View>
                <Text style={st.xp}>{r.weeklyXp}</Text>
              </PixelBox>
            ))}
            {board.data.rows.length === 0 ? <Text style={[st.body, { marginTop: 14 }]}>No clans yet. Start the first one.</Text> : null}
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
              <Text style={st.dim}>Rank #{c.rank} this week, {c.score} points</Text>
            </View>
          </PixelBox>
          <Text style={[st.dim, { marginTop: 8 }]}>{c.members.length} of {c.memberCap} members. Each member counts up to {c.memberXpCap} XP a week.</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}><Button small title={`Share code ${c.code}`} onPress={() => void Share.share({ message: clanShareText(c.name, c.code) }).catch(() => undefined)} /></View>
          </View>
          <SectionTitle>MEMBERS</SectionTitle>
          {c.members.map((m) => (
            <PixelBox key={m.nickname} p={2} border={m.you ? C.green : C.line} bg={C.surface} style={{ marginTop: 8 }} inner={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Avatar id={m.avatar} px={3} />
              <View style={{ flex: 1 }}>
                <Text style={st.name} numberOfLines={1}>{m.nickname}{m.founder ? " (founder)" : ""}</Text>
                <Text style={st.dim}>{m.weeklyXp} XP{m.weeklyXp > m.counted ? `, ${m.counted} counted` : ""}</Text>
              </View>
              {c.youAreFounder && !m.you ? (
                <Button small kind="ghost" title="Remove" onPress={() => Alert.alert("Remove member", `Remove ${m.nickname} from the clan?`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => void act(() => api.kick(m.nickname)) }])} />
              ) : null}
            </PixelBox>
          ))}
          <Button kind="ghost" title="Leave clan" style={{ marginTop: 16 }} onPress={() => Alert.alert("Leave clan", "Leave this clan?", [{ text: "Cancel", style: "cancel" }, { text: "Leave", style: "destructive", onPress: () => void act(() => api.leaveClan()) }])} />
        </View>
      ) : clan.loading ? (
        <Loading error={clan.error} onRetry={clan.reload} />
      ) : (
        <View>
          <Tabs tabs={[{ id: "join", label: "JOIN BY CODE" }, { id: "create", label: "CREATE" }]} value={mode} onChange={setMode} />
          {mode === "join" ? (
            <View>
              <Field label="CLAN CODE" value={code} onChange={setCode} placeholder="6 characters" max={6} caps />
              <Button title="Join clan" disabled={code.trim().length !== 6} onPress={() => void act(() => api.joinClan(code.trim()))} style={{ marginTop: 12 }} />
            </View>
          ) : (
            <View>
              <Field label="CLAN NAME" value={name} onChange={setName} placeholder="3 to 20 characters" max={20} />
              <Field label="TAG" value={tag} onChange={(v) => setTag(v.toUpperCase())} placeholder="2 to 4 letters" max={4} caps />
              <Text style={[st.label, { marginTop: 14 }]}>EMBLEM</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {EMBLEM_IDS.map((id) => (
                  <Press key={id} onPress={() => setEmblem(id)} label={`Emblem ${id}`}>
                    <PixelBox p={2} border={emblem === id ? C.green : C.line} bg={C.surface} inner={{ padding: 6 }}>
                      <Emblem id={id} px={4} />
                    </PixelBox>
                  </Press>
                ))}
              </View>
              <Button title="Create clan" disabled={name.trim().length < 3 || tag.length < 2} onPress={() => void act(() => api.createClan({ name: name.trim(), tag, emblem }))} style={{ marginTop: 14 }} />
            </View>
          )}
        </View>
      )}
      {err ? <Text style={[st.err, { marginTop: 10 }]}>{err}</Text> : null}
      <Disclaimer />
    </View>
  );
}
