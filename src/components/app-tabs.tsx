import { NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';

import { useColors } from '@/lib/theme';

export default function AppTabs() {
  const c = useColors();
  return (
    <NativeTabs
      // iOS: leave the bar to the system (Liquid Glass on iOS 26). Android: a solid green-tinted bar.
      backgroundColor={Platform.OS === 'ios' ? undefined : c.bgTop}
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
      <NativeTabs.Trigger name="food">
        <NativeTabs.Trigger.Label>Voeding</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="fork.knife" md="restaurant" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="recovery">
        <NativeTabs.Trigger.Label>Herstel</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="moon.fill" md="bedtime" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>Voortgang</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" md="bar_chart" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
