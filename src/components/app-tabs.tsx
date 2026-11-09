import { NativeTabs } from 'expo-router/native-tabs';

import { useColors } from '@/lib/theme';

export default function AppTabs() {
  const c = useColors();
  return (
    <NativeTabs
      backgroundColor={c.card}
      indicatorColor={c.accentSoft}
      tintColor={c.accent}
      labelStyle={{ selected: { color: c.accent } }}
      disableTransparentOnScrollEdge>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Vandaag</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="train">
        <NativeTabs.Trigger.Label>Trainen</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="dumbbell.fill" md="fitness_center" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plans">
        <NativeTabs.Trigger.Label>Schema&apos;s</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.clipboard.fill" md="assignment" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="food">
        <NativeTabs.Trigger.Label>Voeding</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="fork.knife" md="restaurant" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
