import { Ionicons } from "@expo/vector-icons";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import { getThisDevice, makePairCode, pairLink, type DeviceInfo } from "@/src/services/deviceApi";

// On a computer: a one-time QR code for a phone to scan in BentoBuilder
// (Settings → Devices → Pair with a computer). Watches for the phone to
// arrive and says so. The code lasts ten minutes; a new one can be shown.
export function PairPhoneCard({ onPaired, compact = false }: { onPaired?: (phone: DeviceInfo) => void; compact?: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [paired, setPaired] = useState<DeviceInfo | null>(null);
  const known = useRef<Set<string> | null>(null);

  async function show() {
    setError(null);
    setPaired(null);
    try {
      const me = await getThisDevice();
      known.current = new Set(me.paired.map((d) => d._id));
      const { code, expiresAt: until } = await makePairCode();
      // (A PNG, white behind it, so it reads in dark mode too.)
      setQr(await QRCode.toDataURL(pairLink(code), { margin: 2, width: 420, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" } }));
      setExpiresAt(new Date(until).getTime());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make a code.");
    }
  }
  useEffect(() => {
    void show();
  }, []);

  // (Until the phone turns up, or the code runs out.)
  useEffect(() => {
    if (!qr || paired) return;
    const timer = setInterval(() => {
      if (Date.now() > expiresAt) {
        setQr(null);
        return;
      }
      getThisDevice()
        .then((me) => {
          const phone = me.paired.find((d) => !known.current?.has(d._id));
          if (phone) {
            setPaired(phone);
            setQr(null);
            onPaired?.(phone);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [qr, paired, expiresAt, onPaired]);

  if (paired) {
    return (
      <View className="items-center py-4">
        <Ionicons name="checkmark-circle" size={40} color="#16A34A" />
        <Text className="mt-2 text-base font-bold text-slate-900">Paired with {paired.name}</Text>
        <Text className="mt-1 text-center text-sm text-slate-500">Photos for this computer can now be taken on that phone.</Text>
      </View>
    );
  }

  return (
    <View className={compact ? "items-center" : "flex-row flex-wrap items-center gap-6"}>
      <View className="items-center justify-center rounded-2xl border border-slate-200 bg-white p-3" style={{ width: 236, height: 236 }}>
        {qr ? (
          <Image source={{ uri: qr }} style={{ width: 210, height: 210 }} />
        ) : error ? (
          <Text className="px-3 text-center text-sm text-red-600">{error}</Text>
        ) : expiresAt && Date.now() > expiresAt ? (
          <Pressable onPress={() => void show()} className="items-center">
            <Ionicons name="refresh" size={26} color="#2563EB" />
            <Text className="mt-1 text-sm font-semibold text-blue-600">Code expired: show a new one</Text>
          </Pressable>
        ) : (
          <ActivityIndicator color="#2563EB" />
        )}
      </View>
      <View style={{ flexShrink: 1, maxWidth: 360 }} className={compact ? "mt-4" : ""}>
        <Text className="text-sm font-bold text-slate-900">Scan this with your phone</Text>
        <Text className="mt-1 text-sm leading-5 text-slate-500">
          In BentoBuilder on your phone: <Text className="font-semibold text-slate-700">Settings → Devices → Pair with a computer</Text>, then point it at this code. You only need to do this
          once: after that, photos for this computer go straight to your phone.
        </Text>
        <View className="mt-3 flex-row items-center">
          <ActivityIndicator size="small" color="#94A3B8" />
          <Text className="ml-2 text-xs text-slate-400">Waiting for your phone… (the code works for 10 minutes)</Text>
        </View>
      </View>
    </View>
  );
}
