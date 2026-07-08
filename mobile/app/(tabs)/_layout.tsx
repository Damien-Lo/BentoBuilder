import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons size={26} name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="RecipesMainPage"
        options={{
          title: 'Recipes',
          tabBarIcon: ({ color }) => <Ionicons size={26} name="book-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="PantryMainPage"
        options={{
          title: 'Pantry',
          tabBarIcon: ({ color }) => <Ionicons size={26} name="basket-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="sever_test_page"
        options={{
          title: 'Test',
          tabBarIcon: ({ color }) => <Ionicons size={26} name="flask-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
