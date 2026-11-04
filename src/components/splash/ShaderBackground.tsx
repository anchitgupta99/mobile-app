import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SHADER_FALLBACK, setupShader } from './shader';

/** Animated noise background rendered with expo-gl. Fills its parent. */
export function ShaderBackground() {
  const stop = useRef<(() => void) | null>(null);
  const unmounted = useRef(false);

  useEffect(
    () => () => {
      unmounted.current = true;
      stop.current?.();
    },
    [],
  );

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    // The GL context can arrive after a fast splash has already unmounted us; never start the loop then
    if (unmounted.current) return;
    const { draw, dispose, ok } = setupShader(gl as unknown as WebGLRenderingContext);
    if (!ok) {
      // Compile or link failed (already logged): leave the solid fallback colour and never draw
      stop.current = dispose;
      return;
    }
    const start = performance.now();
    let alive = true;
    let raf = requestAnimationFrame(function frame(now) {
      if (!alive) return;
      draw((now - start) / 1000, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.endFrameEXP();
      raf = requestAnimationFrame(frame);
    });
    stop.current = () => {
      alive = false;
      cancelAnimationFrame(raf);
      dispose();
    };
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: SHADER_FALLBACK }]} pointerEvents="none">
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}
