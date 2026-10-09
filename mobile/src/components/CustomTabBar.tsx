import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWideWeb } from "@/src/utils/useWideWeb";

// ── Constants ─────────────────────────────────────────────────────────────────

const TAB_H    = 56;   // tab row height
// The bar's height above the safe-area inset — for floating buttons that
// sit above it.
export const HOME_BAR_HEIGHT = TAB_H;
const FAB_D    = 48;   // FAB diameter
const SUB_D    = 40;   // sub-option button diameter
const RADIUS   = 92;   // arc radius from FAB centre
const TINT     = "#2563EB";
const INACTIVE = "#94A3B8";

// 5 options in a 120° arc centred on straight-up (0° = up, ±60° = sides)
const ANGLES = [-60, -30, 0, 30, 60] as const;

// Default radial quick-action menu — universal across every tab bar in the
// app (Kitchen, Settings, and any future section), not tied to Kitchen.
const DEFAULT_SUB_OPTIONS = [
  { id: "scan",     label: "Scan",     icon: "scan-outline"         as const },
  { id: "timer",    label: "Timer",    icon: "timer-outline"        as const },
  { id: "notes",    label: "Notes",    icon: "create-outline"       as const },
  { id: "shopping", label: "Shopping", icon: "cart-outline"         as const },
  { id: "share",    label: "Share",    icon: "share-social-outline" as const },
];

interface SubOption {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface CustomTabBarProps extends BottomTabBarProps {
  // Radial quick-action menu shown when the centre FAB is tapped. Defaults
  // to the same universal menu on every screen; pass an empty array to make
  // the FAB a plain single-tap "go home" button instead.
  subOptions?: SubOption[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CustomTabBar({
  state,
  descriptors,
  navigation,
  subOptions = DEFAULT_SUB_OPTIONS,
}: CustomTabBarProps) {
  // The desktop layout's sidebar does this job.
  const wideWeb = useWideWeb();
  const visible     = state.routes;
  const leftRoutes  = visible.slice(0, 2);
  const rightRoutes = visible.slice(2);
  if (wideWeb) return null;

  return (
    <TabBarFrame
      subOptions={subOptions}
      renderTabs={(closeMenuIfOpen) => {
        function renderTab(route: (typeof state.routes)[0]) {
          const focused = state.index === state.routes.indexOf(route);
          const desc    = descriptors[route.key];
          const color   = focused ? TINT : INACTIVE;

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                closeMenuIfOpen();
                const evt = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !evt.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 6 }}
            >
              {desc.options.tabBarIcon?.({ focused, color, size: 24 })}
              <Text
                style={{
                  fontSize: 10,
                  color,
                  marginTop: 3,
                  fontWeight: focused ? "600" : "400",
                }}
              >
                {desc.options.title ?? route.name}
              </Text>
            </Pressable>
          );
        }
        return { left: leftRoutes.map(renderTab), right: rightRoutes.map(renderTab) };
      }}
    />
  );
}

// Just the centre home button (and its menu), floating over the screen in
// the same spot as on the tabbed sections — for a section without tabs,
// e.g. the Calendar.
export function FloatingHomeButton({ subOptions = DEFAULT_SUB_OPTIONS }: { subOptions?: SubOption[] }) {
  const wideWeb = useWideWeb();
  if (wideWeb) return null;
  return <TabBarFrame floating subOptions={subOptions} renderTabs={() => ({ left: null, right: null })} />;
}

