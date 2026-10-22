import { Ionicons } from "@expo/vector-icons";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useAccount } from "@/src/components/auth/AuthGate";
import { OrbSphere } from "@/src/components/ui/OrbSphere";
import { SECTION_PALETTE, useOrbitTheme, type SectionId } from "@/src/theme/orbit";
import { PaneContext } from "@/src/utils/pane";
import { useWideWeb } from "@/src/utils/useWideWeb";

import { isDesktopPage, resolveWebRoute, WEB_SECTIONS, type WebSection } from "./nav";
import { setWebScaleChoice, useWebScale, WEB_SCALE_STEPS } from "./scale";
import { setWebThemeChoice, themeColor, useWebTheme, type WebThemeChoice } from "./theme";

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

// Beside a phone-shaped page: a shade darker than the page in either theme
// (left to the translation it would come out lighter in the dark).
const GUTTER = themeColor("234,232,227", "8,9,12");

// In Orbit's look (its light colours: the web's own dark mode turns them
// dark — see theme/engine.ts). A section's own colour marks where you are:
// its rail button and its open tab (SECTION_PALETTE; neutral for the rest).
const RAIL_HUE: Record<string, SectionId> = { calendar: "calendar", kitchen: "kitchen", nutrition: "nutrition", lists: "tasks" };
function hueOf(id: string | undefined): { tint: string; strong: string } | null {
  const shades = id && RAIL_HUE[id] ? SECTION_PALETTE[RAIL_HUE[id]] : null;
  return shades ? { tint: shades.tint, strong: shades.dark } : null;
}

type Hover = { hovered?: boolean };

