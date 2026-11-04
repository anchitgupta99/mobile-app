import LottieView from 'lottie-react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Logo } from '@/components/Logo';
import { duration } from '@/theme/motion';
import { light } from '@/theme/tokens';
import { ShaderBackground } from './ShaderBackground';

const logoAnimation = require('../../../assets/brand/splash-logo.json');

/** Lottie runs 144 frames at 60fps; this is a safety net if it never reports finishing. */
const MAX_PLAY_MS = 4000;
/** With Reduce Motion on, show the still wordmark this long instead of the animation. */
const STILL_MS = 900;
const INK = light.navy;

/**
 * Branded launch screen: the noise shader with the animated Claritel logo on top.
 * Covers the app until the animation has played and `ready` is true, then calls `onDone`.
 */
export function SplashOverlay({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPlayed(true), reduced ? STILL_MS : MAX_PLAY_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  useEffect(() => {
    if (played && ready) onDone();
  }, [played, ready, onDone]);

  return (
    <Animated.View
      exiting={FadeOut.duration(duration.slow)}
      style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
      onLayout={() => void SplashScreen.hideAsync()}
      accessible
      accessibilityLabel="Claritel"
    >
      <ShaderBackground />
      {reduced ? (
        <Animated.View entering={FadeIn.duration(duration.base)} style={styles.center}>
          <Logo height={40} color={INK} />
        </Animated.View>
      ) : (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LottieView
            source={logoAnimation}
            autoPlay
            loop={false}
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
            webStyle={{ width: '100%', height: '100%' }}
            onAnimationFinish={() => setPlayed(true)}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
