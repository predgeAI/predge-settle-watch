import React from "react";
import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from "react-native";
import { PX } from "./theme";
import { pixelFontOk, useLang } from "./i18n";

// The pixel font scales small; the system font needs a little more size to read the same.
const SCALE = 1.25;

/** Style for text that should use the pixel font, with a system-font fallback where the font has no glyphs. */
export function pixelFont(style: TextStyle | undefined): TextStyle | undefined {
  if (!style || style.fontFamily !== PX || pixelFontOk()) return style;
  const { fontFamily: _drop, ...rest } = style;
  return {
    ...rest,
    fontWeight: rest.fontWeight ?? "700",
    fontSize: rest.fontSize ? Math.round(rest.fontSize * SCALE) : undefined,
    lineHeight: rest.lineHeight ? Math.round(rest.lineHeight * SCALE) : undefined,
  };
}

/**
 * Drop-in for React Native's Text. Re-renders on a language change and, for Chinese and Korean,
 * swaps the pixel font for the system font so every glyph renders.
 */
export const Text = React.forwardRef<RNText, TextProps>(function Text(props, ref) {
  useLang();
  if (pixelFontOk()) return <RNText ref={ref} {...props} />;
  const flat = StyleSheet.flatten(props.style) as TextStyle | undefined;
  if (!flat || flat.fontFamily !== PX) return <RNText ref={ref} {...props} />;
  return <RNText ref={ref} {...props} style={pixelFont(flat)} />;
});
