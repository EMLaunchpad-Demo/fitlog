import { TabList, TabSlot, TabTrigger, type TabTriggerSlotProps, Tabs } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { glass, useColors } from '@/lib/theme';

/**
 * Web fallback: a floating frosted-glass tab bar. Screens scroll underneath it
 * (TabScreen leaves room at the bottom), so the blur has content to work on.
 */
export default function AppTabs() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      {/* TabList must stay a direct child of Tabs: that is where the triggers are read from. */}
      <TabList
        style={[
          styles.bar,
          glass(c, 'strong'),
          {
            bottom: Math.max(insets.bottom, 10),
            shadowColor: c.shadow,
            shadowOpacity: 1,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
          },
        ]}>
        <TabTrigger name="index" href="/" asChild>
          <TabButton icon="home" label="Vandaag" />
        </TabTrigger>
        <TabTrigger name="train" href="/train" asChild>
          <TabButton icon="dumbbell" label="Trainen" />
        </TabTrigger>
        <TabTrigger name="food" href="/food" asChild>
          <TabButton icon="food" label="Voeding" />
        </TabTrigger>
        <TabTrigger name="recovery" href="/recovery" asChild>
          <TabButton icon="moon" label="Herstel" />
        </TabTrigger>
        <TabTrigger name="progress" href="/progress" asChild>
          <TabButton icon="progress" label="Voortgang" />
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
    position: 'absolute',
    left: 12,
    right: 12,
    // Centres the bar once maxWidth kicks in (wide screens).
    marginHorizontal: 'auto',
    maxWidth: 520,
    flexDirection: 'row',
    borderRadius: 28,
    paddingVertical: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  pill: { width: 50, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
