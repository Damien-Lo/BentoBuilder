import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

// Where the person is, once, when asked ("use my location", restaurants near
// me): the browser's location on the web; on the phone, expo-location's —
// loaded only if the app was built with it (an app built before it was
// added hasn't its native part, and loading it there throws): otherwise
// this says so instead.
const hasNativeLocation = () => Platform.OS !== "web" && requireOptionalNativeModule("ExpoLocation") != null;
export type Position = { lat: number; lng: number };

export class LocationUnavailable extends Error {}

export async function currentPosition(): Promise<Position> {
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !navigator.geolocation) throw new LocationUnavailable("This browser can't share your location.");
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject(new LocationUnavailable("Your location wasn't shared.")),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      ),
    );
  }
  if (!hasNativeLocation()) throw new LocationUnavailable("This version of the app can't use your location yet — type the address instead.");
  const Location = await import("expo-location");
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new LocationUnavailable("Orbit isn't allowed to use your location. You can turn it on in Settings.");
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}

// Whether "use my location" can be offered here at all.
export async function canUseLocation(): Promise<boolean> {
  if (Platform.OS === "web") return typeof navigator !== "undefined" && !!navigator.geolocation;
  return hasNativeLocation();
}

// "1.2 km" / "350 m" from metres.
export const distanceLabel = (metres: number | null | undefined) =>
  metres == null ? "" : metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
