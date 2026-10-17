// Monad edition onboarding: three screens, one sentence each, no typing. Ends on the MONAD tab.
import React, { useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Text } from "../Text";
import { PX } from "../theme";
import { useLang, type Lang } from "../i18n";
import { L, LButton } from "./IntegrationsScreen";

type Copy = { s1: string; s1ex: string; s2: string; s2sub: string; s3: string; s3sub: string; next: string; start: string; skip: string };

const COPY: Record<Lang, Copy> = {
  en: {
    s1: "1 in 3 disputed answers on Polymarket changed in 2026.",
    s1ex: "Iran, $15M: proposed YES, settled NO.\nMicroStrategy, $376M: disputed, the answer held.",
    s2: "Check it, see who's exposed, act in one tap.",
    s2sub: "Insure, hedge or wait.",
    s3: "Your fingerprint, email or wallet is your account.",
    s3sub: "No seed phrase.",
    next: "NEXT",
    start: "START",
    skip: "Skip",
  },
  es: {
    s1: "1 de cada 3 respuestas disputadas en Polymarket cambió en 2026.",
    s1ex: "Irán, $15M: se propuso SÍ, se resolvió NO.\nMicroStrategy, $376M: disputada, la respuesta se mantuvo.",
    s2: "Revísalo, mira quién está expuesto, actúa con un toque.",
    s2sub: "Asegura, cubre o espera.",
    s3: "Tu huella, tu email o tu billetera es tu cuenta.",
    s3sub: "Sin frase semilla.",
    next: "SIGUIENTE",
    start: "EMPEZAR",
    skip: "Saltar",
  },
  pt: {
    s1: "1 em cada 3 respostas contestadas na Polymarket mudou em 2026.",
    s1ex: "Irã, $15M: proposto SIM, resolvido NÃO.\nMicroStrategy, $376M: contestada, a resposta se manteve.",
    s2: "Confira, veja quem está exposto, aja com um toque.",
    s2sub: "Proteja, faça hedge ou espere.",
    s3: "Sua digital, seu email ou sua carteira é a sua conta.",
    s3sub: "Sem frase-semente.",
    next: "PRÓXIMO",
    start: "COMEÇAR",
    skip: "Pular",
  },
  zh: {
    s1: "2026 年，Polymarket 上每 3 个被争议的答案就有 1 个被改变。",
    s1ex: "伊朗，1500 万美元：提议 YES，结算 NO。\nMicroStrategy，3.76 亿美元：被争议，答案维持不变。",
    s2: "查看它，看谁有风险敞口，一键行动。",
    s2sub: "投保、对冲或等待。",
    s3: "你的指纹、邮箱或钱包就是你的账户。",
    s3sub: "无需助记词。",
    next: "下一步",
    start: "开始",
    skip: "跳过",
  },
  ko: {
    s1: "2026년 Polymarket에서 이의 제기된 답 3개 중 1개가 바뀌었어요.",
    s1ex: "이란, 1,500만 달러: YES로 제안, NO로 확정.\nMicroStrategy, 3억 7,600만 달러: 이의 제기, 답 유지.",
    s2: "확인하고, 누가 노출됐는지 보고, 한 번에 행동하세요.",
    s2sub: "보험, 헤지 또는 대기.",
    s3: "지문, 이메일 또는 지갑이 곧 계정이에요.",
    s3sub: "시드 문구가 없어요.",
    next: "다음",
    start: "시작",
    skip: "건너뛰기",
  },
  ru: {
    s1: "В 2026 году каждый третий оспоренный ответ на Polymarket изменился.",
    s1ex: "Иран, $15M: предложили YES, итог NO.\nMicroStrategy, $376M: оспорили, ответ устоял.",
    s2: "Проверь, посмотри, кто под риском, действуй в одно касание.",
    s2sub: "Застраховать, захеджировать или подождать.",
    s3: "Твой отпечаток, почта или кошелёк — это твой аккаунт.",
    s3sub: "Без seed-фразы.",
    next: "ДАЛЕЕ",
    start: "НАЧАТЬ",
    skip: "Пропустить",
  },
};

export function MonadOnboarding({ onDone }: { onDone: () => void }) {
  const lang = useLang();
  const c = COPY[lang] ?? COPY.en;
  const [page, setPage] = useState(0);
  const pages = [
    { big: c.s1, sub: c.s1ex },
    { big: c.s2, sub: c.s2sub },
    { big: c.s3, sub: c.s3sub },
  ];
  const last = page === pages.length - 1;
  return (
    <SafeAreaView style={ost.root}>
      <StatusBar style="dark" />
      <View style={ost.top}>
        <Text style={ost.brand}>SETTLE WATCH</Text>
        {!last ? (
          <Text style={ost.skip} onPress={onDone} accessibilityRole="button">
            {c.skip}
          </Text>
        ) : null}
      </View>
      <View style={ost.body}>
        <Text style={ost.big}>{pages[page].big}</Text>
        <View style={ost.rule} />
        <Text style={ost.sub}>{pages[page].sub}</Text>
      </View>
      <View style={ost.dots}>
        {pages.map((_, i) => (
          <View key={i} style={[ost.dot, i === page && ost.dotOn]} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 28 }}>
        <LButton title={last ? c.start : c.next} onPress={() => (last ? onDone() : setPage(page + 1))} stretch />
      </View>
    </SafeAreaView>
  );
}

const ost = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 52 },
  brand: { color: L.accentInk, fontFamily: PX, fontSize: 10 },
  skip: { color: L.dim, fontSize: 15, padding: 8 },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  big: { color: L.ink, fontSize: 28, lineHeight: 37, fontWeight: "800" },
  rule: { width: 48, height: 4, backgroundColor: L.accent, marginVertical: 20 },
  sub: { color: L.ink, fontSize: 18, lineHeight: 27 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 18 },
  dot: { width: 10, height: 10, backgroundColor: L.line },
  dotOn: { backgroundColor: L.accent },
});
