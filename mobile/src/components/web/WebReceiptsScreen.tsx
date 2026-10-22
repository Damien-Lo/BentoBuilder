import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from "react-native";

import { compactDate } from "@/src/components/web/fields";
import { NoPhoneYet } from "@/src/components/devices/NoPhoneYet";
import { BackLink } from "@/src/components/pantry/web/orbitWeb";
import { WebcamModal, type WebPhoto } from "@/src/components/web/WebcamModal";
import { hasPhone, requestCapture, watchCapture } from "@/src/services/deviceApi";
import { createReceiptDraftFrom, finishReceiptDraft, getReceiptDrafts, type ReceiptDraftSummary } from "@/src/services/receiptApi";
import { OrbitPage, SECTION_PALETTE, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { photoUri } from "@/src/utils/photos";

import { Button, Card, hoverable, PageTitle, WebPage } from "./ui";

// Receipts on the desktop: scans waiting to be reviewed. A receipt is
// photographed on the phone and saved with "Review on desktop"; it's read
// on the server (a few seconds) and then reviewed here, where every line has
// room, with the photo to check against. The review itself is the same
// screen as on the phone (receipts/review), working on the saved receipt.
//
// A receipt can also be started here: a photo from this computer (its
// webcam, or a file), or taken on the phone this computer's paired with
// (Settings → Devices) — the phone's "computer's camera" screen opens its
// camera for it.
//
// In Orbit's look, in the Kitchen's orange (under the Pantry in the
// desktop's tabs, with a way back to it over the title).

const statusOf = (c: OrbitColors): Record<string, { label: string; fg: string; bg: string }> => ({
  parsing: { label: "Reading…", fg: c.warning, bg: "#FEF3C7" },
  ready: { label: "Ready to review", fg: c.ink, bg: SECTION_PALETTE.kitchen.tint },
  reviewing: { label: "In progress", fg: c.onPill, bg: c.pill },
  failed: { label: "Couldn't read", fg: c.danger, bg: "#FEE2E2" },
});

export function WebReceiptsScreen() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const STATUS = statusOf(c);
  const [drafts, setDrafts] = useState<ReceiptDraftSummary[] | null>(null);

  const load = useCallback(() => {
    getReceiptDrafts()
      .then(setDrafts)
      .catch(() => setDrafts((prev) => prev ?? []));
  }, []);
  useFocusEffect(load);
  // (While one's being read, look again every few seconds.)
  const reading = (drafts ?? []).some((d) => d.status === "parsing");
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [reading, load]);

  function discard(draft: ReceiptDraftSummary) {
    const go = () => void finishReceiptDraft(draft._id, "discarded").then(load, () => {});
    if (typeof window !== "undefined" && window.confirm) {
      if (window.confirm("Throw this receipt away? Nothing from it has been added to the pantry.")) go();
    } else {
      Alert.alert("Throw this receipt away?", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Discard", style: "destructive", onPress: go }]);
    }
  }

  const open = (draft: ReceiptDraftSummary) => router.push({ pathname: "/receipts/review", params: { draft: draft._id } });

  // Starting one here.
  const [uploading, setUploading] = useState(false);
  const [webcam, setWebcam] = useState(false);
  const [phone, setPhone] = useState<{ status: string; message?: string; stop?: () => void } | null>(null);
  const [pairing, setPairing] = useState(false);
  // A photo from this computer: the webcam's, or a file.
  async function upload(photo: WebPhoto) {
    setWebcam(false);
    try {
      setUploading(true);
      await createReceiptDraftFrom(photo, "desktop");
      load();
    } catch (error) {
      Alert.alert("Couldn't add the receipt", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }
  async function withPhone() {
    if (!(await hasPhone().catch(() => false))) {
      setPairing(true);
      return;
    }
    try {
      const request = await requestCapture("receipt");
      const watch = watchCapture(request._id, (update) => setPhone((p) => (p ? { ...p, status: update.status } : p)));
      setPhone({ status: request.status, stop: watch.stop });
      const final = await watch.done.catch(() => null);
      if (!final) return;
      if (final.status === "done") {
        setPhone(null);
        load();
      } else setPhone({ status: final.status, message: final.status === "cancelled" ? "Cancelled on the phone." : final.error || "That didn't work." });
    } catch (error) {
      setPhone({ status: "failed", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  }

  return (
    <OrbitPage>
    <WebPage>
      <BackLink label="Pantry" onPress={() => router.navigate("/PantryMainPage")} />
      <PageTitle
        title="Receipts"
        subtitle={drafts?.length ? `${drafts.length} to review` : "Scanned on your phone, reviewed here"}
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label={uploading ? "Adding…" : "From this computer"} icon="desktop-outline" onPress={() => setWebcam(true)} />
            <Button label="Take it with my phone" icon="phone-portrait-outline" kind="primary" onPress={() => void withPhone()} />
          </View>
        }
      />

      {drafts === null ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.ink} />
      ) : drafts.length === 0 ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: SECTION_PALETTE.kitchen.tint }}>
              <Ionicons name="receipt-outline" size={21} color={c.ink} />
            </View>
            <Text style={{ marginLeft: 12, fontSize: 16, fontWeight: "700", color: c.text }}>No receipts waiting</Text>
          </View>
          <Text style={{ marginTop: 10, fontSize: 13, lineHeight: 20, color: c.muted }}>
            Use <Text style={{ fontWeight: "700", color: c.text }}>Take it with my phone</Text> or <Text style={{ fontWeight: "700", color: c.text }}>From this computer</Text> (webcam or a file) above, or on your phone scan
            a receipt from the Pantry or the Grocery list and choose <Text style={{ fontWeight: "700", color: c.text }}>Review on desktop</Text>. It shows up here while it&apos;s read, then
            you can check each line against the photo and add it all to the pantry.
          </Text>
        </Card>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          {drafts.map((draft) => {
            const state = STATUS[draft.reviewing && draft.status === "ready" ? "reviewing" : draft.status] ?? STATUS.ready;
            const canOpen = draft.status === "ready";
            const uri = photoUri(draft.photoUrl);
            const when = draft.purchaseDate ? compactDate(draft.purchaseDate.slice(0, 10)) : null;
            return (
              <Pressable
                key={draft._id}
                disabled={!canOpen}
                onPress={() => open(draft)}
                style={hoverable(({ hovered }) => ({
                  width: 260,
                  borderRadius: 18,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: hovered && canOpen ? c.selectedRing : c.border,
                  backgroundColor: c.surface,
                  boxShadow: hovered && canOpen ? "0 8px 20px rgba(15,23,42,0.08)" : undefined,
                }))}
              >
                <View style={{ height: 180, backgroundColor: c.track }}>
                  {uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" contentPosition="top" transition={120} /> : null}
                </View>
                <View style={{ padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: "700", color: c.text }}>
                      {draft.storeName || (draft.status === "parsing" ? "New receipt" : "Receipt")}
                    </Text>
                    <Pressable onPress={() => discard(draft)} hitSlop={8} accessibilityLabel="Discard this receipt">
                      {({ hovered }: { hovered?: boolean }) => <Ionicons name="trash-outline" size={16} color={hovered ? c.danger : c.faint} />}
                    </Pressable>
                  </View>
                  <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }}>
                    {[when, draft.lineCount ? `${draft.lineCount} line${draft.lineCount === 1 ? "" : "s"}` : null, `scanned ${compactDate(draft.createdAt.slice(0, 10))}`].filter(Boolean).join(" · ")}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: state.bg }}>
                      {draft.status === "parsing" && <ActivityIndicator size="small" color={state.fg} style={{ marginRight: 5, transform: [{ scale: 0.7 }] }} />}
                      <Text style={{ fontSize: 11, fontWeight: "700", color: state.fg }}>{state.label}</Text>
                    </View>
                    {canOpen && <Text style={{ marginLeft: "auto", fontSize: 12, fontWeight: "600", color: c.accent }}>{draft.reviewing ? "Continue" : "Review"} ›</Text>}
                  </View>
                  {draft.status === "failed" && !!draft.error && (
                    <Text numberOfLines={2} style={{ marginTop: 6, fontSize: 11, color: c.faint }}>
                      {draft.error}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      {/* Taking one with this computer: webcam or a file */}
      <WebcamModal visible={webcam} mode="photo" title="Receipt from this computer" onClose={() => setWebcam(false)} onPhoto={(photo) => void upload(photo)} />

      {/* Taking one with the phone */}
      <Modal visible={!!phone} transparent animationType="fade" onRequestClose={() => (phone?.stop?.(), setPhone(null))}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: c.scrim }}>
          <View style={{ width: "100%", maxWidth: 440, alignItems: "center", padding: 26, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            {phone && (() => {
              const open = ["waiting", "capturing"].includes(phone.status);
              return (
                <>
                  {open ? <ActivityIndicator color={c.ink} /> : <Ionicons name="close-circle-outline" size={30} color={c.faint} />}
                  <Text style={{ marginTop: 12, fontSize: 17, fontWeight: "700", color: c.text }}>
                    {phone.status === "waiting" ? "Waiting for your phone…" : phone.status === "capturing" ? "Camera open on your phone" : "That didn't work"}
                  </Text>
                  <Text style={{ marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: 19, color: c.muted }}>
                    {phone.status === "waiting"
                      ? "On your phone, keep Orbit open at Settings → Devices → Be my computer's camera: the camera opens by itself."
                      : phone.status === "capturing"
                        ? "Take the receipt. It appears here as soon as it arrives, and is read in the background."
                        : phone.message}
                  </Text>
                  <View style={{ marginTop: 18 }}>
                    <Button label={open ? "Cancel" : "Close"} onPress={() => (open && phone.stop?.(), setPhone(null))} />
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* No phone on the account yet */}
      <Modal visible={pairing} transparent animationType="fade" onRequestClose={() => setPairing(false)}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: c.scrim }}>
          <View style={{ width: "100%", maxWidth: 680, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: c.text }}>Use your phone&apos;s camera</Text>
              <Pressable onPress={() => setPairing(false)} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={c.muted} />
              </Pressable>
            </View>
            {pairing && <NoPhoneYet onFound={() => setPairing(false)} />}
          </View>
        </View>
      </Modal>
    </WebPage>
    </OrbitPage>
  );
}
