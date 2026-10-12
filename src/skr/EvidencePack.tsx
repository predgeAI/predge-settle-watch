// Evidence pack for one market, unlocked with 1 SKR on Solana mainnet.
// The pack is built only from what the phone already holds: the verified signed record and the local timeline.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../Text";
import { PixelBox, Button } from "../ui";
import { C, MONO, PX, T } from "../theme";
import { EXPLORER_TX } from "../config";
import type { StoredWallet, WatchItem } from "../store";
import { friendlyWalletError } from "../wallet";
import { t, useLang } from "../i18n";
import * as haptic from "../haptic";
import { checkCanPay, payForPack, resumePendingUnlock, skrChanged, SKR_CLUSTER } from "./chain";
import { formatSkr, treasuryKey } from "./spl";
import { loadPendingUnlock, saveUnlock, savePendingUnlock, unlockFor, type PackUnlock, type PendingUnlock } from "./store";

// One payment at a time across the whole app.
let paying = false;

const short = (s: string, n = 6) => (s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-n)}` : s);

function openMainnetExplorer(sig: string) {
  try {
    Linking.openURL(EXPLORER_TX(sig, SKR_CLUSTER));
  } catch {
    // signature format is checked on save; nothing to open otherwise
  }
}

export function EvidencePackCard(props: { item: WatchItem; wallet: StoredWallet | null; disabled?: boolean; onUnlocked?: (ref: string) => void }) {
  useLang();
  const { item, wallet, onUnlocked } = props;
  const [unlock, setUnlock] = useState<PackUnlock | null>(null);
  const [busy, setBusy] = useState<null | "check" | "wallet" | "send">(null);
  const onUnlockedRef = useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;
  const treasury = treasuryKey();

  const record = useCallback(async (u: PackUnlock) => {
    await saveUnlock(u);
    onUnlockedRef.current?.(u.key);
    skrChanged();
  }, []);

  useEffect(() => {
    let live = true;
    unlockFor(item.key).then((u) => live && setUnlock(u)).catch(() => undefined);
    // Finish a payment interrupted after signing, for example if Android recreated the app behind the wallet.
    (async () => {
      const p = await loadPendingUnlock();
      if (!p || paying) return;
      const result = await resumePendingUnlock(p).catch(() => "unknown" as const);
      if (result === "unknown") return; // keep it and check again next time
      await savePendingUnlock(null);
      if (result === "confirmed") {
        const u: PackUnlock = { key: p.key, marketId: p.marketId, packHash: p.packHash, signature: p.signature, at: new Date().toISOString() };
        await record(u);
        if (live && p.key === item.key) setUnlock(u);
        Alert.alert(t("skr.okTitle"), t("skr.resumedOk"));
      } else {
        Alert.alert(t("skr.failedTitle"), t("skr.resumedDropped"));
      }
    })();
    return () => {
      live = false;
    };
  }, [item.key, record]);

  const doPay = useCallback(
    async (createTreasuryAta: boolean) => {
      const v = item.verification;
      const last = item.last;
      if (!wallet || !v?.verified || !v.packHash || !last || paying) return;
      paying = true;
      setBusy("wallet");
      let signed = false;
      const base = { key: item.key, marketId: last.market.market_id, packHash: v.packHash };
      try {
        const { signature } = await payForPack(wallet, { ...base, createTreasuryAta }, async (s: PendingUnlock) => {
          signed = true;
          setBusy("send");
          await savePendingUnlock(s);
        });
        const u: PackUnlock = { ...base, signature, at: new Date().toISOString() };
        await record(u);
        await savePendingUnlock(null);
        setUnlock(u);
        haptic.stamp();
        Alert.alert(t("skr.okTitle"), t("skr.okBody", { sig: short(signature) }), [
          { text: t("anchor.openExplorer"), onPress: () => openMainnetExplorer(signature) },
          { text: t("common.ok") },
        ]);
      } catch (e) {
        // Keep a signed payment that may still land, so it is checked again later. Drop one that cannot.
        if (!signed || /not landed|block height|rejected/i.test((e as Error)?.message ?? "")) await savePendingUnlock(null).catch(() => undefined);
        Alert.alert(t("skr.failedTitle"), friendlyWalletError(e));
      } finally {
        paying = false;
        setBusy(null);
      }
    },
    [item, wallet, record]
  );

  const onPress = useCallback(async () => {
    if (!treasury || paying) return;
    if (!wallet) return Alert.alert(t("skr.packTitle"), t("skr.connectFirst"));
    if (!item.verification?.verified || !item.verification.packHash || !item.last) return Alert.alert(t("skr.packTitle"), t("skr.verifyFirst"));
    setBusy("check");
    let check: Awaited<ReturnType<typeof checkCanPay>>;
    try {
      check = await checkCanPay(wallet.address);
    } catch {
      setBusy(null);
      return Alert.alert(t("skr.failedTitle"), t("skr.checkFail"));
    }
    setBusy(null);
    if (check.reason === "no_skr") return Alert.alert(t("skr.noSkrTitle"), t("skr.noSkrBody", { n: formatSkr(check.skr.ata) }));
    if (check.reason === "no_sol") return Alert.alert(t("skr.noSolTitle"), t("skr.noSolBody", { n: (check.needLamports / 1e9).toFixed(4) }));
    Alert.alert(t("skr.confirmTitle"), t("skr.confirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("skr.confirmBtn"), onPress: () => doPay(check.createTreasuryAta) },
    ]);
  }, [treasury, wallet, item, doPay]);

  if (unlock) return <UnlockedPack item={item} unlock={unlock} />;

  const title = !treasury
    ? t("skr.soon")
    : busy === "check"
      ? t("skr.checking")
      : busy === "wallet"
        ? t("common.waitingWallet")
        : busy === "send"
          ? t("common.confirmingSolana")
          : t("skr.unlock");
  return (
    <PixelBox border={C.purple} style={st.gap} inner={st.pad}>
      <Text style={st.title}>{t("skr.packTitle")}</Text>
      <Text style={st.dim}>{t("skr.packBody")}</Text>
      <View style={st.row}>
        <Button small title={title} onPress={onPress} disabled={!treasury || !!busy || !!props.disabled} />
      </View>
    </PixelBox>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Text style={st.body}>
      <Text style={st.dim}>{label}: </Text>
      {value}
    </Text>
  );
}

const yn = (b: boolean) => (b ? t("skr.yes") : t("skr.no"));
const json = (x: unknown) => {
  try {
    return JSON.stringify(x).slice(0, 400);
  } catch {
    return "";
  }
};

function UnlockedPack({ item, unlock }: { item: WatchItem; unlock: PackUnlock }) {
  const r = item.last;
  const extra = (r ?? {}) as unknown as Record<string, unknown>;
  const basis = typeof extra.data_basis === "string" ? extra.data_basis : null;
  const latest = r?.bulletin_board?.latest ?? null;
  const source = r?.context && typeof r.context.source === "string" ? r.context.source : null;
  return (
    <PixelBox border={C.purple} style={st.gap} inner={st.pad}>
      <Text style={st.title}>{t("skr.unlockedTitle")}</Text>

      <Text style={st.label}>{t("skr.receipt")}</Text>
      <Text style={st.mono}>{short(unlock.signature, 10)}</Text>
      <Text style={[st.mono, st.small]}>{t("skr.paidFor", { hash: unlock.packHash })}</Text>
      <View style={st.row}>
        <Button small kind="ghost" title={t("anchor.openExplorer")} onPress={() => openMainnetExplorer(unlock.signature)} />
      </View>

      {r ? (
        <>
          <Text style={st.label}>{t("skr.record")}</Text>
          {item.verification?.packHash ? <Field label={t("skr.packHash")} value={`sha256:${item.verification.packHash}`} /> : null}
          <Field label={t("skr.f.uma")} value={r.uma_state} />
          <Field label={t("skr.f.disputes")} value={String(r.dispute_count)} />
          <Field label={t("skr.f.openDispute")} value={yn(!!r.open_dispute)} />
          <Field label={t("skr.f.vote")} value={yn(!!r.sent_to_uma_vote)} />
          <Field label={t("skr.f.clar")} value={String(r.bulletin_board?.count ?? 0)} />
          {latest ? <Field label={t("skr.f.clarLatest")} value={[latest.posted_at, latest.kind, latest.poster].filter((x) => typeof x === "string" && x).join(" . ")} /> : null}
          {r.current_proposal != null ? <Field label={t("skr.f.proposal")} value={json(r.current_proposal)} /> : null}
          {r.onchain_resolution != null ? <Field label={t("skr.f.resolution")} value={json(r.onchain_resolution)} /> : null}
          <Field label={t("skr.f.recommendation")} value={r.recommendation} />
          {source ? <Field label={t("skr.f.source")} value={source} /> : null}
          {basis ? <Field label={t("skr.f.basis")} value={basis} /> : null}
          <Field label={t("skr.f.checked")} value={r.checked_at} />

          {r.disputes?.length ? (
            <>
              <Text style={st.label}>{t("skr.history")}</Text>
              {r.disputes.map((d, i) => (
                <Text key={i} style={[st.mono, st.small]}>
                  {[d.disputed_at, typeof d.disputed_proposal === "string" ? d.disputed_proposal : null, d.tx].filter((x) => typeof x === "string" && x).join(" . ")}
                </Text>
              ))}
            </>
          ) : null}
        </>
      ) : null}

      <Text style={st.label}>{t("skr.timeline")}</Text>
      {item.timeline.length ? (
        item.timeline.map((e, i) => (
          <Text key={`${e.at}-${i}`} style={st.body}>
            <Text style={st.dim}>{e.at.replace("T", " ").slice(0, 16)} </Text>
            {e.text}
          </Text>
        ))
      ) : (
        <Text style={st.dim}>{t("skr.emptyTimeline")}</Text>
      )}
    </PixelBox>
  );
}

const st = StyleSheet.create({
  gap: { marginTop: 14 },
  pad: { padding: 14 },
  title: { color: C.purpleSoft, fontFamily: PX, fontSize: 11, lineHeight: 18, marginBottom: 8 },
  label: { color: C.dim, fontSize: 8, marginTop: 12, marginBottom: 4, textTransform: "uppercase", fontFamily: PX },
  body: { color: C.text, fontSize: T.body, lineHeight: 21, marginVertical: 2 },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18 },
  mono: { color: C.text, fontFamily: MONO, fontSize: T.small },
  small: { fontSize: 11, color: C.dim },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" },
});
