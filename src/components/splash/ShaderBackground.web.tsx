import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SHADER_FALLBACK, setupShader } from './shader';

/** Animated noise background on a plain WebGL canvas. Fills its parent. */
export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { antialias: false });
    if (!canvas || !gl) return;

    // Cap device pixels so the fragment shader stays cheap on large or dense screens.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      const k = Math.min(1, Math.sqrt(2_000_000 / (w * h)));
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // The program and the draw loop are (re)built per GL context: the browser can drop the context
    // (GPU reset, tab backgrounded on mobile) and hand us a fresh one via `webglcontextrestored`.
    const start = performance.now();
    let raf = 0;
    let dispose = () => {};
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      dispose();
      dispose = () => {};
    };
    const begin = () => {
      stop();
      const shader = setupShader(gl);
      dispose = shader.dispose;
      if (!shader.ok) return; // fallback colour stays visible; nothing to animate
      raf = requestAnimationFrame(function frame(now) {
        shader.draw((now - start) / 1000, canvas.width, canvas.height);
        raf = requestAnimationFrame(frame);
      });
    };
    const onLost = (e: Event) => {
      e.preventDefault(); // allow the browser to restore the context
      cancelAnimationFrame(raf);
      raf = 0;
      dispose = () => {}; // GL objects are already gone with the context
    };
    const onRestored = () => begin();
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    begin();

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      observer.disconnect();
      stop();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: SHADER_FALLBACK }]} pointerEvents="none">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </View>
  );
}
