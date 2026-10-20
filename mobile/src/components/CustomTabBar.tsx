import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OrbSphere } from "@/src/components/ui/OrbSphere";
import { QuickActions } from "@/src/components/ui/QuickActions";
import { useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// ── Constants ─────────────────────────────────────────────────────────────────

const TAB_H    = 56;   // tab row height
// The bar's height above the safe-area inset — for floating buttons that
// sit above it.
export const HOME_BAR_HEIGHT = TAB_H;
const ORB_D    = 48;   // the orb's diameter

// A section's tabs at the bottom of the phone screen — at most four, two
// either side of the orb, Orbit's mascot: tap it to go home, hold it for
// the quick actions (the same as the home screen's orb). In Orbit's look,
// light and dark: the open tab in ink with its icon filled in, the others
// quiet; blue is the orb's alone.

// ── Component ─────────────────────────────────────────────────────────────────

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  // The desktop layout's sidebar does this job.
  const wideWeb = useWideWeb();
  const { colors } = useOrbitTheme();
  // (A screen given `href: null` is in the group but not on the bar —
  // expo-router passes that on as a hidden item style.)
  const visible     = state.routes.filter((route) => StyleSheet.flatten(descriptors[route.key].options.tabBarItemStyle)?.display !== "none");
  const leftRoutes  = visible.slice(0, 2);
  const rightRoutes = visible.slice(2);
  if (wideWeb) return null;

  function renderTab(route: (typeof state.routes)[0]) {
    const focused = state.index === state.routes.indexOf(route);
    const desc    = descriptors[route.key];
    const color   = focused ? colors.text : colors.faint;
    // (The open tab's icon filled in: the "-outline" icon's solid twin.)
    const icon = desc.options.tabBarIcon?.({ focused, color, size: 24 });
    const shown = isValidElement(icon) && typeof (icon.props as { name?: unknown }).name === "string"
      ? cloneElement(icon as ReactElement<{ name: string; size: number }>, { name: focused ? (icon.props as { name: string }).name.replace(/-outline$/, "") : (icon.props as { name: string }).name, size: 23 })
      : icon;

    return (
      <Pressable
        key={route.key}
        onPress={() => {
          const evt = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !evt.defaultPrevented) navigation.navigate(route.name);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 4 }}
      >
        {shown}
        <Text
          style={{
            fontSize: 10.5,
            color,
            marginTop: 3,
            fontWeight: focused ? "700" : "500",
          }}
        >
          {desc.options.title ?? route.name}
        </Text>
      </Pressable>
    );
  }

  return <TabBarFrame left={leftRoutes.map(renderTab)} right={rightRoutes.map(renderTab)} />;
}

// Just the orb, floating over the screen in the same spot as on the tabbed
// sections — for a section without tabs, e.g. the Calendar.
export function FloatingHomeButton() {
  const wideWeb = useWideWeb();
  if (wideWeb) return null;
  return <TabBarFrame floating left={null} right={null} />;
}

// The bar itself: the card colour, a hairline above, tabs either side of
// the orb.
function TabBarFrame({
  left,
  right,
  floating = false,
}: {
  left: ReactNode;
  right: ReactNode;
  // No white bar: just the orb, over whatever's underneath.
  floating?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, dark } = useOrbitTheme();
  const [asking, setAsking] = useState(false);

  return (
    <>
      <View
        pointerEvents="box-none"
        style={
          floating
            ? { position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom }
            : {
                backgroundColor: colors.surface,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
                paddingBottom: insets.bottom,
              }
        }
      >
        {/* Tab row */}
        <View pointerEvents="box-none" style={{ flexDirection: "row", height: TAB_H }}>
          <View style={{ flex: 2, flexDirection: "row" }}>{left}</View>
          {/* Room for the orb */}
          <View pointerEvents="none" style={{ width: ORB_D + 20 }} />
          <View style={{ flex: 2, flexDirection: "row" }}>{right}</View>
        </View>

        {/* The orb, centred in the tab row */}
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: (TAB_H - ORB_D) / 2, alignItems: "center" }}>
          <OrbSphere size={ORB_D} onPress={() => router.navigate("/")} onLongPress={() => setAsking(true)} label="Home (hold for quick actions)" colors={colors} dark={dark} />
        </View>
      </View>
      <QuickActions visible={asking} onClose={() => setAsking(false)} />
    </>
  );
}
