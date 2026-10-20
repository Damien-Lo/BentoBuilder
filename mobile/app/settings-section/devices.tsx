import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { forgetDevice, getThisDevice, renameThisDevice, thisKind, type ThisDevice } from "@/src/services/deviceApi";

// Settings → Devices: this device, and the account's other phones and
// computers. They know each other by the account they're signed in to, so a
// computer can ask any of your phones to take a photo it needs — a receipt,
// a barcode, a nutrition label — with nothing to pair. On the phone, "Be my
// computer's camera" opens the screen that answers those requests.
export default function DevicesSettingsScreen() {
  const router = useRouter();
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

  function forget(id: string, label: string) {
    const go = () => void forgetDevice(id).then(load, () => {});
    const message = "It's taken off this list. If it's used again, it comes back by itself.";
    if (Platform.OS === "web") {
      if (window.confirm(`Remove ${label}?\n\n${message}`)) go();
    } else {
      Alert.alert(`Remove ${label}?`, message, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: go }]);
    }
  }

  const phones = me?.others.filter((d) => d.kind === "phone") ?? [];
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, maxWidth: 820, width: "100%", alignSelf: "center" }}>
        <Text className="text-2xl font-bold text-slate-950">Devices</Text>
        <Text className="mt-1 text-sm text-slate-500">
          The phones and computers you use BentoBuilder on. When a computer needs a photo — a receipt, a barcode, a nutrition label — it can ask your phone to take it.
        </Text>

        {error && <Text className="mt-4 text-sm text-red-600">{error}</Text>}
        {!me && !error && <ActivityIndicator className="mt-8" color="#2563EB" />}

        {me && (
          <>
            {/* This device */}
            <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">This {thisKind}</Text>
            <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Ionicons name={thisKind === "computer" ? "desktop-outline" : "phone-portrait-outline"} size={20} color="#475569" />
              <TextInput
                value={name}
                onChangeText={setName}
                onBlur={() => name.trim() && name.trim() !== me.name && void renameThisDevice(name.trim()).then(load, () => {})}
                className="ml-3 flex-1 text-base text-slate-900"
                style={Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : undefined}
                accessibilityLabel="This device's name"
              />
              <Text className="text-xs text-slate-400">Name</Text>
            </View>

            {/* The others */}
            <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Your other devices</Text>
            <View className="rounded-2xl border border-slate-200 bg-white">
              {me.others.length === 0 && (
                <Text className="px-4 py-4 text-sm text-slate-400">
                  None yet. Open BentoBuilder on your {thisKind === "computer" ? "phone" : "computer"}, signed in to this account, and it shows up here.
                </Text>
              )}
              {me.others.map((device, i) => (
                <View key={device._id} className={`flex-row items-center px-4 py-3 ${i ? "border-t border-slate-100" : ""}`}>
                  <Ionicons name={device.kind === "computer" ? "desktop-outline" : "phone-portrait-outline"} size={18} color="#2563EB" />
                  <View className="ml-3 flex-1">
                    <Text className="text-[15px] font-semibold text-slate-900">{device.name}</Text>
                    {!!device.lastSeenAt && <Text className="text-xs text-slate-400">Last seen {new Date(device.lastSeenAt).toLocaleString()}</Text>}
                  </View>
                  <Pressable onPress={() => forget(device._id, device.name)} hitSlop={8} className="rounded-lg bg-slate-100 px-3 py-1.5 active:bg-slate-200">
                    <Text className="text-xs font-semibold text-slate-600">Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            {/* Using the phone's camera */}
            {thisKind === "phone" ? (
              <Pressable onPress={() => router.push("/desktop-camera")} className="mt-6 flex-row items-center justify-center rounded-2xl bg-blue-600 py-4 active:bg-blue-700">
                <Ionicons name="camera-outline" size={18} color="white" />
                <Text className="ml-2 font-semibold text-white">Be my computer&apos;s camera</Text>
              </Pressable>
            ) : (
              <View className="mt-6 flex-row rounded-2xl border border-slate-200 bg-white p-4">
                <Ionicons name="camera-outline" size={20} color="#2563EB" />
                <Text className="ml-3 flex-1 text-sm leading-5 text-slate-600">
                  {phones.length
                    ? "To take a photo with your phone, open BentoBuilder on it and go to Settings → Devices → Be my computer's camera, then choose “My phone” where this computer asks for a photo."
                    : "To use your phone's camera from here, open BentoBuilder on your phone, signed in to this account. Then, on the phone, go to Settings → Devices → Be my computer's camera."}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
