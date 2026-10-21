import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { type ComponentProps, type ReactNode } from "react";
import { requireOptionalNativeModule } from "expo";
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";

import { Tap } from "@/src/components/ui/Tap";
import { useOrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// The pieces Settings is made of (and Developer → People). On an Orbit page
// (OrbitPage) the cards, headings, fields and buttons take its colours;
// anywhere else they keep the older look.

export function confirm(title: string, message: string, action: string, go: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) go();
  } else {
    Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: action, style: "destructive", onPress: go }]);
  }
}

export async function copy(text: string) {
  try {
    if (Platform.OS === "web") await navigator.clipboard.writeText(text);
    else if (requireOptionalNativeModule("ExpoClipboard")) await (await import("expo-clipboard")).setStringAsync(text);
    else return false;
    return true;
  } catch {
    return false;
  }
}

export const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

// The soft red behind a destructive button, in either theme.
export const dangerSoft = (dark: boolean) => (dark ? "rgba(248,113,113,0.14)" : "#FEF2F2");

// The small heading over a card (an eyebrow, on an Orbit page).
export const eyebrow = (o: OrbitColors) => ({ fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.2, color: o.faint, textTransform: "uppercase" as const });

export function Heading({ children }: { children: ReactNode }) {
  const o = useOrbitPage();
  return (
    <Text className="mb-2 mt-7 text-xs font-bold uppercase tracking-wide text-slate-400" style={o && { ...eyebrow(o), marginLeft: 4 }}>
      {children}
    </Text>
  );
}
export function Card({ children }: { children: ReactNode }) {
  const o = useOrbitPage();
  return (
    <View className="rounded-2xl border border-slate-200 bg-white" style={o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18, overflow: "hidden" }}>
      {children}
    </View>
  );
}
export function Input(props: ComponentProps<typeof TextInput>) {
  const o = useOrbitPage();
  return (
    <TextInput
      placeholderTextColor={o?.faint ?? "#94A3B8"}
      autoCapitalize="none"
      autoCorrect={false}
      className="mt-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900"
      style={[Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : undefined, o && { backgroundColor: o.canvas, borderColor: o.border, color: o.text, borderRadius: 14, paddingVertical: 12 }]}
      {...props}
    />
  );
}

// (`fill`: on an Orbit page, grows to fill the row — or, in a column, its width.)
export function Button({ label, onPress, busy, tone = "blue", icon, fill }: { label: string; onPress: () => void; busy?: boolean; tone?: "blue" | "plain" | "red"; icon?: keyof typeof Ionicons.glyphMap; fill?: boolean }) {
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  if (o) {
    // Orbit's: the main one in ink, the others in a pill, a destructive one red on a soft red.
    const bg = tone === "blue" ? o.ink : tone === "red" ? dangerSoft(dark) : o.pill;
    const fg = tone === "blue" ? o.onInk : tone === "red" ? o.danger : o.onPill;
    return (
      <Tap
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[{ height: 52, borderRadius: 16, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: bg }, fill ? { flexGrow: 1, flexShrink: 1 } : { alignSelf: "flex-start" }]}
        pressedStyle={{ opacity: 0.75 }}
      >
        {busy ? <ActivityIndicator size="small" color={fg} style={{ marginRight: 8 }} /> : icon && <Ionicons name={icon} size={17} color={fg} style={{ marginRight: 8 }} />}
        <Text style={{ fontSize: 15, fontWeight: "600", color: fg }}>{label}</Text>
      </Tap>
    );
  }
  const look = tone === "blue" ? "bg-blue-600 active:bg-blue-700" : tone === "red" ? "bg-red-50 active:bg-red-100" : "bg-slate-100 active:bg-slate-200";
  const text = tone === "blue" ? "text-white" : tone === "red" ? "text-red-600" : "text-slate-700";
  return (
    <Pressable onPress={onPress} disabled={busy} className={`flex-row items-center self-start rounded-xl px-4 py-2.5 ${look}`}>
      {busy ? (
        <ActivityIndicator size="small" color={tone === "blue" ? "white" : "#64748B"} style={{ marginRight: 6 }} />
      ) : (
        icon && <Ionicons name={icon} size={16} color={tone === "blue" ? "white" : tone === "red" ? "#DC2626" : "#334155"} style={{ marginRight: 6 }} />
      )}
      <Text className={`text-sm font-semibold ${text}`}>{label}</Text>
    </Pressable>
  );
}

