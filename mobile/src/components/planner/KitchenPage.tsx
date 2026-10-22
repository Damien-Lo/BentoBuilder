import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Tap } from "@/src/components/ui/Tap";
import { PageTitle, WebPage } from "@/src/components/web/ui";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// The frame for the Kitchen's own pages (Overview, Prep & shopping): in a
// desktop browser a page under the section's tabs; on a phone a screen of
// its own, with a way back and the cards one under another.
// (`back`: a way back; not for one that's a tab of its own.)
// (`orbit`: on a phone, in Orbit's look — the way back over a large title
// on the page itself, and the cards in it in its colours.)
export function KitchenPage({ title, subtitle, right, back = true, bare = false, orbit = false, children }: { title: string; subtitle: string; right?: ReactNode; back?: boolean; bare?: boolean; orbit?: boolean; children: ReactNode }) {
  const router = useRouter();
  const wide = useWideWeb();
  const { colors } = useOrbitTheme();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/overview"));
  if (wide) {
    return (
      // (`orbit`: in Orbit's look on the desktop too.)
      <OrbitPage on={orbit}>
        <WebPage maxWidth={1180}>
          <PageTitle title={title} subtitle={subtitle} right={right} />
          {children}
        </WebPage>
      </OrbitPage>
    );
  }
  if (orbit) {
    return (
      <OrbitPage>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
          {back && !bare && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4 }}>
              <Tap onPress={goBack} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }} pressedStyle={{ backgroundColor: colors.pill }}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Tap>
              <View style={{ flex: 1 }} />
              {right}
            </View>
          )}
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {!bare && <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: colors.text }}>{title}</Text>}
            <Text style={{ marginTop: 2, marginBottom: 16, fontSize: 14, lineHeight: 19, color: colors.muted }}>{subtitle}</Text>
            {children}
          </ScrollView>
        </SafeAreaView>
      </OrbitPage>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      {/* (Part of the page, not a band of its own; none at all when `bare`: in a tab that names it.) */}
      <View className="flex-row items-center px-4 pb-1 pt-1" style={bare ? { display: "none" } : undefined}>
        {back && (
          <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" onPress={goBack} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
        )}
        <Text className={`${back ? "ml-2" : "ml-1"} flex-1 text-xl font-bold text-slate-950`} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Text className="mb-3 text-sm text-slate-500">{subtitle}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
