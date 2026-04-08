import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text, StyleSheet } from "react-native";

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
        <View style={styles.rootContainer}>
          <InactivityWrapper>
            <RootNavigator />
          </InactivityWrapper>
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>Powered by Identiqa Labs</Text>
          </View>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  footerContainer: {
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 16, // Extra padding for landscape safe area
  },
  footerText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
