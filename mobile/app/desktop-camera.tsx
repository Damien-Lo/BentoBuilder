import { Ionicons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { useKeepAwake } from "expo-keep-awake";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BarcodeScannerModal } from "@/src/components/BarcodeScannerModal";
import { PhotoCaptureModal } from "@/src/components/PhotoCaptureModal";
import {
  cancelCapture,
  claimCapture,
  getThisDevice,
  nextCapture,
  sendCaptureBarcode,
  sendCapturePhoto,
  type CaptureRequest,
  type ThisDevice,
} from "@/src/services/deviceApi";
import { preparePhoto } from "@/src/utils/photos";

// On the phone: this phone as the camera of the account's computers. While
// it's open it checks every couple of seconds for a request from one of them
// — a barcode, a nutrition label, a receipt — and opens the right camera at
// once; what's taken goes back to the computer, which fills it in. The
// screen stays on meanwhile. (Later a notification will open this by
// itself; for now it has to be open — Settings → Devices.)

const WHAT: Record<CaptureRequest["kind"], { title: string; icon: keyof typeof Ionicons.glyphMap }> = {
  barcode: { title: "Barcode", icon: "barcode-outline" },
  label: { title: "Nutrition label", icon: "nutrition-outline" },
  receipt: { title: "Receipt", icon: "receipt-outline" },
};

export default function DesktopCameraScreen() {
  useKeepAwake();
  const router = useRouter();
  const [me, setMe] = useState<ThisDevice | null>(null);
  const [active, setActive] = useState<CaptureRequest | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<{ id: string; text: string; ok: boolean }[]>([]);
  const activeRef = useRef<CaptureRequest | null>(null);
  activeRef.current = active;
  // (Set the moment something's been taken: a camera closing after that
  // isn't the request being called off.)
  const answered = useRef(false);

  useFocusEffect(
    useCallback(() => {
      getThisDevice().then(setMe).catch(() => {});
    }, []),
  );

  // Looking for a request while there isn't one open.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let stopped = false;
    const look = async () => {
      if (stopped || activeRef.current) return;
      const request = await nextCapture().catch(() => null);
      if (!request || stopped || activeRef.current) return;
      const claimed = await claimCapture(request._id).catch(() => null);
      if (claimed && !stopped) setActive(claimed);
    };
    void look();
    const timer = setInterval(() => void look(), 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const noted = useRef(0);
  const note = (text: string, ok: boolean) => setHistory((prev) => [{ id: String(++noted.current), text, ok }, ...prev].slice(0, 8));
  const label = (request: CaptureRequest) => `${WHAT[request.kind].title}${request.label ? ` for ${request.label}` : ""}`;

  async function finish(job: () => Promise<unknown>) {
    const request = activeRef.current;
    if (!request) return;
    answered.current = true;
    setSending(true);
    try {
      await job();
      note(`${label(request)}: sent`, true);
    } catch (error) {
      const why = error instanceof Error ? error.message : "Something went wrong.";
      note(`${label(request)}: couldn't send — ${why}`, false);
      // (So the computer isn't left waiting.)
      void cancelCapture(request._id, `Couldn't send it from the phone: ${why}`).catch(() => {});
    } finally {
      setSending(false);
      setActive(null);
      answered.current = false;
    }
  }
  function closed() {
    const request = activeRef.current;
    if (!request || answered.current) return;
    void cancelCapture(request._id).catch(() => {});
    note(`${label(request)}: cancelled`, false);
    setActive(null);
  }
  // The photo, made smaller to send (2000 px on its longest side still
  // reads the small print on a label or a receipt) — or, in an app built
  // without the image tools, as taken (already a compressed JPEG).
  async function sendPhoto(uri: string) {
    const request = activeRef.current;
    if (!request) return;
    await finish(async () => {
      const photo = await preparePhoto(uri, 2000).catch(async () => ({ base64: await new File(uri).base64(), width: 0, height: 0 }));
      await sendCapturePhoto(request._id, photo);
    });
  }

  const computers = me?.others.filter((d) => d.kind === "computer") ?? [];
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
        <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Computer&apos;s camera</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {Platform.OS === "web" ? (
          <Text className="text-center text-slate-500">Open this on your phone, in the BentoBuilder app.</Text>
        ) : (
          <>
            <View className="items-center rounded-3xl border border-slate-200 bg-white px-6 py-10">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                {sending ? <ActivityIndicator color="#2563EB" /> : <Ionicons name="camera-outline" size={30} color="#2563EB" />}
              </View>
              <Text className="mt-4 text-lg font-bold text-slate-900">{sending ? "Sending…" : "Ready"}</Text>
              <Text className="mt-1 text-center text-sm text-slate-500">
                {computers.length ? `Waiting for ${computers.map((c) => c.name).join(" or ")}.` : "Waiting for your computer — open BentoBuilder on it, signed in to this account."} When it asks for a
                barcode, a label or a receipt, the camera opens here by itself. Keep this screen open while you review.
              </Text>
            </View>

            {history.length > 0 && (
              <>
                <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Just now</Text>
                <View className="rounded-2xl border border-slate-200 bg-white">
                  {history.map((h, i) => (
                    <View key={h.id} className={`flex-row items-center px-4 py-3 ${i ? "border-t border-slate-100" : ""}`}>
                      <Ionicons name={h.ok ? "checkmark-circle" : "close-circle"} size={16} color={h.ok ? "#16A34A" : "#94A3B8"} />
                      <Text className="ml-2 flex-1 text-sm text-slate-700">{h.text}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <BarcodeScannerModal
        visible={active?.kind === "barcode" && !sending}
        onClose={closed}
        onProductFound={() => {}}
        onBarcode={(code) => {
          if (answered.current) return;
          const request = activeRef.current;
          if (request) void finish(() => sendCaptureBarcode(request._id, code));
        }}
      />
      <PhotoCaptureModal
        visible={(active?.kind === "label" || active?.kind === "receipt") && !sending}
        onClose={closed}
        onCaptured={(uri) => {
          // (Once: a quick second tap on "use photo" isn't a second photo.)
          if (answered.current) return;
          answered.current = true;
          void sendPhoto(uri);
        }}
        subject={active?.kind === "receipt" ? "receipt" : "nutrition label"}
        instructions={active ? `For your computer${active.label ? `: ${active.label}` : ""}.` : undefined}
      />
    </SafeAreaView>
  );
}
