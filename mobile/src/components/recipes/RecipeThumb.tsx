import { Image } from "expo-image";
import type { ReactNode } from "react";

import { useOrbitPage } from "@/src/theme/orbit";
import { photoUri } from "@/src/utils/photos";

// A recipe's photo, small, in a list — or, without one, whatever the list
// shows instead (its usual icon). (On a page in Orbit's look, the grey
// behind it while it loads is that page's, light or dark.)
export function RecipeThumb({ imageUrl, size, radius = size / 2, fallback }: { imageUrl?: string | null; size: number; radius?: number; fallback: ReactNode }) {
  const o = useOrbitPage();
  const uri = photoUri(imageUrl);
  if (!uri) return <>{fallback}</>;
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: o?.pill ?? "#E2E8F0" }} contentFit="cover" transition={120} />;
}
