import React, { useState } from "react";
import { View } from "react-native";
import { Text } from "../Text";
import { t, type Key } from "../i18n";
import { C, PX, T } from "../theme";
import { Button, PixelBox, Reveal } from "../ui";
import { api } from "./api";
import { boardRank, rankRows, shortCountdown } from "./logic";
import { Avatar } from "./pixels";
import { BoardRowView, Disclaimer, Loading, SectionTitle, Tabs, st, useAsync } from "./parts";

export function LeagueScreen({ onInvite }: { onInvite: () => void }) {
  const [tab, setTab] = useState<"friends" | "global">("friends");
  const board = useAsync(() => (tab === "friends" ? api.friendsBoard() : api.globalBoard()), [tab]);
  const recap = useAsync(() => api.recap(), []);
  const b = board.data;
  const r = recap.data;
  const rows = b ? rankRows(b.rows) : [];
  const myRank = b ? boardRank(b.rows, b.you?.rank) : null;
  return (
    <View>
      {r && (r.weeklyXp > 0 || r.friendsCount > 0) ? (
        <Reveal>
          <PixelBox border={C.purple} bg="#1b1233" style={{ marginTop: 14 }} inner={{ padding: 14 }}>
            <Text style={[st.label, { color: C.purpleSoft }]}>{t("lg.lastWeek")}</Text>
            <Text style={st.body}>
              {t("lg.scored", { xp: r.weeklyXp })}
              {r.friendsRank ? t("lg.finished", { rank: r.friendsRank, n: r.friendsCount + 1 }) : ""}
              {r.globalRank ? t("lg.globalRank", { n: r.globalRank }) : ""}
            </Text>
            {r.topFriend ? <Text style={[st.dim, { marginTop: 6 }]}>{t("lg.topFriend", { name: r.topFriend.nickname, xp: r.topFriend.weeklyXp })}</Text> : null}
            {r.clan ? <Text style={[st.dim, { marginTop: 4 }]}>{t("lg.clanRanked", { tag: r.clan.tag, rank: r.clan.rank, score: r.clan.score })}</Text> : null}
            {r.medal ? <Text style={[st.body, { marginTop: 6, color: C.greenBright }]}>{t("lg.medal", { medal: t(`medal.${r.medal}` as Key) })}</Text> : null}
          </PixelBox>
        </Reveal>
      ) : null}

      <Tabs tabs={[{ id: "friends", label: t("lg.tab.friends") }, { id: "global", label: t("lg.tab.top") }]} value={tab} onChange={setTab} />

      {b ? (
        <View>
          <Text style={[st.dim, { marginTop: 12 }]}>{t("lg.resets", { t: shortCountdown(Date.parse(b.resetsAt) - Date.now()) })}</Text>
          {b.you ? (
            <PixelBox border={C.green} bg={C.surface} style={{ marginTop: 10 }} inner={{ padding: 12 }}>
              <Text style={st.body}>{t("lg.thisWeek", { xp: b.you.weeklyXp, rank: myRank ? t("lg.rankSuffix", { n: myRank }) : "" })}</Text>
            </PixelBox>
          ) : null}
          <SectionTitle>{tab === "friends" ? t("lg.youAndFriends") : t("lg.globalTop")}</SectionTitle>
          {rows.map((row) => (
            <BoardRowView key={`${row.nickname}`} row={row} />
          ))}
          {tab === "friends" && b.rows.length <= 1 ? (
            <View style={{ marginTop: 14 }}>
              <Text style={st.body}>{t("lg.noFriends")}</Text>
              <Button title={t("lg.inviteFriend")} onPress={onInvite} style={{ marginTop: 10 }} />
            </View>
          ) : null}
          {tab === "global" && b.rows.length === 0 ? <Text style={[st.body, { marginTop: 14 }]}>{t("lg.nobody")}</Text> : null}
        </View>
      ) : (
        <Loading error={board.error} onRetry={board.reload} />
      )}
      <Disclaimer />
    </View>
  );
}
