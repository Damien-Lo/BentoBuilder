import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";

import { WEB } from "./ui";

// The computer's own camera, in a browser: a product's barcode read live
// from the webcam (the browser's built-in barcode reader — Chrome has one;
// otherwise the number can be typed), or a photo — a nutrition label, a
// receipt — taken with the webcam or uploaded from a file. Photos are made
// at most 2000 px on their longest side, enough for small print.

export interface WebPhoto {
  base64: string;
  width: number;
  height: number;
}

type Hover = { hovered?: boolean };
const PHOTO_MAX = 2000;
const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

// The browser's barcode reader, where there is one (not a standard type yet).
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorClass = { new (options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };
const DetectorType = (globalThis as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;

// A drawable (a video frame, an image) as a JPEG, made smaller if need be.
function toPhoto(source: CanvasImageSource, width: number, height: number): WebPhoto {
  const scale = Math.min(1, PHOTO_MAX / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { base64: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], width: canvas.width, height: canvas.height };
}

export function WebcamModal({
  visible,
  mode,
  title,
  onClose,
  onBarcode,
  onPhoto,
}: {
  visible: boolean;
  mode: "barcode" | "photo";
  title: string;
  onClose: () => void;
  onBarcode?: (code: string) => void;
  onPhoto?: (photo: WebPhoto) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"starting" | "live" | "none">("starting");
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [canRead, setCanRead] = useState<boolean | null>(null);

  // The webcam, while open.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setState("starting");
    setProblem(null);
    setTyped("");
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setState("live");
      } catch (error) {
        if (cancelled) return;
        setState("none");
        const name = (error as { name?: string })?.name;
        setProblem(name === "NotAllowedError" ? "The browser isn't allowed to use the camera. Allow it in the address bar, or use the options below." : name === "NotFoundError" ? "No camera was found on this computer." : "The camera couldn't be started.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [visible]);

  // Barcodes: read from the live picture a few times a second.
  useEffect(() => {
    if (!visible || mode !== "barcode" || state !== "live") return;
    if (!DetectorType) {
      setCanRead(false);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      const supported = await DetectorType.getSupportedFormats().catch(() => [] as string[]);
      const formats = BARCODE_FORMATS.filter((f) => supported.includes(f));
      if (!formats.length) return setCanRead(false);
      setCanRead(true);
      const detector = new DetectorType({ formats });
      const look = async () => {
        if (stopped) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const found = await detector.detect(video).catch(() => []);
          if (found[0]?.rawValue && !stopped) {
            stopped = true;
            onBarcode?.(found[0].rawValue);
            return;
          }
        }
        timer = setTimeout(look, 250);
      };
      void look();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [visible, mode, state, onBarcode]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    onPhoto?.(toPhoto(video, video.videoWidth, video.videoHeight));
  }
  function upload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const image = new window.Image();
      image.onload = () => {
        onPhoto?.(toPhoto(image, image.naturalWidth, image.naturalHeight));
        URL.revokeObjectURL(url);
      };
      image.onerror = () => setProblem("That file couldn't be opened as a picture.");
      image.src = url;
    };
    input.click();
  }

  const digits = typed.replace(/\D/g, "");
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(15,23,42,0.55)" }}>
        <View style={{ width: "100%", maxWidth: 760, borderRadius: 20, backgroundColor: WEB.card, padding: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Ionicons name={mode === "barcode" ? "barcode-outline" : "camera-outline"} size={20} color={WEB.blue} />
            <Text style={{ flex: 1, marginLeft: 8, fontSize: 17, fontWeight: "700", color: WEB.text }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={WEB.muted} />
            </Pressable>
          </View>

          {/* The webcam's picture */}
          <View style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 14, overflow: "hidden", backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" }}>
            <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: state === "live" ? "block" : "none" }} />
            {state === "starting" && <ActivityIndicator color="#FFFFFF" />}
            {state === "none" && (
              <Text style={{ paddingHorizontal: 24, textAlign: "center", fontSize: 13, color: "#CBD5E1" }}>
                <Ionicons name="videocam-off-outline" size={16} color="#CBD5E1" /> {problem}
              </Text>
            )}
            {state === "live" && mode === "barcode" && (
              <View pointerEvents="none" style={{ position: "absolute", width: "60%", height: "34%", borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)" }} />
            )}
          </View>

          {mode === "barcode" ? (
            <>
              <Text style={{ marginTop: 10, fontSize: 12, color: WEB.muted }}>
                {state === "live" && canRead !== false
                  ? "Hold the barcode up to the camera, inside the box: it's read by itself."
                  : canRead === false
                    ? "This browser can't read barcodes from the camera (Chrome can). Type the number instead:"
                    : "Or type the number under the barcode:"}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TextInput
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="Barcode number"
                  placeholderTextColor={WEB.faint}
                  keyboardType="number-pad"
                  onSubmitEditing={() => digits.length >= 8 && onBarcode?.(digits)}
                  style={{ flex: 1, height: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: WEB.border, fontSize: 14, color: WEB.text, outlineStyle: "none" } as object}
                />
                <Pressable
                  disabled={digits.length < 8}
                  onPress={() => onBarcode?.(digits)}
                  style={({ hovered }: Hover) => ({ height: 38, paddingHorizontal: 14, borderRadius: 10, justifyContent: "center", backgroundColor: digits.length < 8 ? "#BFDBFE" : hovered ? "#1D4ED8" : WEB.blue })}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>Use this number</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <Pressable onPress={upload} style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: WEB.border, backgroundColor: hovered ? WEB.page : WEB.card })}>
                <Ionicons name="cloud-upload-outline" size={16} color={WEB.body} />
                <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: WEB.body }}>Upload a file</Text>
              </Pressable>
              <Pressable
                disabled={state !== "live"}
                onPress={takePhoto}
                style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: state !== "live" ? "#BFDBFE" : hovered ? "#1D4ED8" : WEB.blue })}
              >
                <Ionicons name="camera" size={16} color="#FFFFFF" />
                <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>Take photo</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
