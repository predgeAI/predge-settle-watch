// ME: wallet, settings, how it works and the data line.
import React from "react";
import { ActivityIndicator, Pressable, Switch, View, type ScrollViewProps } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { SettlementRisk } from "../api";
import { CLUSTERS, PINNED_KID, type Cluster } from "../config";
import type { Settings, StoredWallet } from "../store";
import { C } from "../theme";
import { Button, PixelBox, Press } from "../ui";
import { SkrBalance } from "../skr";
import { Text } from "../Text";
import { fmtDec, fmtNum, LANGS, t, type Lang } from "../i18n";
import { hh, short, styles, TabHeader, TabScroll } from "./shared";

export interface MeTabProps {
  active: boolean;
  refreshControl: ScrollViewProps["refreshControl"];
  settings: Settings;
  lang: Lang;
  wallet: StoredWallet | null;
  balance: number | null;
  busy: string | null;
  cluster: Cluster;
  net: string;
  context: SettlementRisk["context"] | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onAirdrop: () => void;
  onSwitchCluster: (c: Cluster) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  onCheckNow: () => void;
  onDigestNow: () => void;
  onTestAlert: () => void;
}

export function MeTab(p: MeTabProps) {
  const { settings, wallet, balance, busy, cluster, net, lang, context, updateSettings } = p;
  return (
    <TabScroll active={p.active} refreshControl={p.refreshControl}>
      <TabHeader title={t("tab.me")} sub={t("me.sub")} />

      {/* Wallet: one compact row */}
      <PixelBox style={styles.cardGap} inner={[styles.cardPad, wallet ? { gap: 10 } : styles.rowBetween]}>
        <View style={wallet ? undefined : { flex: 1 }}>
          <Text style={styles.cardLabel}>{t("wallet.label", { net })}</Text>
          {wallet ? (
            <Pressable onPress={() => Clipboard.setStringAsync(wallet.address)} accessibilityLabel={t("wallet.copy")}>
              <Text style={styles.mono}>
                {short(wallet.address, 6)}
                <Text style={styles.dim}>  {balance === null ? "" : `${balance.toFixed(4)} SOL`}</Text>
                <SkrBalance address={wallet.address} style={styles.dim} />
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.dim}>{t("wallet.hint")}</Text>
          )}
        </View>
        {busy === "wallet" || busy === "airdrop" ? (
          <ActivityIndicator color={C.green} />
        ) : wallet ? (
          <View style={styles.row}>
            {cluster === "devnet" ? <Button small kind="ghost" title={t("wallet.devnetSol")} onPress={p.onAirdrop} disabled={!!busy} /> : null}
            <Button small kind="ghost" title={t("wallet.disconnect")} onPress={p.onDisconnect} />
          </View>
        ) : (
          <View style={{ flexShrink: 1 }}>
            <Button small title={t("wallet.connect")} onPress={p.onConnect} disabled={!!busy} />
          </View>
        )}
      </PixelBox>

      {/* Settings */}
      <PixelBox style={styles.cardGap} inner={styles.cardPad}>
        <Text style={styles.cardTitle}>{t("settings.title")}</Text>
        <Text style={styles.body}>{t("settings.language")}</Text>
        <View style={[styles.rowWrap, { marginTop: 4, marginBottom: 12 }]}>
          {LANGS.map((l) => (
            <Press key={l.id} onPress={() => updateSettings({ language: l.id })} label={l.name}>
              <PixelBox p={2} border={lang === l.id ? "#2f6b38" : C.line} bg={lang === l.id ? C.green : C.surfaceHi} inner={{ paddingHorizontal: 10, paddingVertical: 7 }}>
                <Text style={[styles.langText, { color: lang === l.id ? "#07120a" : C.text }]}>{l.name}</Text>
              </PixelBox>
            </Press>
          ))}
        </View>
        <View style={styles.rowBetween}>
          <Text style={[styles.body, { flex: 1 }]}>{t("settings.digest")}</Text>
          <Switch value={settings.digest} onValueChange={(v) => updateSettings({ digest: v })} trackColor={{ true: C.greenDeep, false: C.line }} thumbColor={settings.digest ? C.green : C.dim} />
        </View>
        {settings.digest ? (
          <View style={styles.rowBetween}>
            <Text style={[styles.dim, { flex: 1 }]}>{t("settings.digestHint", { time: hh(settings.digestHour) })}</Text>
            <View style={styles.row}>
              <Button small kind="ghost" title="-" onPress={() => updateSettings({ digestHour: (settings.digestHour + 23) % 24 })} />
              <Button small kind="ghost" title="+" onPress={() => updateSettings({ digestHour: (settings.digestHour + 1) % 24 })} />
            </View>
          </View>
        ) : null}
        <View style={[styles.rowBetween, { marginTop: 12 }]}>
          <Text style={[styles.body, { flexShrink: 1 }]}>{t("settings.network")}</Text>
          <View style={styles.row}>
            {(["devnet", "mainnet-beta"] as Cluster[]).map((c) => (
              <Press key={c} onPress={() => p.onSwitchCluster(c)} label={CLUSTERS[c].label}>
                <PixelBox p={2} border={cluster === c ? "#2f6b38" : C.line} bg={cluster === c ? C.green : C.surfaceHi} inner={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                  <Text style={[styles.chipText, { color: cluster === c ? "#07120a" : C.text }]}>{CLUSTERS[c].label.toUpperCase()}</Text>
                </PixelBox>
              </Press>
            ))}
          </View>
        </View>
        <View style={[styles.rowWrap, { marginTop: 12 }]}>
          <Button small kind="ghost" title={t("settings.checkNow")} onPress={p.onCheckNow} />
          <Button small kind="ghost" title={t("settings.digestNow")} onPress={p.onDigestNow} />
          <Button small kind="ghost" title={t("settings.testAlert")} onPress={p.onTestAlert} />
          <Button small kind="ghost" title={t("settings.showIntro")} onPress={() => updateSettings({ onboarded: false })} />
        </View>
        <View style={styles.howRule} />
        <Text style={styles.cardTitle}>{t("how.title")}</Text>
        <Text style={styles.body}>{t("how.p1")}</Text>
        <Text style={styles.body}>{t("how.p2")}</Text>
        {context ? (
          <>
            <Text style={[styles.body, { marginTop: 6 }]}>
              {t("how.context", {
                period: String(context.period),
                disputes: fmtNum(context.disputes),
                markets: fmtNum(context.disputed_markets),
                settled: fmtNum(context.settled_disputed_markets),
                diff: fmtNum(context.settled_differently_from_disputed_proposal),
                share: fmtDec(String(context.settled_differently_share)),
              })}
            </Text>
            <Text style={[styles.dim, { marginTop: 6 }]}>{t("how.source", { source: String(context.source) })}</Text>
          </>
        ) : null}
      </PixelBox>

      <Text style={[styles.dim, { marginTop: 16, textAlign: "center" }]}>{t("footer", { kid: PINNED_KID })}</Text>
    </TabScroll>
  );
}
