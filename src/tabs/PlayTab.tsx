// PLAY: the daily games, the card collection, the league, the weekly recap and badges.
import React from "react";
import { View, type ScrollViewProps } from "react-native";
import { C } from "../theme";
import { BADGES, type GameState, levelOf, weeklyRecap } from "../game";
import { BadgeIcon, Button, LevelBadge, PixelBox, Press } from "../ui";
import { FLAGS } from "../features";
import { DailyDisputeCard } from "../dailyDispute/DailyDispute";
import { RuleDetectiveCard } from "../ruleDetective/RuleDetective";
import { GlossaryEntry } from "../glossary/Glossary";
import { LEAGUE_ENABLED } from "../league/config";
import { LeagueCard } from "../league/LeagueEntry";
import { Text } from "../Text";
import { t } from "../i18n";
import { levelName } from "../game";
import { styles, TabHeader, TabScroll } from "./shared";

export interface PlayTabProps {
  active: boolean;
  refreshControl: ScrollViewProps["refreshControl"];
  game: GameState;
  level: ReturnType<typeof levelOf>;
  recap: ReturnType<typeof weeklyRecap>;
  unlocked: number;
  puzzleTick: number;
  glossTick: number;
  onPuzzle: () => void;
  onRule: () => void;
  onGlossary: () => void;
  onLeague: () => void;
  onBadges: () => void;
}

export function PlayTab(p: PlayTabProps) {
  const { game, level } = p;
  return (
    <TabScroll active={p.active} refreshControl={p.refreshControl}>
      <TabHeader
        title={t("tab.play")}
        sub={t("play.intro")}
        right={
          <Press onPress={p.onBadges} label={t("home.levelLabel", { n: level.index + 1, name: levelName(level.index) })}>
            <LevelBadge index={level.index} progress={level.progress} />
          </Press>
        }
      />

      {FLAGS.dailyDispute ? <DailyDisputeCard refreshKey={p.puzzleTick} onOpen={p.onPuzzle} /> : null}
      {FLAGS.ruleDetective ? <RuleDetectiveCard onOpen={p.onRule} /> : null}
      {FLAGS.glossary ? <GlossaryEntry game={game} refreshKey={p.glossTick} onOpen={p.onGlossary} /> : null}
      {LEAGUE_ENABLED ? <LeagueCard onOpen={p.onLeague} /> : null}

      {/* Weekly recap */}
      <PixelBox border={C.purple} bg="#1b1233" style={styles.cardGap} inner={styles.cardPad}>
        <Text style={styles.cardLabel}>{t("recap.title")}</Text>
        <Text style={styles.recapText}>{p.recap.text}</Text>
        <Text style={styles.dim}>{t("recap.xp", { n: p.recap.xp })}</Text>
      </PixelBox>

      {/* Badges */}
      <PixelBox style={styles.cardGap} inner={styles.cardPad}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>{t("badges.title")}</Text>
          <Text style={styles.dim}>{t("badges.count", { n: p.unlocked, total: BADGES.length })}</Text>
        </View>
        <View style={[styles.rowBetween, { marginVertical: 10 }]}>
          {BADGES.map((b) => (
            <BadgeIcon key={b.id} id={b.id} size={40} locked={!game.badges[b.id]} />
          ))}
        </View>
        <Button small kind="ghost" title={t("badges.all")} onPress={p.onBadges} />
      </PixelBox>
    </TabScroll>
  );
}
