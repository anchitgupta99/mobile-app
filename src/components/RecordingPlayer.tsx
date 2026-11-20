import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { api, ApiError } from '@/api/client';
import { formatDuration, formatWhen } from '@/domain/format';
import type { CallRecord } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { minTap, useTheme } from '@/theme';
import { Card, Icon, IconButton, Pill, T } from './ui';

const LOAD_TIMEOUT_MS = 10000;

/**
 * Plays a call recording from its short-lived signed link. The link is fetched on first play and
 * again once it has expired; position, duration and play state come from the audio player itself.
 */
export function RecordingPlayer({ call }: { call: CallRecord }) {
  const { c } = useTheme();
  // Released automatically when the component unmounts
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [rate, setRate] = useState(1);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const width = useRef(1);

  const playing = state === 'ready' && status.playing;
  const pos = state === 'ready' ? status.currentTime : 0;
  const dur = Math.max(1, status.duration || call.talkSec || call.durationSec);

  useEffect(() => {
    if (state === 'ready') player.setPlaybackRate(rate);
  }, [player, rate, state]);

  // The player reports no error of its own when a source can't be fetched; a link that is still
  // not loaded after a while is treated as broken rather than spinning forever.
  useEffect(() => {
    if (state !== 'ready' || status.isLoaded) return;
    const t = setTimeout(() => {
      setError('Could not load the recording. Tap play to try again.');
      setState('error');
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [state, status.isLoaded]);

  const load = async () => {
    setState('loading');
    try {
      const r = await api.calls.recording(call.id, call.recordingUrl);
      player.replace({ uri: r.url });
      player.setPlaybackRate(rate);
      player.play();
      setExpiresAt(r.expiresAt);
      setState('ready');
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'offline' ? 'Recordings need a connection.' : 'Could not load the recording.');
      setState('error');
    }
  };

  const now = useNow(15000);
  const expired = !!expiresAt && now >= new Date(expiresAt).getTime();

  const toggle = () => {
    if (state === 'loading') return;
    if (state !== 'ready' || expired) return void load();
    if (status.playing) return player.pause();
    if (status.didJustFinish || status.currentTime >= dur) void player.seekTo(0).then(() => player.play());
    else player.play();
  };

  const seek = (sec: number) => {
    if (state !== 'ready') return;
    void player.seekTo(Math.max(0, Math.min(dur, sec)));
  };

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause recording' : 'Play recording'}
          onPress={toggle}
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: pressed ? c.primaryPressed : c.primary,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          {state === 'loading' || (state === 'ready' && !status.isLoaded) ? (
            <ActivityIndicator color={c.onPrimary} />
          ) : (
            <Icon name={playing ? 'pause' : 'play-arrow'} size={30} color={c.onPrimary} />
          )}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Seek"
            accessibilityValue={{ min: 0, max: Math.round(dur), now: Math.round(pos) }}
            accessibilityActions={[
              { name: 'increment', label: 'Forward 10 seconds' },
              { name: 'decrement', label: 'Back 10 seconds' },
            ]}
            onAccessibilityAction={(e) => seek(pos + (e.nativeEvent.actionName === 'increment' ? 10 : -10))}
            onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}
            onPress={(e) => seek((e.nativeEvent.locationX / width.current) * dur)}
            // A 48dp touch area around a thin 6dp track
            style={{ height: minTap, justifyContent: 'center' }}
          >
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.mutedFill, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (pos / dur) * 100)}%`, height: 6, backgroundColor: c.violet }} />
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="caption" nums>
              {formatDuration(Math.floor(pos))}
            </T>
            <T v="caption" nums>
              {formatDuration(Math.round(dur))}
            </T>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconButton icon="replay-10" label="Back 10 seconds" size={44} onPress={() => seek(pos - 10)} />
        <IconButton icon="forward-10" label="Forward 10 seconds" size={44} onPress={() => seek(pos + 10)} />
        <View style={{ flex: 1 }} />
        {[1, 1.5, 2].map((r) => (
          <Pill key={r} label={`${r}×`} active={rate === r} onPress={() => setRate(r)} />
        ))}
      </View>
      {state === 'error' && (
        <T v="caption" color={c.errorFg}>
          {error}
        </T>
      )}
      {expiresAt && (
        <T v="caption" color={c.ink3}>
          {expired ? 'Secure link expired · tap play to fetch a new one' : `Secure link · expires ${formatWhen(expiresAt)}`}
        </T>
      )}
    </Card>
  );
}
