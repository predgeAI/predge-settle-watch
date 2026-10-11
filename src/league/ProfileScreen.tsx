import React, { useState } from "react";
import { Alert, Text, View } from "react-native";
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
      setErr(e instanceof LeagueError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {setup ? <Text style={[st.body, { marginTop: 14 }]}>Pick a nickname and an avatar. Other players see only these. Your wallet address stays private.</Text> : null}
      <PixelBox border={C.green} bg={C.surface} style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar id={avatar} px={6} />
        <View style={{ flex: 1 }}>
          <Text style={st.h}>{me.nickname ?? "New player"}</Text>
          <Text style={st.dim}>Wallet {me.address} (only you see this)</Text>
        </View>
      </PixelBox>
      <Field label="NICKNAME" value={nick} onChange={setNick} placeholder="3 to 16 letters, numbers, _" max={16} />
      <Text style={[st.label, { marginTop: 16 }]}>AVATAR</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {AVATAR_IDS.map((id) => (
          <Press key={id} onPress={() => setAvatar(id)} label={`Avatar ${id}`}>
            <PixelBox p={2} border={avatar === id ? C.green : C.line} bg={C.surface} inner={{ padding: 4 }}>
              <Avatar id={id} px={4} />
            </PixelBox>
          </Press>
        ))}
      </View>
      <Button title={setup ? "Join the League" : "Save"} onPress={save} disabled={busy || nick.trim().length < 3} style={{ marginTop: 16 }} />
      {saved && !setup ? <Text style={st.notice}>Saved.</Text> : null}
      {err ? <Text style={[st.err, { marginTop: 8 }]}>{err}</Text> : null}

      {!setup ? (
        <View>
          <SectionTitle>ACCOUNT</SectionTitle>
          <Button kind="ghost" title="Sign out of the League" onPress={async () => { await signOut(); onSignedOut(); }} style={{ marginTop: 8 }} />
          <Button
            kind="ghost"
            title="Delete my League account"
            style={{ marginTop: 10 }}
            onPress={() =>
              Alert.alert("Delete League account", "This removes your nickname, friends and clan membership from the League. Your game progress on this phone stays.", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: async () => { try { await api.deleteMe(); } catch { /* already gone */ } await signOut(); onSignedOut(); } },
              ])
            }
          />
        </View>
      ) : null}
      <Disclaimer />
    </View>
  );
}