// The bar itself: white strip, tabs either side of the centre button, and
// the button's radial quick-action menu.
function TabBarFrame({
  subOptions,
  renderTabs,
  floating = false,
}: {
  subOptions: SubOption[];
  // No white bar: just the button, over whatever's underneath.
  floating?: boolean;
  renderTabs: (closeMenuIfOpen: () => void) => { left: ReactNode; right: ReactNode };
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: sw, height: sh } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const hasSubOptions = subOptions.length > 0;

  // FAB is vertically centred within the tab row.
  // These are its screen-absolute centre coordinates, used to place the
  // sub-options inside the Modal at exactly the same spot.
  const fabCX = sw / 2;
  const fabCY = sh - insets.bottom - TAB_H / 2;

  function openMenu() {
    setIsOpen(true);
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 65,
    }).start();
  }

  function closeMenu(after?: () => void) {
    Animated.timing(anim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setIsOpen(false);
      after?.();
    });
  }

  function handleFab() {
    if (!hasSubOptions) { router.push("/"); return; }
    if (isOpen) closeMenu(() => router.push("/"));
    else openMenu();
  }

  function handleSubOption(opt: SubOption) {
    closeMenu(() =>
      router.push({ pathname: "/coming-soon", params: { feature: opt.label, icon: opt.icon } }),
    );
  }

  const tabs = renderTabs(() => {
    if (isOpen) closeMenu();
  });

  const fabIcon = isOpen ? "home-outline" : "grid-outline";

  const fabStyle = {
    width: FAB_D,
    height: FAB_D,
    borderRadius: FAB_D / 2,
    backgroundColor: TINT,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: TINT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  };

  return (
    <>
      {/* ── Backdrop + sub-options (Modal = full-screen touch capture) ───── */}
      {hasSubOptions && (
      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={() => closeMenu()}
      >
        {/* Dimmed backdrop — tap anywhere to close */}
        <Animated.View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.28)",
            opacity: anim,
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => closeMenu()} />
        </Animated.View>

        {/* Sub-option buttons, anchored at FAB centre */}
        {subOptions.map((opt, i) => {
          const rad  = (ANGLES[i] * Math.PI) / 180;
          const endX = Math.sin(rad) * RADIUS;
          const endY = Math.cos(rad) * RADIUS; // positive = up on screen

          return (
            <Animated.View
              key={opt.id}
              style={{
                position: "absolute",
                left: fabCX - SUB_D / 2,
                top: fabCY - SUB_D / 2,
                width: SUB_D,
                alignItems: "center",
                opacity: anim,
                transform: [
                  {
                    translateX: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, endX],
                    }),
                  },
                  {
                    translateY: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -endY],
                    }),
                  },
                  {
                    scale: anim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.3, 1.05, 1],
                    }),
                  },
                ],
              }}
            >
              <Pressable
                onPress={() => handleSubOption(opt)}
                style={{
                  width: SUB_D,
                  height: SUB_D,
                  borderRadius: SUB_D / 2,
                  backgroundColor: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 5,
                  elevation: 5,
                }}
              >
                <Ionicons name={opt.icon} size={18} color="#1E293B" />
              </Pressable>
              <Text
                style={{
                  fontSize: 9,
                  color: "#fff",
                  marginTop: 4,
                  textAlign: "center",
                  fontWeight: "600",
                }}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </Animated.View>
          );
        })}

        {/* FAB inside Modal — same position as real FAB; tap → close + go home */}
        <Pressable
          onPress={() => closeMenu(() => router.push("/"))}
          style={[fabStyle, {
            position: "absolute",
            left: fabCX - FAB_D / 2,
            top: fabCY - FAB_D / 2,
          }]}
        >
          <Ionicons name={fabIcon} size={21} color="white" />
        </Pressable>
      </Modal>
      )}

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <View
        pointerEvents="box-none"
        style={
          floating
            ? { position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom }
            : {
                backgroundColor: "#fff",
                borderTopWidth: 1,
                borderTopColor: "#F1F5F9",
                paddingBottom: insets.bottom,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.06,
                shadowRadius: 6,
                elevation: 8,
              }
        }
      >
        {/* Tab row */}
        <View pointerEvents="box-none" style={{ flexDirection: "row", height: TAB_H }}>
          <View style={{ flex: 2, flexDirection: "row" }}>{tabs.left}</View>
          {/* Gap for FAB */}
          <View style={{ width: FAB_D + 20 }} />
          <View style={{ flex: 2, flexDirection: "row" }}>{tabs.right}</View>
        </View>

        {/* Real FAB — vertically centred in tab row */}
        <Pressable
          onPress={handleFab}
          style={[fabStyle, {
            position: "absolute",
            left: "50%",
            marginLeft: -(FAB_D / 2),
            top: (TAB_H - FAB_D) / 2,   // centres within 56px row → 4px top margin
          }]}
        >
          <Ionicons name={fabIcon} size={21} color="white" />
        </Pressable>
      </View>
    </>
  );
}
