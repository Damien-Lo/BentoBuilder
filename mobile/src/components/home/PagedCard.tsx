import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView } from "react-native-gesture-handler";
import { Text, View } from "react-native";

import { Tap } from "@/src/components/ui/Tap";
import type { OrbitColors } from "@/src/theme/orbit";

// A home-screen card a page at a time — swiped across, the dots saying where
// you are. Each page, tapped, opens its page in the section. (Inside the
// card's 20-wide padding: the pages run to its edges, so the swipe does.)

export type CardPage = { title: string; route: Href; body: ReactNode };

export function PagedCard({ pages, go, colors: c }: { pages: CardPage[]; go: (route: Href) => void; colors: OrbitColors }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (width + 40)))} style={{ marginHorizontal: -20 }}>
          {pages.map((p) => (
            <Tap key={p.title} onPress={() => go(p.route)} accessibilityRole="button" accessibilityLabel={`${p.title}. Open`} style={{ width: width + 40, paddingHorizontal: 20 }} pressedStyle={{ opacity: 0.7 }}>
              <View style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.ink }}>{p.title}</Text>
                <Ionicons name="chevron-forward" size={13} color={c.ink} />
              </View>
              {p.body}
            </Tap>
          ))}
        </ScrollView>
      )}
      {pages.length > 1 && (
        <View style={{ marginTop: 12, flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {pages.map((p, i) => (
            <View key={p.title} style={{ width: i === page ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? c.ink : c.track }} />
          ))}
        </View>
      )}
    </View>
  );
}

// A page's pieces: a big figure, a quiet line, a row.
export const pageParts = (c: OrbitColors) => ({
  big: (value: string, unit: string, tone?: string) => (
    <Text style={{ fontSize: 24, fontWeight: "700", color: tone ?? c.text }}>
      {value} <Text style={{ fontSize: 14, fontWeight: "400", color: c.muted }}>{unit}</Text>
    </Text>
  ),
  line: (text: string, faint?: boolean) => <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 18, color: faint ? c.faint : c.muted }}>{text}</Text>,
  row: (key: string, icon: keyof typeof Ionicons.glyphMap, title: string, right?: string, tone?: string) => (
    <View key={key} style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name={icon} size={16} color={tone ?? c.muted} />
      <Text style={{ flex: 1, fontSize: 13.5, color: c.text }} numberOfLines={1}>
        {title}
      </Text>
      {right && <Text style={{ fontSize: 12.5, color: c.muted }}>{right}</Text>}
    </View>
  ),
});
