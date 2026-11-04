import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { Icon, IconButton, T, type IconName } from './ui';

/** Small dismissible tip for first-time guidance, e.g. gestures that aren't visible on screen. */
export function HintCard({ icon = 'lightbulb-outline', text, onDismiss }: { icon?: IconName; text: string; onDismiss: () => void }) {
  const { c } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(duration.base)}
      exiting={FadeOut.duration(duration.fast)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 14,
        paddingRight: 4,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: c.infoBg,
        borderColor: c.infoLine,
      }}
    >
      <Icon name={icon} size={18} color={c.infoFg} />
      <View style={{ flex: 1, paddingVertical: 6 }}>
        <T v="caption" color={c.infoFg}>
          {text}
        </T>
      </View>
      <IconButton icon="close" label="Dismiss tip" variant="plain" color={c.infoFg} size={40} onPress={onDismiss} />
    </Animated.View>
  );
}
