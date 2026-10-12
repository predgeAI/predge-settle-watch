import React, { useEffect, useState } from "react";
import type { StyleProp, TextStyle } from "react-native";
import { Text } from "../Text";
import { fmtDec, t, useLang } from "../i18n";
import { onSkrChanged, skrHoldings } from "./chain";
import { formatSkr } from "./spl";

/** SKR held on mainnet by the connected wallet. Shows nothing while loading or when the network fails. */
export function SkrBalance({ address, style }: { address: string; style?: StyleProp<TextStyle> }) {
  useLang();
  const [base, setBase] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => onSkrChanged(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    let live = true;
    skrHoldings(address)
      .then((h) => live && setBase(h.total))
      .catch(() => live && setBase(null));
    return () => {
      live = false;
    };
  }, [address, tick]);
  if (base === null) return null;
  return <Text style={style}>{base === "0" ? `  ${t("skr.none")}` : `  ${t("skr.balance", { n: fmtDec(formatSkr(base)) })}`}</Text>;
}
