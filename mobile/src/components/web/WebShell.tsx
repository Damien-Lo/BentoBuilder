import { Ionicons } from "@expo/vector-icons";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { PaneContext } from "@/src/utils/pane";
import { useWideWeb } from "@/src/utils/useWideWeb";

import { isDesktopPage, resolveWebRoute, WEB_SECTIONS, type WebSection } from "./nav";

// The desktop frame for the browser. On a phone, or a narrow window, it
// adds nothing and the app is laid out as usual.
//
//   rail      a thin strip of icons, one per section — the only app-wide
//             navigation, so a page is free to have a side panel of its own
//             (the calendar's month and calendars, the task lists) without
//             there being two sidebars;
//   header    the section's name and its pages as tabs;
//   content   a page laid out for the desktop gets the whole pane, and a
//             phone-shaped page (a form, a detail page) is a column in the
//             middle.

export const WEB_RAIL_WIDTH = 76;
const HEADER_HEIGHT = 54;
// How wide a phone-shaped page is allowed to grow.
const COLUMN_MAX_WIDTH = 760;

type Hover = { hovered?: boolean };

export function WebShell({ children }: { children: ReactNode }) {
  const wide = useWideWeb();
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  // The content pane's own size, for screens that lay out by width.
  const [pane, setPane] = useState<{ width: number; height: number } | null>(null);
  if (!wide) return <>{children}</>;

  const { section, tab } = resolveWebRoute(pathname);
  const desktop = isDesktopPage(pathname, params);
  // Home greets you itself, and the calendar's toolbar is its header.
  const showHeader = !!section && section.id !== "home" && pathname !== "/calendar";
  const go = (path: string) => router.navigate(path as Parameters<typeof router.navigate>[0]);

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#F1F5F9" }}>
      {/* Rail */}
      <View style={{ width: WEB_RAIL_WIDTH, alignItems: "center", backgroundColor: "#FFFFFF", borderRightWidth: 1, borderRightColor: "#E2E8F0", paddingVertical: 12 }}>
        <Pressable
          onPress={() => go("/")}
          accessibilityLabel="BentoBuilder home"
          style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center", marginBottom: 14 }}
        >
          <Ionicons name="grid-outline" size={20} color="#FFFFFF" />
        </Pressable>
        {WEB_SECTIONS.filter((s) => !s.footer).map((s) => (
          <RailButton key={s.id} section={s} on={section?.id === s.id} onPress={() => go(s.path)} />
        ))}
        <View style={{ flex: 1 }} />
        {WEB_SECTIONS.filter((s) => s.footer).map((s) => (
          <RailButton key={s.id} section={s} on={section?.id === s.id} onPress={() => go(s.path)} />
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {/* Section header: its name, and its pages as tabs */}
        {showHeader && section && (
          <View
            style={{
              height: HEADER_HEIGHT,
              flexDirection: "row",
              alignItems: "stretch",
              paddingHorizontal: 24,
              backgroundColor: "#FFFFFF",
              borderBottomWidth: 1,
              borderBottomColor: "#E2E8F0",
            }}
          >
            <View style={{ justifyContent: "center", marginRight: 28 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>{section.label}</Text>
            </View>
            {section.tabs.map((t) => {
              const on = tab?.path === t.path;
              return (
                <Pressable
                  key={t.path}
                  onPress={() => go(t.path)}
                  style={({ hovered }: Hover) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    marginRight: 2,
                    borderBottomWidth: 2,
                    borderBottomColor: on ? "#2563EB" : hovered ? "#CBD5E1" : "transparent",
                    // (Keeps the label centred against the 2px underline.)
                    paddingTop: 2,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: on ? "700" : "500", color: on ? "#1D4ED8" : "#475569" }}>{t.label}</Text>
                  {t.planned && (
                    <View style={{ marginLeft: 6, borderRadius: 999, backgroundColor: "#E2E8F0", paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: "#64748B" }}>PLANNED</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Content */}
        <View style={{ flex: 1, alignItems: "center" }}>
          <View
            style={{
              flex: 1,
              width: "100%",
              maxWidth: desktop ? undefined : COLUMN_MAX_WIDTH,
              backgroundColor: "#F8FAFC",
              borderLeftWidth: desktop ? 0 : 1,
              borderRightWidth: desktop ? 0 : 1,
              borderColor: "#E2E8F0",
              overflow: "hidden",
            }}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setPane((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
            }}
          >
            {/* Nothing is drawn until the pane has been measured. */}
            {pane && <PaneContext.Provider value={pane}>{children}</PaneContext.Provider>}
          </View>
        </View>
      </View>
    </View>
  );
}

function RailButton({ section, on, onPress }: { section: WebSection; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={section.label}
      style={({ hovered }: Hover) => ({
        width: 64,
        paddingVertical: 8,
        marginBottom: 4,
        alignItems: "center",
        borderRadius: 12,
        backgroundColor: on ? "#EFF6FF" : hovered ? "#F1F5F9" : "transparent",
      })}
    >
      <Ionicons name={on ? (section.icon.replace("-outline", "") as typeof section.icon) : section.icon} size={22} color={on ? "#1D4ED8" : "#64748B"} />
      <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 10.5, fontWeight: on ? "700" : "500", color: on ? "#1D4ED8" : "#64748B" }}>
        {section.label}
      </Text>
    </Pressable>
  );
}
