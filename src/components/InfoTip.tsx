import { useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { Icon, T, tap } from './ui';

const WIDTH = 280;
const GAP = 8;

/**
 * Tap-to-open tooltip (phones have no hover). Renders an ⓘ icon, or wraps `children` so an existing
 * element (a badge, a chip) becomes the trigger. Don't use inside a Sheet: on web the bubble draws underneath it.
 */
export function InfoTip({
  title,
  text,
  children,
  color,
  size = 16,
}: {
  title?: string;
  text: string;
  children?: ReactNode;
  color?: string;
  size?: number;
}) {
  const { c } = useTheme();
  const win = useWindowDimensions();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const open = () => {
    tap();
    ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
    AccessibilityInfo.announceForAccessibility(title ? `${title}. ${text}` : text);
  };
  const close = () => setAnchor(null);

  const width = Math.min(WIDTH, win.width - 32);
  const left = anchor ? Math.max(16, Math.min(anchor.x + anchor.w / 2 - width / 2, win.width - width - 16)) : 0;
  // Open below the trigger unless that would run off the bottom of the screen
  const below = anchor ? anchor.y + anchor.h + GAP + 140 < win.height : true;

  return (
    <>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={title ? `About ${title}` : 'More info'}
        accessibilityHint="Shows an explanation"
        onPress={open}
        hitSlop={12}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, justifyContent: 'center' })}
      >
        {children ?? <Icon name="info-outline" size={size} color={color ?? c.ink3} />}
      </Pressable>
      <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ flex: 1 }}>
          {anchor && (
            <Animated.View
              entering={FadeIn.duration(duration.fast)}
              accessibilityViewIsModal
              style={{
                position: 'absolute',
                left,
                width,
                ...(below ? { top: anchor.y + anchor.h + GAP } : { bottom: win.height - anchor.y + GAP }),
                backgroundColor: c.inkStrong,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                gap: 4,
                shadowColor: c.shadow,
                shadowOpacity: 1,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              }}
            >
              {title && (
                <T v="label" color={c.surface}>
                  {title}
                </T>
              )}
              <T v="caption" color={c.surface} style={{ opacity: 0.9 }}>
                {text}
              </T>
            </Animated.View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}
