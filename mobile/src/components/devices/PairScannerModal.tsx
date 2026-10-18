import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { codeFromScan, pairWithCode, type DeviceInfo } from "@/src/services/deviceApi";

// On a phone: the camera, to scan the pairing QR code a computer shows
// (Settings → Devices there). Pairs on the first code it reads.
export function PairScannerModal({ visible, onClose, onPaired }: { visible: boolean; onClose: () => void; onPaired: (computer: DeviceInfo) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [pairing, setPairing] = useState(false);
  const busy = useRef(false);

  async function scanned(text: string) {
    if (busy.current) return;
    const code = codeFromScan(text);
    if (!code) return;
    busy.current = true;
    setPairing(true);
    try {
      const computer = await pairWithCode(code);
      onPaired(computer);
      onClose();
    } catch (error) {
      Alert.alert("Couldn't pair", error instanceof Error ? error.message : "Something went wrong.", [{ text: "OK", onPress: () => (busy.current = false) }]);
    } finally {
      setPairing(false);
    }
  }

  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => void scanned(data)} />
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Ionicons name="camera-outline" size={44} color="white" />
            <Text className="mt-3 text-center text-base text-white">The camera is needed to scan the code on your computer.</Text>
            <Pressable onPress={() => void requestPermission()} className="mt-5 rounded-xl bg-white px-5 py-3">
              <Text className="font-semibold text-slate-900">Allow camera</Text>
            </Pressable>
          </View>
        )}
        <SafeAreaView className="absolute left-0 right-0 top-0" edges={["top"]}>
          <View className="flex-row items-center px-4 py-3">
            <Pressable onPress={onClose} className="h-10 w-10 items-center justify-center rounded-full bg-black/50" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="white" />
            </Pressable>
            <Text className="ml-3 flex-1 text-base font-semibold text-white">Scan the code on your computer</Text>
          </View>
        </SafeAreaView>
        {pairing && (
          <View className="absolute inset-0 items-center justify-center bg-black/60">
            <ActivityIndicator size="large" color="white" />
            <Text className="mt-3 text-white">Pairing…</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
