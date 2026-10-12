// TODAY: the daily loop. Level, today's changes, streak and clock in, the daily dispute, the watchlist.
import React from "react";
import { Pressable, View, type ScrollViewProps } from "react-native";
import { STATUS, STATUS_ORDER, C, alpha } from "../theme";
import { XP, levelName, type GameState, lastSeven, levelOf } from "../game";
import type { changesLast24h, Settings, WatchItem } from "../store";
import { Burst, Flame, LevelBadge, LiveMascot, PixelBar, PixelBox, Press, StatusIcon } from "../ui";
import { PixelIcon, type Mood } from "../sprites";
import { FLAGS } from "../features";
import { DailyDisputeCard } from "../dailyDispute/DailyDispute";
import { Text } from "../Text";
import { t, tn } from "../i18n";
import { AddMarketCard, ago, hh, MarketCard, statusColor, statusLabel, styles, TabScroll, type AddMarketProps } from "./shared";

export interface TodayTabProps {
  active: boolean;
  refreshControl: ScrollViewProps["refreshControl"];
  settings: Settings;
  game: GameState;
  level: ReturnType<typeof levelOf>;
  streak: number;
  week: ReturnType<typeof lastSeven>;
  canIn: boolean;
  clockPlay: number;
  bgOk: boolean | null;
  items: WatchItem[];
  today: { item: WatchItem; changes: ReturnType<typeof changesLast24h> }[];
  counts: Record<string, number>;
  shown: WatchItem[];
  filter: string | null;
  setFilter: (f: string | null) => void;
  pendingExamples: string[];
  lastCheck?: string;
  homeMood: Mood;
  puzzleTick: number;
  onBadges: () => void;
  onClockIn: () => void;
  onOpenDetail: (key: string) => void;
  onPuzzle: () => void;
  add: AddMarketProps;
}

