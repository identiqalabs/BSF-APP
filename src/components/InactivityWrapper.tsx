import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useInactivity } from '../context/InactivityContext';
import { RootStackParamList } from '../navigation/RootNavigator';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

const SLIDESHOW_IMAGES = [
  require('../../assets/image1.png'),
  require('../../assets/image2.png'),
  require('../../assets/image3.png'),
  require('../../assets/image4.png'),
  require('../../assets/image5.png'),
];

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function InactivityWrapper({ children }: { children: React.ReactNode }) {
  const { locked, setLocked } = useInactivity();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const navigation = useNavigation<NavigationProp>();

  useEffect(() => {
    if (!locked) return;

    // Start slideshow when locked
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % SLIDESHOW_IMAGES.length);
    }, 4000); // Change image every 4 seconds

    return () => clearInterval(interval);
  }, [locked]);

  const handleCreate = () => {
    navigation.navigate('NewEntryModal');
  };

  const handleRecords = () => {
    setLocked(false);
  };

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked && (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.lockScreen}>
            <Image source={SLIDESHOW_IMAGES[currentImageIndex]} style={styles.image} resizeMode="cover" />

            <View style={styles.centerContainer}>
              <Text style={styles.titleText}>ASHWINI BSF OFFICERS' INSTITUTE</Text>
              <Image source={require('../../assets/mainlogo.png')} style={styles.logo} resizeMode="contain" />
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.homeButton, styles.createButton]}
                onPress={handleCreate}
              >
                <Text style={styles.buttonText}>New Entry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.homeButton, styles.recordsButton]}
                onPress={handleRecords}
              >
                <Text style={styles.buttonText}>Records</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  centerContainer: {
    position: 'absolute',
    alignSelf: 'center',
    top: '15%',
    alignItems: 'center',
    width: '90%',
  },
  titleText: {
    fontSize: 48,
    fontWeight: '900',
    color: 'black',
    textAlign: 'center',
    marginBottom: 24,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  logo: {
    width: 320,
    height: 320,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: '15%',
    flexDirection: 'row',
    gap: 30,
    paddingHorizontal: 40,
    width: '100%',
    justifyContent: 'center',
  },
  homeButton: {
    paddingVertical: 24,
    paddingHorizontal: 48,
    borderRadius: 20,
    minWidth: 280,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  createButton: {
    backgroundColor: '#16A34A', // Green
  },
  recordsButton: {
    backgroundColor: '#2563EB', // Blue
  },
  buttonText: {
    fontSize: 28,
    fontWeight: '900',
    color: 'white',
  }
});
