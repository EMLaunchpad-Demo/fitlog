import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Card, ProgressBar, Ring, Row, Txt } from '@/components/ui';
import { clock, num } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { space, useColors } from '@/lib/theme';
import type { Goals, Macros } from '@/lib/types';
import { useStore } from '@/store/store';

/** Shown on the tabs while a workout is in progress. */
export function ActiveWorkoutBanner() {
  const c = useColors();
  const active = useStore((s) => s.activeWorkout);
  const now = useNow(1000, !!active);
  if (!active) return null;
  const done = active.exercises.reduce((n, we) => n + we.sets.filter((s) => s.done).length, 0);
  return (
    <Card tone="accent" onPress={() => router.push('/workout')}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label" color={c.onAccent} style={{ opacity: 0.8 }}>
            Training bezig · {clock((now - active.startedAt) / 1000)}
          </Txt>
          <Txt variant="h3" color={c.onAccent} numberOfLines={1}>
            {active.name}
          </Txt>
          <Txt variant="small" color={c.onAccent} style={{ opacity: 0.8 }}>
            {done} {done === 1 ? 'set' : 'sets'} afgerond
          </Txt>
        </View>
        <Row gap={4}>
          <Txt variant="h3" color={c.onAccent}>
            Ga verder
          </Txt>
          <Icon name="chevronRight" size={14} color={c.onAccent} />
        </Row>
      </Row>
    </Card>
  );
}

export function MacroBars({ totals, goals }: { totals: Macros; goals: Goals }) {
  const c = useColors();
  const items = [
    {
      key: 'protein',
      label: 'Eiwit',
      value: totals.protein,
      goal: goals.protein,
      color: c.protein,
    },
    { key: 'carbs', label: 'Koolh.', value: totals.carbs, goal: goals.carbs, color: c.carbs },
    { key: 'fat', label: 'Vet', value: totals.fat, goal: goals.fat, color: c.fat },
  ];
  return (
    <View style={{ flex: 1, gap: space.md }}>
      {items.map((m) => (
        <View key={m.key} style={{ gap: 5 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" style={{ fontWeight: '600' }}>
              {m.label}
            </Txt>
            <Txt variant="small" style={{ fontVariant: ['tabular-nums'] }}>
              {num(m.value, 0)} / {m.goal} g
            </Txt>
          </Row>
          <ProgressBar value={m.value} max={m.goal} color={m.color} />
        </View>
      ))}
    </View>
  );
}

export function CalorieRing({
  eaten,
  goal,
  size = 128,
}: {
  eaten: number;
  goal: number;
  size?: number;
}) {
  const c = useColors();
  const left = goal - eaten;
  return (
    <Ring value={eaten} max={goal} size={size} color={c.accent}>
      <Txt variant="h2" style={{ fontVariant: ['tabular-nums'], fontSize: size > 120 ? 24 : 20 }}>
        {num(Math.abs(left), 0)}
      </Txt>
      <Txt variant="small">{left >= 0 ? 'kcal over' : 'kcal te veel'}</Txt>
    </Ring>
  );
}

export function MacroLine({ m }: { m: Macros }) {
  const c = useColors();
  const items = [
    { label: 'kcal', value: num(m.kcal, 0), color: c.accent },
    { label: 'eiwit', value: `${num(m.protein)} g`, color: c.protein },
    { label: 'koolh.', value: `${num(m.carbs)} g`, color: c.carbs },
    { label: 'vet', value: `${num(m.fat)} g`, color: c.fat },
  ];
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      {items.map((i) => (
        <View key={i.label} style={{ alignItems: 'center', flex: 1 }}>
          <Txt variant="h3" color={i.color} style={{ fontVariant: ['tabular-nums'] }}>
            {i.value}
          </Txt>
          <Txt variant="small">{i.label}</Txt>
        </View>
      ))}
    </Row>
  );
}