export function SmallButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  if (o) {
    return (
      <Tap onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: danger ? dangerSoft(dark) : o.pill }} pressedStyle={{ opacity: 0.7 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: danger ? o.danger : o.onPill }}>{label}</Text>
      </Tap>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={6} className={`rounded-lg px-3 py-1.5 ${danger ? "bg-red-50 active:bg-red-100" : "bg-slate-100 active:bg-slate-200"}`}>
      <Text className={`text-xs font-semibold ${danger ? "text-red-600" : "text-slate-600"}`}>{label}</Text>
    </Pressable>
  );
}

// ── The phone's Settings pages, in Orbit's look ──

// Back to where this page was opened from, or to `fallback` if it was
// opened directly (a link, a reload).
export function useGoBack(fallback: string) {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace(fallback as Href));
}

// A page's header: the round way back, and a large title on the page itself.
export function PageHeader({ title, subtitle, onBack, style }: { title: string; subtitle?: ReactNode; onBack: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={style}>
      <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
        <Tap onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Tap>
      </View>
      <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{title}</Text>
      {!!subtitle && <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 20, color: c.muted }}>{subtitle}</Text>}
    </View>
  );
}

// What each appearance is called.
export const APPEARANCE_LABEL = { system: "Automatic", light: "Light", dark: "Dark" } as const;

// The grey of a tile for something that isn't a section (Account, Devices,
// Appearance), in either theme.
export const neutralTile = (dark: boolean) => (dark ? "#475569" : "#64748B");

// A rounded square with a white icon on a colour, iOS-style.
export function IconTile({ icon, color, size = 30 }: { icon: keyof typeof Ionicons.glyphMap; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={size * 0.58} color="#FFFFFF" />
    </View>
  );
}

// A card of rows, the rows split by hairlines inset past their icons.
export function ListCard({ children }: { children: ReactNode }) {
  const { colors: c } = useOrbitTheme();
  return <View style={{ backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>{children}</View>;
}
export function Hairline({ inset = 58 }: { inset?: number }) {
  const { colors: c } = useOrbitTheme();
  return <View style={{ height: 1, marginLeft: inset, backgroundColor: c.border }} />;
}

// One row: its tile, the label, a value on the right (muted), and a chevron
// — or a tick, for a choice (`checked`). `soon`: not built yet, faint.
export function ListRow({ label, tile, value, onPress, soon, checked }: { label: string; tile?: ReactNode; value?: string; onPress: () => void; soon?: boolean; checked?: boolean }) {
  const { colors: c } = useOrbitTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label} accessibilityState={checked === undefined ? undefined : { selected: checked }} style={{ minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 14 }} pressedStyle={{ backgroundColor: c.pill }}>
      {tile && <View style={soon && { opacity: 0.45 }}>{tile}</View>}
      <Text style={{ flex: 1, fontSize: 16, fontWeight: "500", color: soon ? c.faint : c.text }} numberOfLines={1}>
        {label}
      </Text>
      {!!value && <Text style={{ fontSize: 15, color: soon ? c.faint : c.muted }}>{value}</Text>}
      {checked === undefined ? <Ionicons name="chevron-forward" size={18} color={c.faint} /> : checked && <Ionicons name="checkmark" size={20} color={c.ink} />}
    </Tap>
  );
}

// A page not built yet: what it'll be, in a card.
export function ComingSoon({ icon, color, title, detail }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; detail: string }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ marginTop: 20, alignItems: "center", backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, paddingHorizontal: 24, paddingVertical: 36 }}>
      <IconTile icon={icon} color={color} size={48} />
      <Text style={{ marginTop: 14, fontSize: 17, fontWeight: "700", color: c.text }}>{title}</Text>
      <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, textAlign: "center", color: c.muted }}>{detail}</Text>
    </View>
  );
}
