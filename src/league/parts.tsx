import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { alpha, C, PX, T } from "../theme";
import { Button, PixelBox, Press } from "../ui";
import { LeagueError } from "./api";
import { LEAGUE_DISCLAIMER } from "./config";
import { Avatar, RankMark } from "./pixels";
import type { BoardRow } from "./api";

export function useAsync<A>(fn: () => Promise<A>, deps: unknown[]) {
  const [data, setData] = useState<A | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const run = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fn();
      if (alive.current) (setData(d), setError(null));
    } catch (e) {
      if (alive.current) setError(e instanceof LeagueError ? e.message : "Something went wrong. Try again.");
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => void run(), [run]);
  return { data, error, loading, reload: run };
}

export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  if (error) {
    return (
      <View style={{ marginTop: 18 }}>
        <Text style={st.err}>{error}</Text>
        {onRetry ? <Button small kind="ghost" title="Try again" onPress={onRetry} style={{ marginTop: 10 }} /> : null}
      </View>
    );
  }
  return <ActivityIndicator color={C.green} style={{ marginTop: 24 }} />;
}

export function Notice({ text }: { text: string }) {
  return <Text style={st.notice}>{text}</Text>;
}

export const Disclaimer = () => <Text style={st.disclaimer}>{LEAGUE_DISCLAIMER}</Text>;

export function SectionTitle({ children }: { children: string }) {
  return <Text style={st.section}>{children}</Text>;
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { id: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={st.tabs}>
      {tabs.map((t) => (
        <View key={t.id} style={{ flex: 1 }}>
          <Press onPress={() => onChange(t.id)} label={t.label} role="tab">
            <PixelBox p={2} border={value === t.id ? C.green : C.line} bg={value === t.id ? alpha(C.green, 0.16) : C.surface} inner={{ paddingVertical: 9, alignItems: "center" }}>
              <Text style={[st.tab, value === t.id && { color: C.greenBright }]}>{t.label}</Text>
            </PixelBox>
          </Press>
        </View>
      ))}
    </View>
  );
}

export function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number; caps?: boolean }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={st.label}>{props.label}</Text>
      <PixelBox p={2} border={C.line} bg={C.bg} inner={{ paddingHorizontal: 10 }}>
        <TextInput
          value={props.value}
          onChangeText={props.onChange}
          placeholder={props.placeholder}
          placeholderTextColor={C.dim}
          maxLength={props.max}
          autoCapitalize={props.caps ? "characters" : "none"}
          autoCorrect={false}
          style={st.input}
          accessibilityLabel={props.label}
        />
      </PixelBox>
    </View>
  );
}

/** One leaderboard row: medal or rank, avatar, nickname, weekly points. */
export function BoardRowView({ row }: { row: BoardRow }) {
  return (
    <PixelBox p={2} border={row.you ? C.green : C.line} bg={row.you ? alpha(C.green, 0.1) : C.surface} style={{ marginTop: 8 }} inner={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <RankMark rank={row.rank} />
      <Avatar id={row.avatar} px={3} />
      <Text style={[st.name, row.you && { color: C.greenBright }]} numberOfLines={1}>
        {row.nickname}
        {row.you ? " (you)" : ""}
      </Text>
      <Text style={st.xp}>{row.weeklyXp} XP</Text>
    </PixelBox>
  );
}

export const st = StyleSheet.create({
  err: { color: C.orange, fontSize: T.body, lineHeight: 21 },
  notice: { color: C.greenBright, fontSize: T.body, lineHeight: 21, marginTop: 10 },
  disclaimer: { color: C.dim, fontSize: T.micro + 1, lineHeight: 16, marginTop: 18 },
  section: { color: C.dim, fontFamily: PX, fontSize: 9, marginTop: 20, marginBottom: 2 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 14 },
  tab: { color: C.dim, fontFamily: PX, fontSize: 8 },
  label: { color: C.dim, fontFamily: PX, fontSize: 8, marginBottom: 6 },
  input: { color: C.text, fontSize: T.body + 1, paddingVertical: 10 },
  name: { flex: 1, color: C.text, fontSize: T.body, fontWeight: "700" },
  xp: { color: C.greenBright, fontFamily: PX, fontSize: 9 },
  body: { color: C.text, fontSize: T.body, lineHeight: 22 },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18 },
  h: { color: C.greenBright, fontFamily: PX, fontSize: 14, lineHeight: 22 },
});
