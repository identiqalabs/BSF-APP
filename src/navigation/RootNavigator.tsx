import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, View, StyleSheet } from "react-native";

import EntriesTabScreen from "../screens/EntriesTabScreen";
import NewEntryModalScreen from "../screens/NewEntryModalScreen";
import LegacyEntryScreen from "../screens/LegacyEntryScreen";
import EntryDetailScreen from "../screens/EntryDetailScreen";
import ImportPreviewScreen from "../screens/ImportPreviewScreen";
import type { ExtractedEntry } from "../utils/extractEntries";

export type RootStackParamList = {
  Dashboard: undefined;
  LegacyEntry: undefined;
  NewEntryModal: undefined;
  EntryDetail: { entryId: string };
  ImportPreview: { extractedEntries: ExtractedEntry[], debugInfo: string };
};
const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Dashboard"
          component={EntriesTabScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="LegacyEntry"
          component={LegacyEntryScreen}
          options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="NewEntryModal"
          component={NewEntryModalScreen}
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
          }}
        />
        <Stack.Screen
          name="EntryDetail"
          component={EntryDetailScreen}
          options={{ headerShown: true, title: "Entry Detail" }}
        />
        <Stack.Screen
          name="ImportPreview"
          component={ImportPreviewScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  // (intentionally left minimal)
});

