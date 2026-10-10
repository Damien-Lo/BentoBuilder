import { ChecklistsTab } from "@/src/components/todo/ChecklistsTab";
import { WebChecklistsScreen } from "@/src/components/todo/web/WebChecklistsScreen";
import { useWideWeb } from "@/src/utils/useWideWeb";

// (In a wide browser window: the desktop layout.)
export default function ShoppingScreen() {
  const wide = useWideWeb();
  return wide ? <WebChecklistsScreen shopping={true} /> : <ChecklistsTab shopping={true} />;
}
