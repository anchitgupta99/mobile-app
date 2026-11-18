import * as Clipboard from 'expo-clipboard';
import { View } from 'react-native';
import { notify } from '@/components/feedback';
import { InfoTip } from '@/components/InfoTip';
import { Icon, IconButton, T, tap, type IconName } from '@/components/ui';
import { helpText } from '@/domain/helpText';
import type { ActiveCall } from '@/telephony/callStore';
import { font, useTheme } from '@/theme';

function MetaItem({ icon, label, value, tip }: { icon: IconName; label: string; value: string; tip: { title: string; text: string } }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name={icon} size={14} color={c.onCallScreen2} />
        <T v="caption" color={c.onCallScreen2}>
          {label}
        </T>
        <InfoTip {...tip} size={13} color={c.onCallScreen2} />
      </View>
      <T v="label" color={c.onCallScreen} numberOfLines={1} accessibilityLabel={`${label}: ${value}`}>
        {value}
      </T>
    </View>
  );
}

/** Campaign, list, call type and call UUID, matching the web call widget (its list pill only shows with a list). */
export function CallMeta({ call }: { call: ActiveCall }) {
  const { c } = useTheme();

  const copyUuid = async () => {
    await Clipboard.setStringAsync(call.uuid);
    tap('success');
    notify('Call UUID copied', 'success', undefined, { silent: true });
  };

  return (
    <View style={{ backgroundColor: c.callControl, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <MetaItem icon="campaign" label="Campaign" value={call.campaignName} tip={helpText.campaign} />
        {!!call.listName && <MetaItem icon="list-alt" label="List" value={call.listName} tip={helpText.list} />}
        <MetaItem icon="dialpad" label="Call type" value={call.callType} tip={helpText.callType} />
      </View>
      <View style={{ height: 1, backgroundColor: c.onCallScreen2, opacity: 0.2 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <T v="caption" color={c.onCallScreen2}>
              Call UUID
            </T>
            <InfoTip {...helpText.callUuid} size={13} color={c.onCallScreen2} />
          </View>
          <T v="caption" color={c.onCallScreen} numberOfLines={1} ellipsizeMode="middle" selectable style={{ fontFamily: font.medium }}>
            {call.uuid}
          </T>
        </View>
        <IconButton icon="content-copy" label="Copy call UUID" variant="plain" color={c.onCallScreen} size={40} onPress={() => void copyUuid()} />
      </View>
    </View>
  );
}
