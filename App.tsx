import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RootNavigator from "./src/navigation/RootNavigator";
import InactivityWrapper from "./src/components/InactivityWrapper";

import { initDatabase } from "./src/utils/database";
import { migrateFromAsyncStorage } from "./src/utils/migration";

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);

  useEffect(() => {
    async function lockOrientation() {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
    
    async function setupDatabase() {
      try {
        await initDatabase();
        await migrateFromAsyncStorage();
      } catch (e) {
        console.error("DB Init Error: ", e);
      } finally {
        setIsDbReady(true);
      }
    }
    
    lockOrientation();
    setupDatabase();
  }, []);

  if (!isDbReady) {
    return null; // Don't render until sqlite is ready
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <InactivityWrapper>
          <RootNavigator />
        </InactivityWrapper>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

