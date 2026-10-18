import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PairPhoneCard } from "@/src/components/devices/PairPhoneCard";
import { PairScannerModal } from "@/src/components/devices/PairScannerModal";
import { getThisDevice, renameThisDevice, thisKind, unpairDevice, type ThisDevice } from "@/src/services/deviceApi";

// Settings → Devices: this device, and the ones it's paired with. A
// computer pairs with a phone once (the phone scans the computer's QR code)
// so that photos the computer needs — a receipt, a barcode, a nutrition
// label — can be taken on the phone. Later, with accounts, your signed-in
// devices will simply be listed here and pairing will go.
export default function DevicesSettingsScreen() {
  const router = useRouter();
  const [me, setMe] = useState<ThisDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState(false);

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

  function unpair(id: string, label: string) {
    const go = () => void unpairDevice(id).then(load, () => {});
    if (Platform.OS === "web") {
      if (window.confirm(`Unpair ${label}? You can pair it again any time.`)) go();
    } else {
      Alert.alert(`Unpair ${label}?`, "You can pair it again any time.", [{ text: "Cancel", style: "cancel" }, { text: "Unpair", style: "destructive", onPress: go }]);
    }
  }

  const other = thisKind === "computer" ? "phone" : "computer";
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, maxWidth: 820, width: "100%", alignSelf: "center" }}>
        <Text className="text-2xl font-bold text-slate-950">Devices</Text>
        <Text className="mt-1 text-sm text-slate-500">
          {thisKind === "computer"
            ? "Pair your phone once, and photos this computer needs (receipts, barcodes, nutrition labels) can be taken on it."
            : "Pair with your computer once, and it can ask this phone to take photos it needs (receipts, barcodes, nutrition labels)."}
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
                accessibilityLabel="This device's name"
              />
              <Text className="text-xs text-slate-400">Name</Text>
            </View>

            {/* Paired */}
            <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Paired {other}s</Text>
            <View className="rounded-2xl border border-slate-200 bg-white">
              {me.paired.length === 0 && <Text className="px-4 py-4 text-sm text-slate-400">None yet.</Text>}
              {me.paired.map((device, i) => (
                <View key={device._id} className={`flex-row items-center px-4 py-3 ${i ? "border-t border-slate-100" : ""}`}>
                  <Ionicons name={device.kind === "computer" ? "desktop-outline" : "phone-portrait-outline"} size={18} color="#2563EB" />
                  <View className="ml-3 flex-1">
                    <Text className="text-[15px] font-semibold text-slate-900">{device.name}</Text>
                    {!!device.lastSeenAt && <Text className="text-xs text-slate-400">Last seen {new Date(device.lastSeenAt).toLocaleString()}</Text>}
                  </View>
                  <Pressable onPress={() => unpair(device._id, device.name)} hitSlop={8} className="rounded-lg bg-slate-100 px-3 py-1.5 active:bg-slate-200">
                    <Text className="text-xs font-semibold text-slate-600">Unpair</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            {/* Pairing */}
            {thisKind === "computer" ? (
              <View className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                {pairing ? (
                  <PairPhoneCard onPaired={load} />
                ) : (
                  <Pressable onPress={() => setPairing(true)} className="flex-row items-center self-start rounded-xl bg-blue-600 px-4 py-3 active:bg-blue-700">
                    <Ionicons name="qr-code-outline" size={18} color="white" />
                    <Text className="ml-2 font-semibold text-white">{me.paired.length ? "Pair another phone" : "Pair a phone"}</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View className="mt-6 gap-3">
                <Pressable onPress={() => setPairing(true)} className="flex-row items-center justify-center rounded-2xl bg-blue-600 py-4 active:bg-blue-700">
                  <Ionicons name="qr-code-outline" size={18} color="white" />
                  <Text className="ml-2 font-semibold text-white">Pair with a computer</Text>
                </Pressable>
                {me.paired.length > 0 && (
                  <Pressable onPress={() => router.push("/desktop-camera")} className="flex-row items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 py-4 active:bg-blue-100">
                    <Ionicons name="camera-outline" size={18} color="#2563EB" />
                    <Text className="ml-2 font-semibold text-blue-700">Be my computer&apos;s camera</Text>
                  </Pressable>
                )}
                <PairScannerModal
                  visible={pairing}
                  onClose={() => setPairing(false)}
                  onPaired={(computer) => {
                    load();
                    Alert.alert("Paired", `${computer.name} can now ask this phone for photos. Open "Be my computer's camera" when you're reviewing on it.`);
                  }}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
