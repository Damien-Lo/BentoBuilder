import { WebPrepShoppingScreen } from "@/src/components/planner/web/PrepShopping";
import { OrbitSection } from "@/src/theme/orbit";

// Kitchen → Prep & shopping: what the plan needs made ahead and bought, in
// full. (One layout for now: the desktop one, which also fits a phone's
// width in a single column of cards.)
export default function PrepShoppingScreen() {
  return (
    <OrbitSection section="kitchen">
      <WebPrepShoppingScreen />
    </OrbitSection>
  );
}