export function WebShell({ children }: { children: ReactNode }) {
  const wide = useWideWeb();
  const router = useRouter();
  const pathname = usePathname();
  // (The developer tools are the admin's.)
  const isAdmin = useAccount().account?.role === "admin";
  const params = useGlobalSearchParams();
  // The content pane's own size, for screens that lay out by width.
  const [pane, setPane] = useState<{ width: number; height: number } | null>(null);
  // The whole layout is scaled to suit the window (see scale.ts).
  const { scale, choice } = useWebScale(wide);
  const [sizing, setSizing] = useState(false);
  // Light or dark (see theme/engine.ts).
  const theme = useWebTheme();
  const [theming, setTheming] = useState(false);
  const { colors: c, dark } = useOrbitTheme();
  if (!wide) return <>{children}</>;

  const { section, tab } = resolveWebRoute(pathname);
  const desktop = isDesktopPage(pathname, params);
  // Home greets you itself, and the calendar's toolbar is its header.
  const showHeader = !!section && section.id !== "home" && pathname !== "/calendar";
  const go = (path: string) => router.navigate(path as Parameters<typeof router.navigate>[0]);
  const hue = hueOf(section?.id);
  // (A menu's chosen item, and a hovered or open control.)
  const chosenBg = c.pill;
  const hoverBg = c.track;

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: GUTTER }}>
      {/* Rail */}
      <View style={{ width: WEB_RAIL_WIDTH, alignItems: "center", backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.border, paddingVertical: 12, zIndex: sizing || theming ? 40 : 1 }}>
        {/* The main orb — Orbit's — home */}
        <View style={{ marginTop: 2, marginBottom: 16 }}>
          <OrbSphere size={38} onPress={() => go("/")} label="Orbit home" colors={c} dark={dark} />
        </View>
        {WEB_SECTIONS.filter((s) => !s.footer).map((s) => (
          <RailButton key={s.id} section={s} on={section?.id === s.id} onPress={() => go(s.path)} />
        ))}
        <View style={{ flex: 1 }} />

        {/* Light or dark */}
        <View style={{ zIndex: 41 }}>
          <Pressable
            onPress={() => {
              setSizing(false);
              setTheming((v) => !v);
            }}
            accessibilityLabel="Appearance"
            style={({ hovered }: Hover) => ({
              width: 64,
              paddingVertical: 8,
              marginBottom: 4,
              alignItems: "center",
              borderRadius: 12,
              backgroundColor: theming ? chosenBg : hovered ? hoverBg : "transparent",
            })}
          >
            <Ionicons name={theme.dark ? "moon-outline" : "sunny-outline"} size={20} color={c.muted} />
            <Text style={{ marginTop: 3, fontSize: 11, fontWeight: "500", color: c.muted }}>{theme.choice === "system" ? "Auto" : theme.dark ? "Dark" : "Light"}</Text>
          </Pressable>
          {theming && (
            <View
              style={{
                position: "absolute",
                left: 70,
                bottom: 0,
                width: 210,
                padding: 12,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.surface,
                boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: c.text }}>Appearance</Text>
              <Text style={{ marginTop: 2, marginBottom: 8, fontSize: 12, lineHeight: 16, color: c.muted }}>Remembered in this browser.</Text>
              {THEME_CHOICES.map((option) => {
                const on = theme.choice === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setWebThemeChoice(option.value);
                      setTheming(false);
                    }}
                    style={({ hovered }: Hover) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      height: 34,
                      paddingHorizontal: 8,
                      borderRadius: 10,
                      backgroundColor: on ? chosenBg : hovered ? hoverBg : "transparent",
                    })}
                  >
                    <Ionicons name={option.icon} size={16} color={on ? c.text : c.muted} />
                    <Text style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: on ? "700" : "500", color: on ? c.text : c.icon }}>{option.label}</Text>
                    {on && <Ionicons name="checkmark" size={16} color={c.text} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* How big everything is drawn */}
        <View style={{ zIndex: 40 }}>
          <Pressable
            onPress={() => {
              setTheming(false);
              setSizing((v) => !v);
            }}
            accessibilityLabel="Display size"
            style={({ hovered }: Hover) => ({
              width: 64,
              paddingVertical: 8,
              marginBottom: 4,
              alignItems: "center",
              borderRadius: 12,
              backgroundColor: sizing ? chosenBg : hovered ? hoverBg : "transparent",
            })}
          >
            <Ionicons name="scan-outline" size={20} color={c.muted} />
            <Text style={{ marginTop: 3, fontSize: 11, fontWeight: "500", color: c.muted }}>{Math.round(scale * 100)}%</Text>
          </Pressable>
          {sizing && (
            <View
              style={{
                position: "absolute",
                left: 70,
                bottom: 0,
                width: 210,
                padding: 12,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.surface,
                boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: c.text }}>Display size</Text>
              <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 16, color: c.muted }}>Auto fits the layout to this window.</Text>
              <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <SizeButton
                  icon="remove"
                  label="Smaller"
                  onPress={() => setWebScaleChoice([...WEB_SCALE_STEPS].reverse().find((step) => step < scale - 0.001) ?? WEB_SCALE_STEPS[0])}
                />
                <Text style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: "700", color: c.text }}>{Math.round(scale * 100)}%</Text>
                <SizeButton
                  icon="add"
                  label="Bigger"
                  onPress={() => setWebScaleChoice(WEB_SCALE_STEPS.find((step) => step > scale + 0.001) ?? WEB_SCALE_STEPS[WEB_SCALE_STEPS.length - 1])}
                />
              </View>
              <Pressable
                onPress={() => setWebScaleChoice("auto")}
                style={({ hovered }: Hover) => ({
                  marginTop: 8,
                  height: 32,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  backgroundColor: choice === "auto" ? c.ink : hovered ? hoverBg : chosenBg,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: choice === "auto" ? c.onInk : c.onPill }}>
                  {choice === "auto" ? "Auto (on)" : "Back to auto"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
        {WEB_SECTIONS.filter((s) => s.footer && (s.id !== "developer" || isAdmin)).map((s) => (
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
              paddingHorizontal: 28,
              // (Part of the page: the canvas, a hairline under.)
              backgroundColor: c.canvas,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <View style={{ justifyContent: "center", marginRight: 28 }}>
              <Text style={{ fontSize: 19, fontWeight: "800", letterSpacing: -0.3, color: c.text }}>{section.label}</Text>
            </View>
            {section.tabs.filter((t) => !t.adminOnly || isAdmin).map((t) => {
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
                    borderBottomColor: on ? (hue?.strong ?? c.ink) : hovered ? c.orbit : "transparent",
                    // (Keeps the label centred against the 2px underline.)
                    paddingTop: 2,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: on ? "700" : "500", color: on ? (hue?.strong ?? c.text) : c.muted }}>{t.label}</Text>
                  {t.planned && (
                    <View style={{ marginLeft: 6, borderRadius: 999, backgroundColor: c.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: c.muted }}>PLANNED</Text>
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
              backgroundColor: c.canvas,
              borderLeftWidth: desktop ? 0 : 1,
              borderRightWidth: desktop ? 0 : 1,
              borderColor: c.border,
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

const THEME_CHOICES: { value: WebThemeChoice; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
  { value: "system", label: "Match the system", icon: "contrast-outline" },
];

function SizeButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ hovered }: Hover) => ({
        width: 36,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: hovered ? c.track : c.pill,
      })}
    >
      <Ionicons name={icon} size={17} color={c.onPill} />
    </Pressable>
  );
}

// A section on the rail: when it's the open one, a soft wash of its colour
// (neutral for those without one).
function RailButton({ section, on, onPress }: { section: WebSection; on: boolean; onPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  const hue = hueOf(section.id);
  const ink = on ? (hue?.strong ?? c.text) : c.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={section.label}
      style={({ hovered }: Hover) => ({
        width: 64,
        paddingVertical: 8,
        marginBottom: 4,
        alignItems: "center",
        borderRadius: 14,
        backgroundColor: on ? (hue?.tint ?? c.pill) : hovered ? c.track : "transparent",
      })}
    >
      <Ionicons name={on ? (section.icon.replace("-outline", "") as typeof section.icon) : section.icon} size={22} color={ink} />
      <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 11, fontWeight: on ? "700" : "500", color: ink }}>
        {section.label}
      </Text>
    </Pressable>
  );
}
