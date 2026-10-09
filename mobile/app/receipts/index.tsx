import { Redirect } from "expo-router";

import { WebReceiptsScreen } from "@/src/components/web/WebReceiptsScreen";
import { useWideWeb } from "@/src/utils/useWideWeb";

// The desktop's Receipts page (planned). The phone has no page here: its
// receipt scanning starts from the Pantry.
export default function ReceiptsScreen() {
  const wide = useWideWeb();
  return wide ? <WebReceiptsScreen /> : <Redirect href="/PantryMainPage" />;
}
