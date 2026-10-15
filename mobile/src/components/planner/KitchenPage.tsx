import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PageTitle, WebPage } from "@/src/components/web/ui";
import { useWideWeb } from "@/src/utils/useWideWeb";

// The frame for the Kitchen's own pages (Overview, Prep & shopping): in a
// desktop browser a page under the section's tabs; on a phone a screen of
// its own, with a way back and the cards one under another.
// (`back`: a way back; not for one that's a tab of its own.)
export function KitchenPage({ title, subtitle, right, back = true, children }: { title: string; subtitle: string; right?: ReactNode; back?: boolean; children: ReactNode }) {
  const router = useRouter();
  const wide = useWideWeb();
  if (wide) {
    return (
      <WebPage maxWidth={1180}>
        <PageTitle title={title} subtitle={subtitle} right={right} />
        {children}
      </WebPage>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
        {back && (
          <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" onPress={() => (router.canGoBack() ? router.back() : router.replace("/overview"))} accessibilityLabel="Back">
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
