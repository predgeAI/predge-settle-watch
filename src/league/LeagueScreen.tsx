import React, { useState } from "react";
import { Text, View } from "react-native";
import { C, PX, T } from "../theme";
import { Button, PixelBox, Reveal } from "../ui";
import { api } from "./api";
import { shortCountdown } from "./logic";
import { Avatar } from "./pixels";
import { BoardRowView, Disclaimer, Loading, SectionTitle, Tabs, st, useAsync } from "./parts";

export function LeagueScreen({ onInvite }: { onInvite: () => void }) {
  const [tab, setTab] = useState<"friends" | "global">("friends");
  const board = useAsync(() => (tab === "friends" ? api.friendsBoard() : api.globalBoard()), [tab]);
  const recap = useAsync(() => api.recap(), []);
  const b = board.data;
  const r = recap.data;
  return (
    <View>
      {r && (r.weeklyXp > 0 || r.friendsCount > 0) ? (
        <Reveal>
          <PixelBox border={C.purple} bg="#1b1233" style={{ marginTop: 14 }} inner={{ padding: 14 }}>
            <Text style={[st.label, { color: C.purpleSoft }]}>LAST WEEK</Text>
            <Text style={st.body}>
              You scored {r.weeklyXp} XP.
              {r.friendsRank ? ` You finished #${r.friendsRank} of ${r.friendsCount + 1} among friends.` : ""}
              {r.globalRank ? ` Global rank #${r.globalRank}.` : ""}
            </Text>
            {r.topFriend ? <Text style={[st.dim, { marginTop: 6 }]}>Top friend: {r.topFriend.nickname} with {r.topFriend.weeklyXp} XP.</Text> : null}
            {r.clan ? <Text style={[st.dim, { marginTop: 4 }]}>Your clan [{r.clan.tag}] ranked #{r.clan.rank} with {r.clan.score}.</Text> : null}
            {r.medal ? <Text style={[st.body, { marginTop: 6, color: C.greenBright }]}>You earned the {r.medal} medal among friends.</Text> : null}
          </PixelBox>
        </Reveal>
      ) : null}

      <Tabs tabs={[{ id: "friends", label: "FRIENDS" }, { id: "global", label: "TOP 50" }]} value={tab} onChange={setTab} />

      {b ? (
        <View>
          <Text style={[st.dim, { marginTop: 12 }]}>Resets in {shortCountdown(Date.parse(b.resetsAt) - Date.now())}. Weekly XP resets Monday 00:00 UTC.</Text>
          {b.you ? (
            <PixelBox border={C.green} bg={C.surface} style={{ marginTop: 10 }} inner={{ padding: 12 }}>
              <Text style={st.body}>
                This week: {b.you.weeklyXp} XP{b.you.rank ? `, rank #${b.you.rank}` : ""}.
              </Text>
            </PixelBox>
          ) : null}
          <SectionTitle>{tab === "friends" ? "YOU AND YOUR FRIENDS" : "GLOBAL TOP 50"}</SectionTitle>
          {b.rows.map((row) => (
            <BoardRowView key={`${row.nickname}`} row={row} />
          ))}
          {tab === "friends" && b.rows.length <= 1 ? (
            <View style={{ marginTop: 14 }}>
              <Text style={st.body}>No friends here yet. Invite someone to compare your weekly XP.</Text>
              <Button title="Invite a friend" onPress={onInvite} style={{ marginTop: 10 }} />
            </View>
          ) : null}
          {tab === "global" && b.rows.length === 0 ? <Text style={[st.body, { marginTop: 14 }]}>Nobody has scored this week. Be the first.</Text> : null}
        </View>
      ) : (
        <Loading error={board.error} onRetry={board.reload} />
      )}
      <Disclaimer />
    </View>
  );
}
