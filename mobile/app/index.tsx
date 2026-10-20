import { OrbitHome } from "@/src/components/home/OrbitHome";
import { WebHomeScreen } from "@/src/components/web/WebHomeScreen";
import { useWideWeb } from "@/src/utils/useWideWeb";

export default function HomeScreen() {
  // A desktop browser gets a dashboard; the phone, the orbit.
  const wide = useWideWeb();
  return wide ? <WebHomeScreen /> : <OrbitHome />;
}
