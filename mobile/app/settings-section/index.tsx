import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter, type Href } from "expo-router";
import { Fragment } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAccount } from "@/src/components/auth/AuthGate";
import { ACCOUNT_PATH, APPEARANCE_LABEL, entryTile, Hairline, IconTile, initialsOf, ListCard, ListRow, neutralTile, PageHeader, SETTINGS_GROUPS, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Settings on the phone: one list, like the iPhone's — your account at the
// top, then each part of the app, every row opening its own page. In
// Orbit's look, light or dark, in the plain accent (Settings isn't a
// section). A desktop browser has this list beside each page instead
// (settings/web/WebSettingsFrame), so it goes straight to the first.
export default function SettingsIndex() {
  const wide = useWideWeb();
  if (wide) return <Redirect href="/settings-section/kitchen" />;
  return <SettingsList />;
}

function SettingsList() {
  const router = useRouter();
  const leave = useGoBack("/");
  const { colors: c, dark, appearance } = useOrbitTheme();
  const { account } = useAccount();
  const open = (path: string) => router.push(path as Href);
  const initials = initialsOf(account);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 20 }} showsVerticalScrollIndicator={false}>
        <PageHeader title="Settings" onBack={leave} />

        {/* You, at the top */}
        <Tap
          onPress={() => open(ACCOUNT_PATH)}
          accessibilityRole="button"
          accessibilityLabel={`Account, ${account?.name ?? ""}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border }}
          pressedStyle={{ backgroundColor: c.pill }}
        >
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.pill, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: c.onPill }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: c.text }} numberOfLines={1}>
              {account?.name || "Your account"}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 13.5, color: c.muted }} numberOfLines={1}>
              {account?.email ?? "Name, email, password, sign out"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.faint} />
        </Tap>

        {/* How it looks (on the phone; a browser has its own switch) */}
        {Platform.OS !== "web" && (
          <ListCard>
            <ListRow label="Appearance" tile={<IconTile icon="contrast" color={neutralTile(dark)} />} value={APPEARANCE_LABEL[appearance]} onPress={() => open("/settings-section/appearance")} />
          </ListCard>
        )}

        {/* The parts of the app, then those still to come */}
        {SETTINGS_GROUPS.map((group, g) => (
          <ListCard key={g}>
            {group.map((entry, i) => (
              <Fragment key={entry.path}>
                {i > 0 && <Hairline />}
                <ListRow label={entry.label} soon={entry.soon} value={entry.soon ? "Coming" : undefined} tile={<IconTile icon={entry.icon} color={entryTile(entry, dark)} />} onPress={() => open(entry.path)} />
              </Fragment>
            ))}
          </ListCard>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
