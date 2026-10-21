import { ChecklistsTab } from "@/src/components/todo/ChecklistsTab";
import { WebChecklistsScreen } from "@/src/components/todo/web/WebChecklistsScreen";
import { OrbitPage } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// (In a wide browser window: the desktop layout. On the phone, in Orbit's look.)
export default function ShoppingScreen() {
  const wide = useWideWeb();
  return wide ? (
    <WebChecklistsScreen shopping={true} />
  ) : (
    <OrbitPage>
      <ChecklistsTab shopping={true} />
    </OrbitPage>
  );
}
