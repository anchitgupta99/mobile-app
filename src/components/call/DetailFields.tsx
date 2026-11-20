import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { detailError, isCaptured, type DetailEntry } from '@/domain/details';
import type { CaptureField } from '@/domain/types';
import { useDetails } from '@/store/details';
import { useTheme } from '@/theme';
import { Field, Icon, Pill, StatusChip, T, tap } from '../ui';

const keyboardFor = (f: CaptureField) =>
  f.type === 'email' ? ('email-address' as const) : f.type === 'phone' ? ('phone-pad' as const) : ('default' as const);

function SaveState({ entry, onRetry }: { entry: DetailEntry; onRetry: () => void }) {
  const { c } = useTheme();
  if (entry.save === 'saving') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel="Saving">
        <ActivityIndicator size="small" color={c.ink2} />
        <T v="caption" color={c.ink2}>
          Saving…
        </T>
      </View>
    );
  }
  if (entry.save === 'saved') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name="cloud-done" size={16} color={c.successFg} />
        <T v="caption" color={c.ink2}>
          Saved
        </T>
      </View>
    );
  }
  if (entry.save === 'failed') {
    return (
      <Pressable accessibilityRole="button" hitSlop={12} onPress={onRetry} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name="sync-problem" size={16} color={c.errorFg} />
        <T v="caption" color={c.errorFg}>
          Not saved · Retry
        </T>
      </Pressable>
    );
  }
  return null;
}

function TextButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: 'check' | 'edit' | 'undo' | 'block' }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={6}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 10,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: pressed ? c.pressed : 'transparent',
      })}
    >
      {icon && <Icon name={icon} size={16} color={c.purple} />}
      <T v="label" color={c.purple}>
        {label}
      </T>
    </Pressable>
  );
}

function DetailRow({ callId, field, entry }: { callId: string; field: CaptureField; entry: DetailEntry }) {
  const { c } = useTheme();
  const { setValue, commit, confirm, setDeclined } = useDetails.getState();
  const [editing, setEditing] = useState(false);
  const [touched, setTouched] = useState(false);
  const error = touched ? detailError(field, entry.value) : null;
  const captured = isCaptured(field, entry);
  const awaitingConfirm = entry.prefilled && !entry.confirmed && !entry.declined && !editing;

  return (
    <View style={{ gap: 6, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon
          name={captured ? 'check-circle' : 'radio-button-unchecked'}
          size={18}
          color={captured ? c.successFg : c.ink2}
          accessibilityLabel={captured ? 'Captured' : 'Not captured yet'}
        />
        <T v="bodyStrong" style={{ flexShrink: 1 }}>
          {field.label}
        </T>
        {field.required ? (
          <StatusChip tone="warning" label="Required" />
        ) : (
          <T v="caption" color={c.ink2}>
            Optional
          </T>
        )}
        <View style={{ flex: 1 }} />
        <SaveState entry={entry} onRetry={() => commit(callId, field.key)} />
      </View>
      {!!field.prompt && (
        <T v="caption" color={c.ink2}>
          {field.prompt}
        </T>
      )}

      {entry.declined ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <Icon name="block" size={18} color={c.ink2} />
          <T v="body" color={c.ink2} style={{ flex: 1 }}>
            Customer declined to share
          </T>
          <TextButton label="Undo" icon="undo" onPress={() => setDeclined(callId, field.key, false)} />
        </View>
      ) : awaitingConfirm ? (
        // Already in the CRM: confirm rather than retype
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
          <T v="body" style={{ flex: 1 }} numberOfLines={1} selectable>
            {entry.value}
          </T>
          <TextButton label="Confirm" icon="check" onPress={() => confirm(callId, field.key)} />
          <TextButton label="Edit" icon="edit" onPress={() => setEditing(true)} />
        </View>
      ) : field.type === 'dropdown' && field.options?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {field.options.map((o) => (
            <Pill
              key={o}
              label={o}
              active={entry.value === o}
              onPress={() => {
                setValue(callId, field.key, o);
                commit(callId, field.key);
              }}
            />
          ))}
        </View>
      ) : (
        <Field
          label={field.label}
          hideLabel
          value={entry.value}
          placeholder={
            field.type === 'date' ? 'DD-MM-YYYY' : field.type === 'email' ? 'name@example.com' : `Enter ${field.label.toLowerCase()}`
          }
          keyboardType={keyboardFor(field)}
          autoCapitalize={field.type === 'email' ? 'none' : 'words'}
          autoCorrect={false}
          error={error}
          onChangeText={(v) => setValue(callId, field.key, v)}
          onBlur={() => {
            setTouched(true);
            setEditing(false);
            commit(callId, field.key);
          }}
          onSubmitEditing={() => commit(callId, field.key)}
          returnKeyType="done"
        />
      )}

      {field.allowDeclined && !entry.declined && (
        <View style={{ flexDirection: 'row' }}>
          <TextButton label="Customer declined to share" onPress={() => setDeclined(callId, field.key, true)} />
        </View>
      )}
    </View>
  );
}

/** The required-details form for a call: on the call screen's panel, and in wrap-up when something is missing */
export function DetailFields({ callId }: { callId: string }) {
  const { c } = useTheme();
  const d = useDetails((s) => s.byCall[callId]);
  if (!d) return null;
  return (
    <View>
      {d.fields.map((f, i) => (
        <View key={f.key} style={{ borderTopWidth: i ? 1 : 0, borderColor: c.divider }}>
          <DetailRow callId={callId} field={f} entry={d.entries[f.key]} />
        </View>
      ))}
    </View>
  );
}
