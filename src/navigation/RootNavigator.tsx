import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import EntriesTabScreen from "../screens/EntriesTabScreen";
import NewEntryModalScreen from "../screens/NewEntryModalScreen";
import LegacyEntryScreen from "../screens/LegacyEntryScreen";
import EntryDetailScreen from "../screens/EntryDetailScreen";
import SettingsScreen from "../screens/SettingsScreen";
import InactivityWrapper from "../components/InactivityWrapper";

export type RootStackParamList = {
  Dashboard: undefined;
  LegacyEntry: undefined;
  NewEntryModal: undefined;
  EntryDetail: { entryId: string };
  Settings: undefined;
};
const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Dashboard" options={{ headerShown: false }}>
          {(props) => (
            <InactivityWrapper>
              <EntriesTabScreen {...props} />
            </InactivityWrapper>
          )}
        </Stack.Screen>
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
          name="Settings"
          component={SettingsScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

