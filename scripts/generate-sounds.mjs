// Synthesizes placeholder UI sounds. Run: npm run sounds
// Replace any file in assets/sounds with a branded one of the same name.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
mkdirSync(out, { recursive: true });

// A segment is a chord of sine waves. freqs: [] is silence.
// gain ~0.2 peak keeps tones around -18 LUFS and quiet beside call audio.
function render(segments) {
  const chunks = segments.map((seg) => {
    const n = Math.round((RATE * seg.ms) / 1000);
    const fade = Math.max(1, Math.min(Math.round(RATE * 0.008), Math.floor(n / 2)));
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      let v = 0;
      for (const f of seg.freqs) v += Math.sin(2 * Math.PI * f * t);
      v = seg.freqs.length ? v / seg.freqs.length : 0;
      const env = Math.min(1, i / fade, (n - 1 - i) / fade);
      const decay = seg.decay ? Math.exp(-t * seg.decay) : 1;
      buf[i] = v * env * decay * (seg.gain ?? 0.2);
    }
    return buf;
  });
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return all;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); // fmt chunk size
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); // byte rate
  h.writeUInt16LE(2, 32); // block align
  h.writeUInt16LE(16, 34); // bits per sample
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const gap = { freqs: [], ms: 20 };

// Standard DTMF pairs (row Hz, column Hz)
const dtmf = {
  1: [697, 1209],
  2: [697, 1336],
  3: [697, 1477],
  4: [770, 1209],
  5: [770, 1336],
  6: [770, 1477],
  7: [852, 1209],
  8: [852, 1336],
  9: [852, 1477],
  star: [941, 1209],
  0: [941, 1336],
  hash: [941, 1477],
};

const sounds = {
  ...Object.fromEntries(Object.entries(dtmf).map(([k, freqs]) => [`dtmf_${k}`, [{ freqs, ms: 120, gain: 0.2 }]])),
  connect: [{ freqs: [660], ms: 90 }, gap, { freqs: [880], ms: 140, decay: 8 }],
  end: [{ freqs: [880], ms: 90 }, gap, { freqs: [520], ms: 160, decay: 6 }],
  saved: [{ freqs: [784], ms: 70, gain: 0.16 }, gap, { freqs: [1175], ms: 180, decay: 10, gain: 0.16 }],
  complete: [{ freqs: [1046, 2093], ms: 160, decay: 14, gain: 0.16 }],
  error: [{ freqs: [330, 349], ms: 220, decay: 5, gain: 0.18 }],
};

for (const [name, segs] of Object.entries(sounds)) {
  writeFileSync(join(out, `${name}.wav`), wav(render(segs)));
}
console.log(`Wrote ${Object.keys(sounds).length} sounds to ${out}`);
