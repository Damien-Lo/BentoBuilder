import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { RestaurantForm } from "@/src/components/restaurants/RestaurantForm";
import { getRestaurant, type RestaurantDetail } from "@/src/services/restaurantApi";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

// Correcting a restaurant (wiki: anyone can; the change is kept in its
// history). The same form as adding one.
export default function EditRestaurantPage() {
  return (
    <OrbitSection section="kitchen">
      <EditRestaurant />
    </OrbitSection>
  );
}

function EditRestaurant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: o } = useOrbitTheme();
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getRestaurant(id)
      .then((found) => !cancelled && setRestaurant(found))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load this restaurant."));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!restaurant) {
    return (
      <OrbitPage>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: o.canvas }}>
          {error ? (
            <>
              <Ionicons name="alert-circle-outline" size={40} color={o.faint} />
              <Text style={{ marginTop: 12, textAlign: "center", color: o.muted }}>{error}</Text>
            </>
          ) : (
            <ActivityIndicator size="large" color={o.muted} />
          )}
        </View>
      </OrbitPage>
    );
  }
  return <RestaurantForm restaurant={restaurant} canReview={restaurant.canReview} />;
}
