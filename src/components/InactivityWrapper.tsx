import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Image, Text, Pressable } from 'react-native';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const SLIDESHOW_IMAGES = [
  require('../../assets/image1.png'),
  require('../../assets/image2.png'),
  require('../../assets/image3.png'),
  require('../../assets/image4.png'),
  require('../../assets/image5.png'),
];

export default function InactivityWrapper({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLocked(true);
    }, TIMEOUT_MS);
  }, []);

  const resetTimer = useCallback(() => {
    if (locked) return;
    startTimer();
  }, [locked, startTimer]);

  useEffect(() => {
    if (!locked) {
      startTimer();
      return;
    }

    // Start slideshow when locked
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % SLIDESHOW_IMAGES.length);
    }, 4000); // Change image every 4 seconds

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [locked, startTimer]);

  const handlePointerEvent = () => {
    resetTimer();
  };

  return (
    <View
      style={{ flex: 1 }}
      onPointerDown={handlePointerEvent}
      onPointerMove={handlePointerEvent}
      onTouchStart={handlePointerEvent}
    >
      {children}
      {locked && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.lockScreen} onPress={() => setLocked(false)}>
            <Image source={SLIDESHOW_IMAGES[currentImageIndex]} style={styles.image} resizeMode="cover" />

            <View style={styles.centerContainer}>
              <Text style={styles.titleText}>ASHWINI OFFICERS MESS</Text>
              <Image source={require('../../assets/bsflogo.png')} style={styles.logo} resizeMode="contain" />
            </View>

            <View style={styles.overlayTextContainer}>
              <Text style={styles.tapText}>Tap to continue</Text>
            </View>
          </Pressable>
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
    top: '20%',
    alignItems: 'center',
    width: '90%',
  },
  titleText: {
    fontSize: 36,
    fontWeight: '900',
    color: 'black',
    textAlign: 'center',
    marginBottom: 24,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  logo: {
    width: 200,
    height: 200,
  },
  overlayTextContainer: {
    position: 'absolute',
    bottom: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  tapText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  }
});
