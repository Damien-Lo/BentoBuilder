import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps, type ReactNode } from "react";
import { requireOptionalNativeModule } from "expo";
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from "react-native";

// The pieces Settings → Account and Settings → People are made of.

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

export function Heading({ children }: { children: ReactNode }) {
  return <Text className="mb-2 mt-7 text-xs font-bold uppercase tracking-wide text-slate-400">{children}</Text>;
}
export function Card({ children }: { children: ReactNode }) {
  return <View className="rounded-2xl border border-slate-200 bg-white">{children}</View>;
}
export function Input(props: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor="#94A3B8"
      autoCapitalize="none"
      autoCorrect={false}
      className="mt-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900"
      style={Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : undefined}
      {...props}
    />
  );
}
export function Button({ label, onPress, busy, tone = "blue", icon }: { label: string; onPress: () => void; busy?: boolean; tone?: "blue" | "plain" | "red"; icon?: keyof typeof Ionicons.glyphMap }) {
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
  return (
    <Pressable onPress={onPress} hitSlop={6} className={`rounded-lg px-3 py-1.5 ${danger ? "bg-red-50 active:bg-red-100" : "bg-slate-100 active:bg-slate-200"}`}>
      <Text className={`text-xs font-semibold ${danger ? "text-red-600" : "text-slate-600"}`}>{label}</Text>
    </Pressable>
  );
}
