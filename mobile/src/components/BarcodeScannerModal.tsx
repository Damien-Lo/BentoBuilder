import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export interface ScannedProduct {
  name: string;
  barcode: string;
  brand?: string;
  packageQuantity?: number;
  packageUnit?: string;
  servingSize: number;
  servingUnit: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  fiber?: number;
  sodium?: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onProductFound: (product: ScannedProduct) => void;
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onProductFound,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [looking, setLooking] = useState(false);
  const processingRef = useRef(false);

  async function handleBarcode({ data }: { type: string; data: string }) {
    if (processingRef.current || looking) return;
    processingRef.current = true;
    setLooking(true);

    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(data)}.json`,
      );
      const json = (await res.json()) as {
        status: number;
        product?: Record<string, unknown>;
      };

      console.log(`Scanned barcode: ${data}, lookup status: ${json.status}`);
      console.log("Product data:", json);

      if (json.status !== 1 || !json.product) {
        Alert.alert(
          "Product not found",
          "This barcode wasn't in the database. You can still add it manually — the barcode will be saved so it's recognized next time.",
          [
            { text: "Cancel", style: "cancel", onPress: onClose },
            {
              text: "Continue",
              onPress: () => {
                onProductFound({ name: "", barcode: data, servingSize: 1, servingUnit: "" });
                onClose();
              },
            },
          ],
        );
        return;
      }

      const p = json.product;
      const nutriments = (p.nutriments ?? {}) as Record<string, unknown>;

      // Serving size — numeric grams per serving
      const servingQty =
        p.serving_quantity != null
          ? parseFloat(String(p.serving_quantity))
          : NaN;
      const hasServing = Number.isFinite(servingQty) && servingQty > 0;
      const portionAmount = hasServing ? servingQty : 100;

      // Open Food Facts uses several suffix variants depending on product type:
      // _prepared_serving (cooked/instant foods), _serving, _prepared_100g, _100g
      function getNum(key: string): number | undefined {
        const candidates = hasServing
          ? [
              nutriments[key + "_prepared_serving"],
              nutriments[key + "_serving"],
            ]
          : [];
        for (const v of candidates) {
          if (typeof v === "number" && Number.isFinite(v)) return v;
        }
        // Fall back to per-100g variants, scaled to serving size
        const per100Candidates = [
          nutriments[key + "_prepared_100g"],
          nutriments[key + "_100g"],
        ];
        for (const v of per100Candidates) {
          if (typeof v === "number" && Number.isFinite(v)) {
            return hasServing ? (v / 100) * servingQty : v;
          }
        }
        return undefined;
      }

      const sodiumG = getNum("sodium");

      // Brand — take the first brand when multiple are comma-separated
      const rawBrand = String(p.brands ?? "").trim();
      const brand = rawBrand ? rawBrand.split(",")[0].trim() : undefined;

      const name = String(p.product_name_en ?? p.product_name ?? "").trim();

      if (!name) {
        Alert.alert(
          "No product name",
          "Barcode found, but it has no name on file. You can still add it manually — the barcode will be saved so it's recognized next time.",
          [
            { text: "Cancel", style: "cancel", onPress: onClose },
            {
              text: "Continue",
              onPress: () => {
                onProductFound({
                  name: "",
                  barcode: data,
                  brand: brand || undefined,
                  servingSize: 1,
                  servingUnit: "",
                });
                onClose();
              },
            },
          ],
        );
        return;
      }

      const pkgQty = p.product_quantity != null ? parseFloat(String(p.product_quantity)) : NaN;
      const pkgUnit = String(p.product_quantity_unit ?? "g").trim() || "g";

      onProductFound({
        name,
        barcode: data,
        brand: brand || undefined,
        packageQuantity: Number.isFinite(pkgQty) && pkgQty > 0 ? pkgQty : undefined,
        packageUnit: pkgUnit,
        servingSize: portionAmount,
        // A real declared serving_quantity shares the package's own unit
        // system (g for solids, ml for liquids - Open Food Facts doesn't
        // report a separate unit for serving_quantity, but it's always in
        // the same system as product_quantity_unit). Hardcoding "g" here
        // broke every liquid product: a serving genuinely in ml labeled
        // "g" can't be reconciled against the row's real unit, so it
        // silently fell back to a bogus 1:1 conversion and the nutrition
        // came out wildly wrong. The no-serving-data fallback (100 g) is
        // unaffected - Open Food Facts' own _100g-suffixed fields are that
        // convention regardless of product type.
        servingUnit: hasServing ? pkgUnit : "g",
        calories: getNum("energy-kcal"),
        protein: getNum("proteins"),
        carbs: getNum("carbohydrates"),
        fats: getNum("fat"),
        fiber: getNum("fiber"),
        // Open Food Facts stores sodium in g; our model uses mg
        sodium: sodiumG != null ? Math.round(sodiumG * 1000) : undefined,
      });
      onClose();
    } catch {
      Alert.alert(
        "Lookup failed",
        "Could not reach the product database. You can still add it manually — the barcode will be saved so it's recognized next time.",
        [
          { text: "Cancel", style: "cancel", onPress: onClose },
          {
            text: "Continue",
            onPress: () => {
              onProductFound({ name: "", barcode: data, servingSize: 1, servingUnit: "" });
              onClose();
            },
          },
        ],
      );
    } finally {
      setLooking(false);
      processingRef.current = false;
    }
  }

  if (!visible) return null;

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <SafeAreaView className="flex-1 items-center justify-center bg-black px-8">
          <Ionicons name="camera-outline" size={48} color="white" />
          <Text className="mt-4 text-center text-lg font-bold text-white">
            Camera access needed
          </Text>
          <Text className="mt-2 text-center text-slate-400">
            Allow camera access to scan barcodes.
          </Text>
          <Pressable
            className="mt-6 rounded-2xl bg-blue-600 px-8 py-3"
            onPress={() => void requestPermission()}
          >
            <Text className="font-bold text-white">Allow camera</Text>
          </Pressable>
          <Pressable className="mt-4" onPress={onClose}>
            <Text className="text-slate-400">Cancel</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {/* Padded black border on every side — the camera never touches the
          screen edges, and the close button lives outside the camera view
          entirely rather than overlaid on top of it, so it can't end up
          obscured by or fighting the camera feed/status bar for space.
          bg-black lives on this plain View (not the SafeAreaView below) —
          background color doesn't reliably apply via className directly
          on SafeAreaView here. */}
      <View className="flex-1 bg-black">
        <SafeAreaView className="flex-1 p-4">
          <View className="flex-row items-center pb-3">
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
            <Text className="ml-3 text-lg font-bold text-white">
              Scan barcode
            </Text>
          </View>

          <View className="flex-1 overflow-hidden rounded-3xl bg-slate-900">
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={looking ? undefined : handleBarcode}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
              }}
            />

            {/* Viewfinder */}
            <View className="flex-1 items-center justify-center">
              <View className="h-44 w-72 rounded-2xl border-2 border-white/80" />
              <Text className="mt-4 text-sm text-white/70">
                Point the camera at a product barcode
              </Text>
            </View>

            {/* Lookup overlay */}
            {looking && (
              <View
                style={StyleSheet.absoluteFillObject}
                className="items-center justify-center bg-black/70"
              >
                <ActivityIndicator size="large" color="white" />
                <Text className="mt-3 text-white">Looking up product…</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
