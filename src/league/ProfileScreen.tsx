import React, { useState } from "react";
import { View } from "react-native";
import { showDialog } from "../dialog";
import { Text } from "../Text";
import { t } from "../i18n";
import { C } from "../theme";
import { Button, PixelBox, Press } from "../ui";
import { api, LeagueError, type Me } from "./api";
import { signOut } from "./auth";
import { AVATAR_IDS } from "./logic";
import { Avatar } from "./pixels";
import { Disclaimer, Field, SectionTitle, st } from "./parts";

/** Used for first-time setup and later edits. */
export function ProfileScreen({ me, onSaved, onSignedOut, setup }: { me: Me; onSaved: () => void; onSignedOut: () => void; setup?: boolean }) {
  const [nick, setNick] = useState(me.nickname ?? "");
  const [avatar, setAvatar] = useState(me.avatar);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      await api.setProfile({ nickname: nick.trim(), avatar });
      if (setup) await api.onboarded().catch(() => undefined);
      setSaved(true);
      onSaved();
    } catch (e) {
      setErr(e instanceof LeagueError ? e.message : t("common.wrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {setup ? <Text style={[st.body, { marginTop: 14 }]}>{t("lg.setupIntro")}</Text> : null}
      <PixelBox border={C.green} bg={C.surface} style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar id={avatar} px={6} />
        <View style={{ flex: 1 }}>
          <Text style={st.h}>{me.nickname ?? t("lg.newPlayer")}</Text>
          <Text style={st.dim}>{t("lg.walletLine", { addr: me.address })}</Text>
        </View>
      </PixelBox>
      <Field label={t("lg.nickname")} value={nick} onChange={setNick} placeholder={t("lg.nickPh")} max={16} />
      <Text style={[st.label, { marginTop: 16 }]}>{t("lg.avatar")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {AVATAR_IDS.map((id) => (
          <Press key={id} onPress={() => setAvatar(id)} label={t("lg.avatarLabel", { id })}>
            <PixelBox p={2} border={avatar === id ? C.green : C.line} bg={C.surface} inner={{ padding: 4 }}>
              <Avatar id={id} px={4} />
            </PixelBox>
          </Press>
        ))}
      </View>
      <Button title={setup ? t("lg.join") : t("common.save")} onPress={save} disabled={busy || nick.trim().length < 3} style={{ marginTop: 16 }} />
      {saved && !setup ? <Text style={st.notice}>{t("common.saved")}</Text> : null}
      {err ? <Text style={[st.err, { marginTop: 8 }]}>{err}</Text> : null}

      {!setup ? (
        <View>
          <SectionTitle>{t("lg.account")}</SectionTitle>
          <Button kind="ghost" title={t("lg.signOut")} onPress={async () => { await signOut(); onSignedOut(); }} style={{ marginTop: 8 }} />
          <Button
            kind="ghost"
            title={t("lg.deleteBtn")}
            style={{ marginTop: 10 }}
            onPress={() =>
              showDialog(t("lg.deleteTitle"), t("lg.deleteBody"), [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("common.delete"), style: "destructive", onPress: async () => { try { await api.deleteMe(); } catch { /* already gone */ } await signOut(); onSignedOut(); } },
              ])
            }
          />
        </View>
      ) : null}
      <Disclaimer />
    </View>
  );
}
