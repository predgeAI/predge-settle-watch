import React, { useState } from "react";
import { Share, View } from "react-native";
import { Text } from "../Text";
import { t } from "../i18n";
import * as Clipboard from "expo-clipboard";
import { C } from "../theme";
import { Button, PixelBox } from "../ui";
import { api, LeagueError, type Me } from "./api";
import { inviteShareText } from "./logic";
import { Avatar } from "./pixels";
import { Disclaimer, Field, Loading, SectionTitle, st, useAsync } from "./parts";

export function InviteScreen({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const friends = useAsync(() => api.friends(), [me.friends]);

  const share = async () => {
    try {
      await Share.share({ message: inviteShareText(me.inviteLink, me.inviteCode) });
    } catch {
      /* closed */
    }
  };
  const copy = async () => {
    await Clipboard.setStringAsync(me.inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const accept = async () => {
    setErr(null);
    setMsg(null);
    try {
      const r = await api.acceptInvite(code.trim());
      setMsg(r.already ? t("lg.alreadyFriends", { name: r.friend.nickname }) : t("lg.friendsNow", { name: r.friend.nickname }));
      setCode("");
      onChanged();
      friends.reload();
    } catch (e) {
      setErr(e instanceof LeagueError ? e.message : t("common.wrong"));
    }
  };

  return (
    <View>
      <PixelBox border={C.green} bg={C.surface} style={{ marginTop: 14 }} inner={{ padding: 14 }}>
        <Text style={st.label}>{t("lg.yourCode")}</Text>
        <Text style={st.h}>{me.inviteCode}</Text>
        <Text style={[st.dim, { marginTop: 8 }]}>{t("lg.codeNote")}</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}><Button title={t("common.share")} onPress={share} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title={copied ? t("common.copied") : t("lg.copyLink")} onPress={copy} /></View>
        </View>
      </PixelBox>

      <SectionTitle>{t("lg.haveCode")}</SectionTitle>
      <Field label={t("lg.friendCode")} value={code} onChange={setCode} placeholder={t("lg.ph8")} max={8} caps />
      <Button title={t("lg.addFriend")} onPress={accept} disabled={code.trim().length !== 8} style={{ marginTop: 12 }} />
      {msg ? <Text style={st.notice}>{msg}</Text> : null}
      {err ? <Text style={[st.err, { marginTop: 8 }]}>{err}</Text> : null}

      <SectionTitle>{t("lg.yourFriends")}</SectionTitle>
      {friends.data ? (
        friends.data.friends.length ? (
          friends.data.friends.map((f) => (
            <PixelBox key={f.nickname} p={2} border={C.line} bg={C.surface} style={{ marginTop: 8 }} inner={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Avatar id={f.avatar} px={3} />
              <Text style={st.name}>{f.nickname}</Text>
              <Text style={st.xp}>{f.weeklyXp} XP</Text>
            </PixelBox>
          ))
        ) : (
          <Text style={st.dim}>{t("lg.noFriendsYet")}</Text>
        )
      ) : (
        <Loading error={friends.error} onRetry={friends.reload} />
      )}
      <Disclaimer />
    </View>
  );
}
