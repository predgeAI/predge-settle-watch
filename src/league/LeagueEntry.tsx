import React, { useCallback, useEffect, useState } from "react";
import { Linking, Modal, SafeAreaView, ScrollView, View } from "react-native";
import { Text } from "../Text";
import { t } from "../i18n";
import { C, PX, T } from "../theme";
import { Button, PixelBox, Press, Scanlines } from "../ui";
import { PixelIcon } from "../sprites";
import { api, loadSession, LeagueError, type Me } from "./api";
import { signInWithWallet } from "./auth";
import { ClanScreen } from "./ClanScreen";
import { InviteScreen } from "./InviteScreen";
import { LeagueScreen } from "./LeagueScreen";
import { inviteCodeFromUrl, passedLine } from "./logic";
import { Avatar } from "./pixels";
import { Disclaimer, Tabs, st } from "./parts";
import { ProfileScreen } from "./ProfileScreen";
import { onLeagueResult, peekPendingInvite, setPendingInvite, startReporting, takePendingInvite } from "./reporter";

/** Home card. Mounting it also starts XP reporting and listens for invite links. */
export function LeagueCard({ onOpen }: { onOpen: () => void }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    startReporting();
    const off = onLeagueResult((r) => {
      const p = passedLine(r.passed);
      if (p) {
        setLine(p);
        setTimeout(() => setLine(null), 9000);
      }
    });
    const handle = async (url: string | null) => {
      const code = inviteCodeFromUrl(url);
      if (code) {
        await setPendingInvite(code);
        onOpen();
      }
    };
    Linking.getInitialURL().then(handle).catch(() => undefined);
    const sub = Linking.addEventListener("url", (e) => void handle(e.url));
    return () => {
      off();
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Press onPress={onOpen} label={t("lg.open")}>
      <PixelBox border={C.green} bg={C.surface} style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PixelIcon name="league" px={5} color={C.green} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.green, fontFamily: PX, fontSize: 9, lineHeight: 14, marginBottom: 8 }}>{t("lg.kicker")}</Text>
          <Text style={{ color: C.text, fontSize: T.body, lineHeight: 21 }}>
            {line ?? t("lg.card")}
          </Text>
        </View>
      </PixelBox>
    </Press>
  );
}

type Stage = "boot" | "signin" | "setup" | "main";
type View_ = "league" | "clan" | "invite" | "me";

export function LeagueModal(props: { visible: boolean; onClose: () => void; overlay?: React.ReactNode }) {
  const [stage, setStage] = useState<Stage>("boot");
  const [view, setView] = useState<View_>("league");
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    if (!(await loadSession())) return setStage("signin");
    try {
      const m = await api.me();
      setMe(m);
      if (m.needsNickname) return setStage("setup");
      const pending = await peekPendingInvite();
      if (pending) {
        try {
          const r = await api.acceptInvite(pending);
          setNote(r.already ? t("lg.alreadyFriends", { name: r.friend.nickname }) : t("lg.friendsNow", { name: r.friend.nickname }));
        } catch (e) {
          setNote(e instanceof LeagueError ? e.message : null);
        }
        await takePendingInvite();
        setMe(await api.me());
      }
      setStage("main");
    } catch (e) {
      if (e instanceof LeagueError && e.status === 401) return setStage("signin");
      setErr(e instanceof LeagueError ? e.message : t("common.wrong"));
      setStage("boot");
    }
  }, []);

  useEffect(() => {
    if (props.visible) void load();
  }, [props.visible, load]);

  const signIn = async () => {
    setBusy(true);
    setErr(null);
    try {
      await signInWithWallet();
      await load();
    } catch (e) {
      setErr(e instanceof LeagueError ? e.message : t("lg.signInFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={props.visible} statusBarTranslucent animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 56 }}>
          <View style={{ marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16, backgroundColor: "#0f1d13", borderBottomWidth: 4, borderBottomColor: C.green }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Button small kind="ghost" title={t("common.back")} onPress={props.onClose} />
              {me && stage === "main" ? <Avatar id={me.avatar} px={3} /> : null}
            </View>
            <Text style={{ color: C.greenBright, fontFamily: PX, fontSize: 18, marginTop: 16 }}>{t("lg.title")}</Text>
            {me && stage === "main" ? (
              <Text style={{ color: C.dim, fontSize: T.small, marginTop: 8 }}>
                {t("lg.meLine", { nick: me.nickname ?? "", xp: me.weeklyXp })}
                {me.rank ? t("lg.rankSuffix", { n: me.rank }) : ""}
              </Text>
            ) : null}
          </View>

          {note ? <Text style={st.notice}>{note}</Text> : null}

          {stage === "boot" ? (
            err ? (
              <View style={{ marginTop: 18 }}>
                <Text style={st.err}>{err}</Text>
                <Button small kind="ghost" title={t("common.tryAgain")} onPress={load} style={{ marginTop: 10 }} />
              </View>
            ) : (
              <Text style={[st.dim, { marginTop: 24 }]}>{t("common.loading")}</Text>
            )
          ) : null}

          {stage === "signin" ? (
            <View>
              <Text style={[st.body, { marginTop: 16 }]}>
                {t("lg.signInBody")}
              </Text>
              <Button title={busy ? t("common.waitingWallet") : t("lg.signIn")} onPress={signIn} disabled={busy} style={{ marginTop: 16 }} />
              {err ? <Text style={[st.err, { marginTop: 10 }]}>{err}</Text> : null}
              <Disclaimer />
            </View>
          ) : null}

          {stage === "setup" && me ? <ProfileScreen setup me={me} onSaved={load} onSignedOut={() => setStage("signin")} /> : null}

          {stage === "main" && me ? (
            <View>
              <Tabs
                tabs={[{ id: "league", label: t("lg.tab.league") }, { id: "clan", label: t("lg.tab.clan") }, { id: "invite", label: t("lg.tab.invite") }, { id: "me", label: t("lg.tab.me") }]}
                value={view}
                onChange={setView}
              />
              {view === "league" ? <LeagueScreen onInvite={() => setView("invite")} /> : null}
              {view === "clan" ? <ClanScreen onChanged={() => void api.me().then(setMe).catch(() => undefined)} /> : null}
              {view === "invite" ? <InviteScreen me={me} onChanged={() => void api.me().then(setMe).catch(() => undefined)} /> : null}
              {view === "me" ? <ProfileScreen me={me} onSaved={() => void api.me().then(setMe).catch(() => undefined)} onSignedOut={() => { setMe(null); setStage("signin"); }} /> : null}
            </View>
          ) : null}
        </ScrollView>
        {props.overlay}
        <Scanlines />
      </SafeAreaView>
    </Modal>
  );
}
