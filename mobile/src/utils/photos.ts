import { API_BASE_URL } from "@/src/config/api";

// Photos the app keeps (a recipe's, for now): taken, picked or pasted, then shrunk
// here before they're sent — no more than PHOTO_MAX on the long side, a
// fairly compressed JPEG — so each is a few hundred KB at most. The server
// keeps them in the database and serves them at `/api/photos/<id>`.

export const PHOTO_MAX = 1200;

// The camera, clipboard and image packages are only loaded when a photo's
// being added: anything that just shows photos (a list's thumbnails) then
// never needs them, and an app built before they were added still runs —
// adding a photo there says it needs the newer app instead of failing to open.
const OLD_APP = "Adding photos needs the latest version of the app. Install the newest build, then try again.";
// (`needs`: something the package has once it's really there — an app
// built without it can still load its code, just not use it.)
async function load<T>(get: () => Promise<T>, needs: string): Promise<T> {
  let loaded: unknown;
  try {
    loaded = await get();
  } catch {
    throw new Error(OLD_APP);
  }
  const mod = (loaded as Record<string, unknown>)[needs] ? loaded : (loaded as { default?: unknown }).default;
  if (!mod || typeof (mod as Record<string, unknown>)[needs] !== "function") throw new Error(OLD_APP);
  return mod as T;
}
const picker = () => load(() => import("expo-image-picker"), "launchCameraAsync");
const manipulator = () => load(() => import("expo-image-manipulator"), "manipulateAsync");
const clipboard = () => load(() => import("expo-clipboard"), "getImageAsync");

export interface PreparedPhoto {
  base64: string;
  width: number;
  height: number;
}

// Takes a photo with the camera, or picks one from the library (a file, in
// a browser), and shrinks it. Null if nothing was chosen.
export async function pickPhoto(from: "camera" | "library"): Promise<PreparedPhoto | null> {
  const ImagePicker = await picker();
  const permission = await (from === "camera" ? ImagePicker.requestCameraPermissionsAsync() : ImagePicker.requestMediaLibraryPermissionsAsync()).catch(() => {
    throw new Error(OLD_APP);
  });
  if (!permission.granted) throw new Error(from === "camera" ? "The app isn't allowed to use the camera. You can allow it in Settings." : "The app isn't allowed to see your photos. You can allow it in Settings.");
  const options = { mediaTypes: ["images" as const], quality: 1 };
  const result = from === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  return asset ? preparePhoto(asset.uri) : null;
}

// The image last copied (a photo copied from the web or the Photos app), if
// there is one — on a phone, as "Paste photo". (In a browser a paste with
// ⌘V is caught on the page itself: see pastedImage.)
export async function pastePhoto(): Promise<PreparedPhoto | null> {
  const Clipboard = await clipboard();
  if (!(await Clipboard.hasImageAsync())) return null;
  const image = await Clipboard.getImageAsync({ format: "jpeg", jpegQuality: 1 });
  return image ? preparePhoto(image.data) : null;
}

// In a browser, the image in a paste event (⌘V), as something to prepare.
export function pastedImage(event: ClipboardEvent): string | null {
  for (const item of Array.from(event.clipboardData?.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return URL.createObjectURL(file);
    }
  }
  return null;
}

// Shrinks an image (at a file, data or blob address) to what's kept.
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  const { ImageManipulator, SaveFormat } = await manipulator();
  // (Its size isn't always known beforehand — a pasted image's — so it's
  // read first, and only a larger one made smaller.)
  let image = await ImageManipulator.manipulate(uri).renderAsync();
  if (Math.max(image.width, image.height) > PHOTO_MAX) {
    image = await ImageManipulator.manipulate(image)
      .resize(image.width >= image.height ? { width: PHOTO_MAX } : { height: PHOTO_MAX })
      .renderAsync();
  }
  const saved = await image.saveAsync({ compress: 0.75, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error("Couldn't read the photo.");
  return { base64: saved.base64, width: saved.width, height: saved.height };
}

// Where a kept photo can be loaded from (its address is the server's own).
export function photoUri(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:|^data:/.test(url) ? url : `${API_BASE_URL}${url}`;
}
