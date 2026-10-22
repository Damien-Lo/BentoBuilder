import { Redirect } from "expo-router";

import { WebReceiptsScreen } from "@/src/components/web/WebReceiptsScreen";
import { OrbitSection } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// The desktop's Receipts page: scans saved to review there, under the Pantry
// in the Kitchen (in its orange). The phone has no page here: its receipt
// scanning starts from the Pantry.
export default function ReceiptsScreen() {
  const wide = useWideWeb();
  return wide ? (
    <OrbitSection section="kitchen">
      <WebReceiptsScreen />
    </OrbitSection>
  ) : (
    <Redirect href="/PantryMainPage" />
  );
}
