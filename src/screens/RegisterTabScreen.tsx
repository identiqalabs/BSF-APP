import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";

export default function RegisterTabScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width > 768;
  const navigation = useNavigation<any>();

  return (
    <View style={styles.screen}>
      <View style={isTablet && { alignSelf: "center", width: "100%", maxWidth: 600 }}>
        <Text style={[styles.title, isTablet && { fontSize: 32 }]}>Register</Text>
        <Text style={[styles.subtitle, isTablet && { fontSize: 20 }]}>Create a new visitor entry.</Text>

        <TouchableOpacity
          onPress={() => {
            const parent = navigation.getParent?.();
            if (parent?.navigate) parent.navigate("NewEntryModal");
          }}
          style={[styles.createBtn, isTablet && { width: 300, alignSelf: "flex-start", marginTop: 30 }]}
        >
          <Text style={[styles.createBtnText, isTablet && { fontSize: 18 }]}>New Entry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, backgroundColor: "#F3F4F6", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  subtitle: { color: "#475569", fontWeight: "700", marginTop: 6 },
  createBtn: {
    marginTop: 18,
    backgroundColor: "#2563EB",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  createBtnText: { color: "white", fontWeight: "900" },
});

