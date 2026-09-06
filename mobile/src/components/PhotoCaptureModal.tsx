import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  onClose: () => void;
  // Fires once the user confirms a captured photo — purely the capture
  // step, caller gets the local file uri back and does whatever parsing/
  // upload it needs.
  onCaptured: (photoUri: string) => void;
  // Used to build the two title states: "Scan {subject}" before capture,
  // "Review {subject}" once a photo's been taken — e.g. "receipt", "meal photo".
  subject: string;
  // Optional helper line shown above the camera, pre-capture only (e.g.
  // framing guidance). Omit for no caption.
  instructions?: string;
}

// Generic capture-a-single-photo camera modal — permission gate, live
// camera, then a retake/use-photo preview step. Extracted from what was
// originally ReceiptScannerModal (the exact same shape of feature: point
// the camera at something, confirm the photo, hand the uri back) so a
// second use site (meal-photo macro estimation) doesn't duplicate the
// camera-permission/layout logic, and any future tuning of this layout only
// has to happen once. See BarcodeScannerModal for the other established
// camera-modal pattern — a continuous live-scan rather than single capture,
// different enough an interaction model that it isn't merged into this one.
export function PhotoCaptureModal({ visible, onClose, onCaptured, subject, instructions }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  function reset() {
    setPreviewUri(null);
    setCapturing(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleCapture() {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        setPreviewUri(photo.uri);
      }
    } finally {
      setCapturing(false);
    }
  }

  function handleUsePhoto() {
    if (!previewUri) return;
    onCaptured(previewUri);
    reset();
  }

  if (!visible) return null;

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={handleClose}>
        <SafeAreaView className="flex-1 items-center justify-center bg-black px-8">
          <Ionicons name="camera-outline" size={48} color="white" />
          <Text className="mt-4 text-center text-lg font-bold text-white">
            Camera access needed
          </Text>
          <Text className="mt-2 text-center text-slate-400">
            Allow camera access to scan a {subject}.
          </Text>
          <Pressable
            className="mt-6 rounded-2xl bg-blue-600 px-8 py-3"
            onPress={() => void requestPermission()}
          >
            <Text className="font-bold text-white">Allow camera</Text>
          </Pressable>
          <Pressable className="mt-4" onPress={handleClose}>
            <Text className="text-slate-400">Cancel</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={handleClose}>
      {/* Padded black border on every side — the camera never touches the
          screen edges, and every control (top bar, bottom controls) lives
          outside the camera view entirely rather than overlaid on top of
          it, so nothing can end up obscured by or fighting the camera
          feed/status bar for space. bg-black lives on this plain View (not
          the SafeAreaView below) — background color doesn't reliably apply
          via className directly on SafeAreaView here. */}
      <View className="flex-1 bg-black">
        <SafeAreaView className="flex-1 p-4">
          <View className="flex-row items-center pb-3">
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
              onPress={handleClose}
            >
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
            <Text className="ml-3 text-lg font-bold text-white">
              {previewUri ? `Review ${subject}` : `Scan ${subject}`}
            </Text>
          </View>

          {!previewUri && instructions && (
            <Text className="mb-3 text-center text-sm text-white/70">
              {instructions}
            </Text>
          )}

          <View className="flex-1 overflow-hidden rounded-3xl bg-slate-900">
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
            ) : (
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />
            )}
          </View>

          {/* Bottom controls */}
          <View className="items-center pt-4">
            {previewUri ? (
              <View className="w-full flex-row gap-3">
                <Pressable
                  className="flex-1 items-center rounded-2xl bg-white/15 py-4 active:bg-white/25"
                  onPress={reset}
                >
                  <Text className="text-base font-semibold text-white">Retake</Text>
                </Pressable>
                <Pressable
                  className="flex-1 items-center rounded-2xl bg-blue-600 py-4 active:bg-blue-700"
                  onPress={handleUsePhoto}
                >
                  <Text className="text-base font-semibold text-white">Use photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                disabled={capturing}
                onPress={() => void handleCapture()}
                className="h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-white/20"
              >
                {capturing ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <View className="h-16 w-16 rounded-full bg-white" />
                )}
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export default PhotoCaptureModal;