export function TodayTab(p: TodayTabProps) {
  const { level, game, settings, items, today, counts, filter, streak, canIn } = p;
  return (
    <TabScroll active={p.active} refreshControl={p.refreshControl}>
      <View style={styles.header}>
        <View style={styles.rowBetween}>
          <Text style={styles.brand}>SETTLE WATCH</Text>
          <Press onPress={p.onBadges} label={t("home.levelLabel", { n: level.index + 1, name: levelName(level.index) })}>
            <LevelBadge index={level.index} progress={level.progress} />
          </Press>
        </View>
        <Text style={styles.display}>{levelName(level.index).toUpperCase()}</Text>
        <View style={{ marginTop: 10 }}>
          <PixelBar value={level.progress} />
        </View>
        <Text style={[styles.subtitle, { marginTop: 8 }]}>
          {level.next ? t("home.xpNext", { xp: game.xp, toNext: level.toNext, next: levelName(level.index + 1) }) : t("home.xpTop", { xp: game.xp })}
        </Text>
        <Text style={[styles.subtitle, { marginTop: 8 }]}>{t("home.subtitle")}</Text>
        <View style={styles.stepRow}>
          {Array.from({ length: 24 }).map((_, i) => (
            <View key={i} style={[styles.stepBit, { backgroundColor: i % 3 === 0 ? alpha(C.purple, 0.55) : alpha(C.green, 0.35) }]} />
          ))}
        </View>
      </View>

      {p.pendingExamples.length ? (
        <PixelBox border={C.orange} bg={alpha(C.orange, 0.1)} style={{ marginTop: 14 }} inner={{ padding: 12 }}>
          <Text style={styles.body}>{tn("home.stillLoading", p.pendingExamples.length)}</Text>
        </PixelBox>
      ) : null}

      {/* Today: the hero, on paper */}
      <PixelBox border={C.ink} bg={C.cream} lift="#8c7f66" style={{ marginTop: 14 }} inner={{ padding: 16 }}>
        <View style={styles.rowBetween}>
          <Text style={styles.heroKicker}>{t("home.today")}</Text>
          <View style={{ marginTop: -4 }}>
            <LiveMascot mood={p.homeMood} px={4} />
          </View>
        </View>
        <Text style={styles.heroDim}>{t("home.last24", { ago: ago(p.lastCheck) })}</Text>
        {items.length === 0 ? (
          <Text style={styles.heroBody}>{t("home.empty")}</Text>
        ) : today.length === 0 ? (
          <Text style={styles.heroBody}>
            {tn("home.noChanges", items.length)}{" "}
            {counts.caution + counts.watch ? tn("home.attention", counts.caution + counts.watch) : t("home.noAttention")}
          </Text>
        ) : (
          today.map(({ item, changes }) => (
            <Pressable
              key={item.key}
              onPress={() => {
                p.onClockIn();
                p.onOpenDetail(item.key);
              }}
              style={styles.todayRow}
              accessibilityRole="button"
            >
              <View style={[styles.dotBig, { backgroundColor: statusColor(item.last?.risk_level) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroRowTitle} numberOfLines={1}>
                  {item.question ?? item.key}
                </Text>
                <Text style={styles.heroDim}>
                  {changes[0].text} . {ago(changes[0].at)}
                  {changes.length > 1 ? t("home.more", { n: changes.length - 1 }) : ""}
                </Text>
              </View>
            </Pressable>
          ))
        )}

        <View style={styles.heroRule} />
        <View style={styles.streakRow}>
          <Flame size={5} lit={streak > 0} />
          <View style={{ flex: 1 }}>
            <Text style={styles.streakNum}>
              {streak} <Text style={styles.streakUnit}>{t("home.dayStreak")}</Text>
            </Text>
            <Text style={styles.heroDim}>{t("home.freeMiss", { best: game.best })}</Text>
          </View>
        </View>
        <View style={styles.weekRow}>
          {p.week.map((d) => (
            <View key={d.day} style={styles.weekCell} accessibilityLabel={t(d.done ? "home.dayDone" : d.saved ? "home.daySaved" : "home.dayMissed", { day: d.day })}>
              <View
                style={[
                  styles.weekDot,
                  d.done && { backgroundColor: C.ink, borderColor: C.ink },
                  d.saved && !d.done && { borderColor: C.purple, backgroundColor: alpha(C.purple, 0.2) },
                  d.today && !d.done && { borderColor: C.ink, borderStyle: "dashed" },
                ]}
              >
                {d.done ? <PixelIcon name="check" px={3} color={C.green} /> : null}
              </View>
              <Text style={styles.weekLabel}>{d.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.clockRow}>
          {p.clockPlay > 0 && !canIn ? <Burst play={p.clockPlay} size={46} haptic="clockIn" /> : null}
          <View style={{ flex: 1 }}>
            <Press onPress={p.onClockIn} disabled={!canIn} haptics={false} label={canIn ? t("home.clockInLabel") : t("home.clockedInLabel")}>
              <PixelBox border={canIn ? C.ink : alpha(C.ink, 0.25)} bg={canIn ? C.ink : alpha(C.ink, 0.1)} lift={canIn ? "#000000" : undefined} inner={{ paddingVertical: 15, alignItems: "center" }}>
                <Text style={[styles.clockBtnText, !canIn && { color: C.inkSoft }]}>{canIn ? t("home.clockIn", { xp: XP.clock_in + Math.min(streak + 1, 7) * 2 }) : t("home.clockedIn")}</Text>
              </PixelBox>
            </Press>
          </View>
        </View>
        <Text style={[styles.heroDim, { marginTop: 10 }]}>
          {settings.digest ? t("home.digestAt", { time: hh(settings.digestHour) }) : t("home.digestOff")}{" "}
          {p.bgOk === false ? t("home.bgOff") : t("home.bgOn")}
        </Text>
      </PixelBox>

      {FLAGS.dailyDispute ? <DailyDisputeCard refreshKey={p.puzzleTick} onOpen={p.onPuzzle} /> : null}

      {/* Watchlist at a glance */}
      <Text style={styles.section}>{t("list.title", { n: items.length })}</Text>
      {items.length ? (
        <View style={styles.glance}>
          {STATUS_ORDER.map((r) => (
            <Press key={r} onPress={() => p.setFilter(filter === r ? null : r)} label={t("list.show", { label: statusLabel(r) })} fill>
              <PixelBox
                p={3}
                border={alpha(STATUS[r].color, filter === r ? 1 : 0.5)}
                bg={alpha(STATUS[r].color, filter === r ? 0.28 : 0.1)}
                inner={{ paddingVertical: 10, alignItems: "center", gap: 6 }}
              >
                <StatusIcon level={r} color={STATUS[r].color} px={2} />
                <Text style={[styles.glanceNum, { color: STATUS[r].color }]}>{counts[r]}</Text>
                <Text style={[styles.glanceLabel, { color: STATUS[r].color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {statusLabel(r)}
                </Text>
              </PixelBox>
            </Press>
          ))}
        </View>
      ) : null}
      {filter ? <Text style={[styles.dim, { marginTop: 6 }]}>{t("list.filtered", { label: statusLabel(filter) })}</Text> : null}
      {p.shown.map((it, i) => (
        <MarketCard key={it.key} item={it} index={i} onOpen={() => p.onOpenDetail(it.key)} />
      ))}

      {/* Add a market */}
      <AddMarketCard {...p.add} />
    </TabScroll>
  );
}
