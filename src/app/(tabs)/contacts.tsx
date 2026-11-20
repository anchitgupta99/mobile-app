import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useAppMenu } from '@/components/AppMenu';
import { usePhoneDisplay } from '@/components/PhoneText';
import { Avatar, Divider, EmptyState, Field, Icon, IconButton, Row, StatusChip, T } from '@/components/ui';
import { ListPlaceholder } from '@/components/ListPlaceholder';
import { useRefresh } from '@/hooks/useRefresh';
import { useDial, useDialAvailability } from '@/hooks/useDial';
import { useCampaigns } from '@/store/campaigns';
import { useData } from '@/store/data';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

const retry = () => void useData.getState().sync();
const switchCampaign = () => useAppMenu.getState().show('campaign');

export default function Contacts() {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const contacts = useData((s) => s.contacts);
  const listStatus = useData((s) => s.contactsListStatus);
  const listName = useData((s) => s.contactsListName);
  const contactsError = useData((s) => s.contactsError);
  const campaignId = useSession((s) => s.agent?.campaignId);
  const campaigns = useCampaigns((s) => s.list);
  const allowSelection = useCampaigns((s) => s.allowSelection);
  const { refreshing, onRefresh } = useRefresh();
  const phone = usePhoneDisplay();
  const dial = useDial();
  // Why calls can't be placed right now (offline, on break…); rows stay tappable so useDial can explain
  const dialBlock = useDialAvailability('contact');

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

  const campaign = campaigns.find((x) => x.id === campaignId);
  const campaignName = campaign?.name ?? 'this campaign';
  const leadListName = listName ?? campaign?.listName ?? 'your lead list';
  const switchAction = allowSelection ? { action: 'Switch campaign', onAction: switchCampaign } : {};

  const errorState = (
    <EmptyState
      icon="cloud-off"
      title="Couldn't load your leads"
      body="Check your connection and try again."
      action="Retry"
      onAction={retry}
    />
  );

  // Only rendered when the filtered list is empty. Cached rows from an earlier sync stay on screen when a
  // refresh fails (StatusBanners shows the stale-data banner), so the error state needs an empty cache.
  const emptyState =
    contacts.length === 0 && contactsError ? (
      errorState
    ) : contacts.length === 0 && listStatus === 'none' ? (
      <EmptyState
        icon="playlist-remove"
        title="No lead list yet"
        body={`Your admin hasn't assigned a lead list for ${campaignName} yet. Pull down to check again, or switch campaigns.`}
        {...switchAction}
      />
    ) : contacts.length === 0 && listStatus === 'exhausted' ? (
      <EmptyState
        icon="task-alt"
        title="You've called everyone"
        body={`Every lead in ${leadListName} has been called. Check back later or switch campaigns.`}
        {...switchAction}
      />
    ) : q ? (
      <EmptyState
        icon="search-off"
        title="No matches"
        body={`Nothing found for “${q}”. Try a name, company or the last 4 digits.`}
        action="Clear search"
        onAction={() => setQ('')}
      />
    ) : (
      <EmptyState icon="people-alt" title="No leads yet" body="Leads in your lead list appear here." />
    );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 12, gap: 14 }}>
        <T v="title" accessibilityRole="header" style={{ paddingHorizontal: 4 }}>
          Contacts
        </T>
        <Field
          label="Search leads"
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
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
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
                <View style={{ opacity: dialBlock ? 0.4 : 1 }}>
                  <IconButton
                    icon="call"
                    label={`Call ${item.name}`}
                    variant="outline"
                    size={44}
                    color={c.call}
                    onPress={() => void dial({ number: item.phone, contactId: item.id, source: 'contact' })}
                  />
                </View>
              )
            }
          />
        )}
        ListEmptyComponent={<ListPlaceholder empty={emptyState} error={errorState} />}
      />
    </View>
  );
}
