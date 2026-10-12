// DISCOVER: popular markets with their dispute rates, plus the "Watch a market" card.
import React from "react";
import type { ScrollViewProps } from "react-native";
import { FLAGS } from "../features";
import { DiscoverFeed } from "../discover/Discover";
import { AddMarketCard, TabHeader, TabScroll, type AddMarketProps } from "./shared";
import { t } from "../i18n";

export interface DiscoverTabProps {
  active: boolean;
  refreshControl: ScrollViewProps["refreshControl"];
  watchingIds: string[];
  onWatch: (id: string) => void;
  add: AddMarketProps;
}

export function DiscoverTab(p: DiscoverTabProps) {
  return (
    <TabScroll active={p.active} refreshControl={p.refreshControl}>
      {FLAGS.discover ? (
        <DiscoverFeed visible={p.active} watchingIds={p.watchingIds} onWatch={p.onWatch}>
          <AddMarketCard {...p.add} />
        </DiscoverFeed>
      ) : (
        <>
          <TabHeader title={t("tab.discover")} />
          <AddMarketCard {...p.add} />
        </>
      )}
    </TabScroll>
  );
}
