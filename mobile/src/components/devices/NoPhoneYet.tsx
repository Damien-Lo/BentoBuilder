import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useAccount } from "@/src/components/auth/AuthGate";
import { hasPhone } from "@/src/services/deviceApi";

// On a computer that asked for "My phone" when the account has no phone
// yet: how to get one — open BentoBuilder on the phone, signed in to this
// account (it then counts as one of the account's devices). "Check again"
// looks for it, and calls `onFound` once it's there.
export function NoPhoneYet({ onFound }: { onFound: () => void }) {
  const { account } = useAccount();
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);

  async function check() {
    setChecking(true);
    setNotYet(false);
    const found = await hasPhone().catch(() => false);
    setChecking(false);
    if (found) onFound();
    else setNotYet(true);
  }

  return (
    <View>
      <View className="flex-row items-start">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
          <Ionicons name="phone-portrait-outline" size={20} color="#2563EB" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-[15px] leading-6 text-slate-700">
            1. Open Orbit on your phone, signed in as <Text className="font-semibold text-slate-900">{account?.email ?? "you"}</Text>.
          </Text>
          <Text className="mt-1 text-[15px] leading-6 text-slate-700">
            2. On the phone, go to <Text className="font-semibold text-slate-900">Settings → Devices → Be my computer&apos;s camera</Text> and keep that screen open.
          </Text>
          <Text className="mt-2 text-sm text-slate-500">Photos this computer asks for then open on the phone by themselves. Nothing to pair: being signed in to the same account is enough.</Text>
        </View>
      </View>
      <View className="mt-4 flex-row items-center">
        <Pressable onPress={() => void check()} disabled={checking} className="flex-row items-center rounded-xl bg-blue-600 px-4 py-2.5 active:bg-blue-700">
          {checking ? <ActivityIndicator size="small" color="white" style={{ marginRight: 6 }} /> : <Ionicons name="refresh" size={16} color="white" style={{ marginRight: 6 }} />}
          <Text className="text-sm font-semibold text-white">Check again</Text>
        </Pressable>
        {notYet && <Text className="ml-3 text-sm text-slate-500">No phone on this account yet.</Text>}
      </View>
    </View>
  );
}
