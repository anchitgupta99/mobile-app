import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { usePhoneDisplay } from '@/components/PhoneText';
import { Avatar, Divider, EmptyState, Field, Icon, IconButton, Row, StatusChip, T } from '@/components/ui';
import { ListPlaceholder } from '@/components/ListPlaceholder';
import { useRefresh } from '@/hooks/useRefresh';
import { useDial } from '@/hooks/useDial';
import { useData } from '@/store/data';
import { useTheme } from '@/theme';

export default function Contacts() {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const contacts = useData((s) => s.contacts);
  const { refreshing, onRefresh } = useRefresh();
  const phone = usePhoneDisplay();
  const dial = useDial();

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return contacts
      .filter(
        (x) =>
          !term ||
          x.name.toLowerCase().includes(term) ||
          x.company.toLowerCase().includes(term) ||
          (digits.length >= 3 && x.phone.replace(/\D/g, '').endsWith(digits)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, q]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 12, gap: 14 }}>
        <T v="title" accessibilityRole="header" style={{ paddingHorizontal: 4 }}>
          Contacts
        </T>
        <Field
          label="Search contacts"
          hideLabel
          icon="search"
          placeholder="Name, company or last digits"
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          returnKeyType="search"
          right={q ? <IconButton icon="close" label="Clear search" variant="plain" size={36} onPress={() => setQ('')} /> : undefined}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.violet} />}
        ItemSeparatorComponent={() => <Divider inset={72} />}
        renderItem={({ item }) => (
          <Row
            onPress={() => router.push(`/contact/${item.id}`)}
            accessibilityLabel={`${item.name}, ${item.company}`}
            left={<Avatar name={item.name} />}
            title={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {item.name}
                </T>
                {item.dnc && <StatusChip label="DNC" tone="error" />}
                {item.tags.includes('Hot lead') && (
                  <Icon name="local-fire-department" size={16} color={c.warningFg} accessibilityLabel="Hot lead" />
                )}
              </View>
            }
            subtitle={`${item.company} · ${phone(item.phone)}`}
            right={
              item.dnc ? undefined : (
                <IconButton
                  icon="call"
                  label={`Call ${item.name}`}
                  variant="outline"
                  size={44}
                  color={c.call}
                  onPress={() => void dial({ number: item.phone, contactId: item.id, source: 'contact' })}
                />
              )
            }
          />
        )}
        ListEmptyComponent={
          <ListPlaceholder
            empty={
              q ? (
                <EmptyState
                  icon="person-search"
                  title="No matches"
                  body={`Nothing found for “${q}”. Try a name, company or the last 4 digits.`}
                />
              ) : (
                <EmptyState icon="people-alt" title="No contacts yet" body="Leads assigned to you appear here." />
              )
            }
          />
        }
      />
    </View>
  );
}
