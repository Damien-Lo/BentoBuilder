import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { confirm, DESKTOP_PAGE, eyebrow, PageHeader, useGoBack, when } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { endOtherSessions, endSession } from "@/src/services/authApi";
import { forgetDevice, getThisDevice, renameThisDevice, thisKind, type ThisDevice } from "@/src/services/deviceApi";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Settings → Devices: this device, and the account's other phones and
// computers — each once, with whether it's signed in: signing one out
// forgets it too (signed in again, it registers afresh). Sign-ins not yet
// tied to a device (one not opened since, see server/routes/DeviceRoutes.js)
// are listed after, to sign out. They know each other by the account they're signed in to, so a
// computer can ask any of your phones to take a photo it needs — a receipt,
// a barcode, a nutrition label — with nothing to pair. On the phone, "Be my
// computer's camera" opens the screen that answers those requests.
// In Orbit's look, light or dark (`o`: its colours) — in a desktop browser
// beside the Settings list (settings/web/WebSettingsFrame), without the way
// back.
export default function DevicesSettingsScreen() {
  const router = useRouter();
  const back = useGoBack("/settings-section");
  const wide = useWideWeb();
  const { colors } = useOrbitTheme();
  const o = colors;
  const card = { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 };
  const heading = { ...eyebrow(o), marginLeft: 4 };
  const [me, setMe] = useState<ThisDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(() => {
    getThisDevice()
      .then((device) => {
        setMe(device);
        setName(device.name);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't reach the server."));
  }, []);
  useFocusEffect(load);

  // Another device: signed out (if it is) and taken off the list.
  function forget(id: string, label: string, signedIn: boolean) {
    const go = () => void forgetDevice(id).then(load, () => {});
    if (signedIn) confirm(`Sign out ${label}?`, "It'll need your password to sign in again, and it's taken off this list until it does.", "Sign out", go);
    else confirm(`Remove ${label}?`, "It's taken off this list. If it's used again, it comes back by itself.", "Remove", go);
  }
  const signOutElsewhere = (id: string, label: string) => confirm(`Sign out ${label}?`, "It'll need your password to sign in again.", "Sign out", () => void endSession(id).then(load, () => {}));
  const signedInOthers = (me?.others.filter((d) => d.signedIn).length ?? 0) + (me?.elsewhere?.length ?? 0);
  const signOutAll = () =>
    confirm("Sign out your other devices?", `${signedInOthers} other device${signedInOthers === 1 ? "" : "s"} will need your password to sign in again.`, "Sign out", () =>
      void endOtherSessions()
        .then(() => Promise.all((me?.others ?? []).filter((d) => d.signedIn).map((d) => forgetDevice(d._id).catch(() => {}))))
        .then(load, () => {}),
    );

  const phones = me?.others.filter((d) => d.kind === "phone") ?? [];
  const intro = "The phones and computers you use Orbit on. When a computer needs a photo — a receipt, a barcode, a nutrition label — it can ask your phone to take it.";
  return (
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={{ backgroundColor: o.canvas }}>
      <ScrollView contentContainerStyle={wide ? DESKTOP_PAGE : { padding: 20, paddingBottom: 60, maxWidth: 820, width: "100%", alignSelf: "center", paddingHorizontal: 16, paddingTop: 4 }}>
        <PageHeader title="Devices" subtitle={intro} onBack={wide ? undefined : back} />

        {error && <Text className="mt-4 text-sm text-red-600" style={{ color: o.danger }}>{error}</Text>}
        {!me && !error && <ActivityIndicator className="mt-8" color={o.muted} />}

        {me && (
          <>
            {/* This device */}
            <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-slate-400" style={heading}>This {thisKind}</Text>
            <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3" style={card}>
              <Ionicons name={thisKind === "computer" ? "desktop-outline" : "phone-portrait-outline"} size={20} color={o.icon} />
              <TextInput
                value={name}
                onChangeText={setName}
                onBlur={() => name.trim() && name.trim() !== me.name && void renameThisDevice(name.trim()).then(load, () => {})}
                className="ml-3 flex-1 text-base text-slate-900"
                style={[Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : undefined, { color: o.text }]}
                accessibilityLabel="This device's name"
              />
              <Text className="text-xs text-slate-400" style={{ color: o.faint }}>Name</Text>
            </View>

            {/* The others */}
            <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-slate-400" style={heading}>Your other devices</Text>
            <View className="rounded-2xl border border-slate-200 bg-white" style={{ ...card, overflow: "hidden" }}>
              {me.others.length === 0 && (
                <Text className="px-4 py-4 text-sm text-slate-400" style={{ color: o.muted }}>
                  None yet. Open Orbit on your {thisKind === "computer" ? "phone" : "computer"}, signed in to this account, and it shows up here.
                </Text>
              )}
              {me.others.map((device, i) => (
                <View key={device._id} className={`flex-row items-center px-4 py-3 ${i ? "border-t border-slate-100" : ""}`} style={i ? { borderTopColor: o.border } : undefined}>
                  <Ionicons name={device.kind === "computer" ? "desktop-outline" : "phone-portrait-outline"} size={18} color={o.icon} />
                  <View className="ml-3 flex-1">
                    <Text className="text-[15px] font-semibold text-slate-900" style={{ color: o.text }}>{device.name}</Text>
                    <Text className="text-xs text-slate-400" style={{ color: o.faint }}>
                      {device.signedIn ? <Text style={{ color: o.success, fontWeight: "600" }}>Signed in</Text> : null}
                      {device.signedIn ? " · last used " : "Last seen "}
                      {when(device.lastUsedAt ?? device.lastSeenAt ?? "")}
                    </Text>
                  </View>
                  <Tap onPress={() => forget(device._id, device.name, !!device.signedIn)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${device.signedIn ? "Sign out" : "Remove"} ${device.name}`} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: o.pill }} pressedStyle={{ opacity: 0.7 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: o.onPill }}>{device.signedIn ? "Sign out" : "Remove"}</Text>
                  </Tap>
                </View>
              ))}
            </View>

            {/* Sign-ins not yet tied to a device */}
            {!!me.elsewhere?.length && (
              <>
                <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-slate-400" style={heading}>Also signed in</Text>
                <View className="rounded-2xl border border-slate-200 bg-white" style={{ ...card, overflow: "hidden" }}>
                  {me.elsewhere.map((s, i) => (
                    <View key={s._id} className={`flex-row items-center px-4 py-3 ${i ? "border-t border-slate-100" : ""}`} style={i ? { borderTopColor: o.border } : undefined}>
                      <Ionicons name={/iPhone|Phone/.test(s.deviceName) ? "phone-portrait-outline" : "desktop-outline"} size={18} color={o.icon} />
                      <View className="ml-3 flex-1">
                        <Text className="text-[15px] font-semibold text-slate-900" style={{ color: o.text }}>{s.deviceName || "A device"}</Text>
                        <Text className="text-xs text-slate-400" style={{ color: o.faint }}>Signed in {when(s.createdAt)} · last used {when(s.lastUsedAt)}</Text>
                      </View>
                      <Tap onPress={() => signOutElsewhere(s._id, s.deviceName || "this device")} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Sign out ${s.deviceName || "this device"}`} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: o.pill }} pressedStyle={{ opacity: 0.7 }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: o.onPill }}>Sign out</Text>
                      </Tap>
                    </View>
                  ))}
                </View>
                <Text style={{ marginTop: 6, marginHorizontal: 4, fontSize: 12, lineHeight: 17, color: o.faint }}>Each moves into the list above the next time it opens Devices.</Text>
              </>
            )}

            {signedInOthers > 0 && (
              <Tap onPress={signOutAll} accessibilityRole="button" style={{ marginTop: 12, height: 46, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: o.pill }} pressedStyle={{ opacity: 0.75 }}>
                <Ionicons name="log-out-outline" size={17} color={o.onPill} />
                <Text style={{ fontSize: 15, fontWeight: "600", color: o.onPill }}>Sign out everywhere else</Text>
              </Tap>
            )}

            {/* Using the phone's camera */}
            {thisKind === "phone" ? (
              <Tap onPress={() => router.push("/desktop-camera")} accessibilityRole="button" style={{ marginTop: 24, height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: o.ink }} pressedStyle={{ opacity: 0.8 }}>
                <Ionicons name="camera-outline" size={18} color={o.onInk} />
                <Text style={{ fontSize: 16, fontWeight: "600", color: o.onInk }}>Be my computer&apos;s camera</Text>
              </Tap>
            ) : (
              <View className="mt-6 flex-row rounded-2xl border border-slate-200 bg-white p-4" style={card}>
                <Ionicons name="camera-outline" size={20} color={o.icon} />
                <Text className="ml-3 flex-1 text-sm leading-5 text-slate-600" style={{ color: o.muted }}>
                  {phones.length
                    ? "To take a photo with your phone, open Orbit on it and go to Settings → Devices → Be my computer's camera, then choose “My phone” where this computer asks for a photo."
                    : "To use your phone's camera from here, open Orbit on your phone, signed in to this account. Then, on the phone, go to Settings → Devices → Be my computer's camera."}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
    </OrbitPage>
  );
}
