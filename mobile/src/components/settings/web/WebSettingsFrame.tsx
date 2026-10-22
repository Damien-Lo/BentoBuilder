import { usePathname, useRouter, type Href } from "expo-router";
import { type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAccount } from "@/src/components/auth/AuthGate";
import { ACCOUNT_PATH, entryTile, IconTile, initialsOf, SETTINGS_GROUPS, type SettingsEntry } from "@/src/components/settings/AccountParts";
import { useOrbitTheme } from "@/src/theme/orbit";

// Settings in a desktop browser: the phone's list (app/settings-section/
// index — the same groups, rows and order) down the left, and the open page
// beside it. Each row is its page's route, so a link or a reload lands on
// the same page with its row chosen. In Orbit's look, in the hub's plain
// colours (Settings isn't a section): the chosen row in ink.
//
// Used by app/settings-section/_layout (every page in it) and by
// app/manage-lists, Kitchen's page of lists, which counts as Kitchen.

const LIST_WIDTH = 300;

// Pages outside settings-section that belong to one of its rows.
const BELONGS_TO: Record<string, string> = { "/manage-lists": "/settings-section/kitchen" };

type Hover = { hovered?: boolean };

export function WebSettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { colors: c, dark } = useOrbitTheme();
  const { account } = useAccount();
  const current = BELONGS_TO[pathname] ?? pathname;
  const open = (path: string) => path !== pathname && router.navigate(path as Href);

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.canvas }}>
      <ScrollView
        style={{ width: LIST_WIDTH, flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderRightColor: c.border }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* You, at the top */}
        <AccountRow
          name={account?.name || "Your account"}
          email={account?.email ?? "Name, email, password, sign out"}
          initials={initialsOf(account)}
          on={current === ACCOUNT_PATH}
          onPress={() => open(ACCOUNT_PATH)}
        />

        {/* The parts of the app, then those still to come */}
        {SETTINGS_GROUPS.map((group, g) => (
          <View key={g} style={{ backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 6, gap: 2 }}>
            {group.map((entry) => (
              <EntryRow key={entry.path} entry={entry} tile={entryTile(entry, dark)} on={current === entry.path} onPress={() => open(entry.path)} />
            ))}
          </View>
        ))}
      </ScrollView>

      {/* The open page */}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

function AccountRow({ name, email, initials, on, onPress }: { name: string; email: string; initials: string; on: boolean; onPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Account, ${name}`}
      accessibilityState={{ selected: on }}
      style={({ hovered }: Hover) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: on ? c.ink : c.border,
        backgroundColor: on ? c.ink : hovered ? c.pill : c.surface,
      })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.pill, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: c.onPill }}>{initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: on ? c.onInk : c.text }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ marginTop: 1, fontSize: 12.5, color: on ? c.onInk : c.muted, opacity: on ? 0.75 : 1 }} numberOfLines={1}>
          {email}
        </Text>
      </View>
    </Pressable>
  );
}

// One row: its tile and label, "Coming" for a page not built yet.
function EntryRow({ entry, tile, on, onPress }: { entry: SettingsEntry; tile: string; on: boolean; onPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  const label = on ? c.onInk : entry.soon ? c.faint : c.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={entry.soon ? `${entry.label}, coming` : entry.label}
      accessibilityState={{ selected: on }}
      style={({ hovered }: Hover) => ({
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 12,
        backgroundColor: on ? c.ink : hovered ? c.track : "transparent",
      })}
    >
      <View style={entry.soon && !on ? { opacity: 0.45 } : undefined}>
        <IconTile icon={entry.icon} color={tile} size={28} />
      </View>
      <Text style={{ flex: 1, fontSize: 14.5, fontWeight: on ? "700" : "500", color: label }} numberOfLines={1}>
        {entry.label}
      </Text>
      {entry.soon && <Text style={{ fontSize: 12.5, color: on ? c.onInk : c.faint, opacity: on ? 0.75 : 1 }}>Coming</Text>}
    </Pressable>
  );
}
