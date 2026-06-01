import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LICENSE_EXPIRY_DATE } from '../utils/license';

export default function LicenseExpiredScreen() {
  const formattedDate = LICENSE_EXPIRY_DATE.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <View style={styles.container}>
      <Feather name="alert-circle" size={80} color="#DC2626" style={styles.icon} />
      <Text style={styles.title}>License Expired</Text>
      <Text style={styles.subtitle}>
        Your license expired on {formattedDate}. Please contact your administrator to renew.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 28,
    maxWidth: 600,
  },
});
