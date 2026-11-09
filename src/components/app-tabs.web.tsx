import { TabList, TabSlot, TabTrigger, type TabTriggerSlotProps, Tabs } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { useColors } from '@/lib/theme';

/** Web fallback: a bottom tab bar that mimics the native one. */
export default function AppTabs() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList
        style={[
          styles.bar,
          { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: insets.bottom + 6 },
        ]}>
        <TabTrigger name="index" href="/" asChild>
          <TabButton icon="home" label="Vandaag" />
        </TabTrigger>
        <TabTrigger name="train" href="/train" asChild>
          <TabButton icon="dumbbell" label="Trainen" />
        </TabTrigger>
        <TabTrigger name="plans" href="/plans" asChild>
          <TabButton icon="plans" label="Schema's" />
        </TabTrigger>
        <TabTrigger name="food" href="/food" asChild>
          <TabButton icon="food" label="Voeding" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

function TabButton({
  icon,
  label,
  isFocused,
  // The slot ref targets a View; Pressable doesn't need it.
  ref: _ref,
  ...props
}: TabTriggerSlotProps & { icon: IconName; label: string }) {
  const c = useColors();
  const color = isFocused ? c.accent : c.textDim;
  return (
    <Pressable {...props} style={styles.tab}>
      <View style={[styles.pill, isFocused && { backgroundColor: c.accentSoft }]}>
        <Icon name={icon} size={22} color={color} />
      </View>
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
