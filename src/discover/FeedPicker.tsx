// "What do you follow?": pixel toggle chips for feed interests, plus a short country picker.
// Used by onboarding, the ME tab ("Your feed") and, without the country picker, on top of Discover.
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../Text";
import { t, useLang, type Key } from "../i18n";
import { C, T } from "../theme";
import { PixelBox, Press } from "../ui";
import { COUNTRY_CODES, countryName, INTERESTS, toggleInterest, type FeedPrefs, type Interest } from "./interests";

function Toggle({ label, on, onPress, a11y }: { label: string; on: boolean; onPress: () => void; a11y?: string }) {
  return (
    <Press onPress={onPress} label={a11y ?? label}>
      <PixelBox p={2} border={on ? "#2f6b38" : C.line} bg={on ? C.green : C.surfaceHi} inner={{ paddingHorizontal: 10, paddingVertical: 7 }}>
        <Text style={[st.chip, { color: on ? "#07120a" : C.text }]}>{label}</Text>
      </PixelBox>
    </Press>
  );
}

/** Label for one interest chip; "country" shows the country's name. */
export function interestLabel(i: Interest, country: string | undefined, lang: string): string {
  if (i === "country") return country ? countryName(country, lang).toUpperCase() : "";
  return t(`feed.${i}` as Key);
}

/** Interest chips. The country chip only shows when a country is set. */
export function InterestChips({ prefs, onChange }: { prefs: FeedPrefs; onChange: (p: FeedPrefs) => void }) {
  const lang = useLang();
  return (
    <View style={st.wrap}>
      {INTERESTS.filter((i) => i !== "country" || prefs.country).map((i) => {
        const label = interestLabel(i, prefs.country, lang);
        return (
          <Toggle
            key={i}
            label={label}
            a11y={t("feed.toggle", { topic: label })}
            on={prefs.interests.includes(i)}
            onPress={() => onChange({ ...prefs, interests: toggleInterest(prefs.interests, i) })}
          />
        );
      })}
    </View>
  );
}

/** Interest chips plus "Change country" with ~20 common countries and "Other / none". */
export function FeedPicker({ prefs, onChange }: { prefs: FeedPrefs; onChange: (p: FeedPrefs) => void }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const pick = (country: string | undefined) => {
    // Picking a country also turns its chip on; "none" leaves the list as it is.
    const interests: Interest[] = country && !prefs.interests.includes("country") ? toggleInterest(prefs.interests, "country") : prefs.interests;
    onChange({ interests, country });
    setOpen(false);
  };
  return (
    <View>
      <InterestChips prefs={prefs} onChange={onChange} />
      <View style={[st.row, { marginTop: 10 }]}>
        <Text style={[st.dim, { flexShrink: 1 }]}>{prefs.country ? t("feed.countryLabel", { name: countryName(prefs.country, lang) }) : t("feed.countryUnset")}</Text>
        <Press onPress={() => setOpen(!open)} label={t("feed.changeCountry")} haptics={false}>
          <Text style={st.link}>{t("feed.changeCountry")}</Text>
        </Press>
      </View>
      {open ? (
        <View style={[st.wrap, { marginTop: 8 }]}>
          {COUNTRY_CODES.map((c) => (
            <Toggle key={c} label={countryName(c, lang)} on={prefs.country === c} onPress={() => pick(c)} />
          ))}
          <Toggle label={t("feed.noCountry")} on={!prefs.country} onPress={() => pick(undefined)} />
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chip: { fontSize: T.small, fontWeight: "700" }, // system font: country names can have letters the pixel font lacks
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18 },
  link: { color: C.dim, fontSize: T.small, textDecorationLine: "underline", paddingVertical: 8, paddingLeft: 8 },
});
