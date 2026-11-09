import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { ActiveWorkoutBanner } from '@/components/shared';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ListRow,
  Row,
  SectionTitle,
  Stat,
  TabScreen,
  Txt,
} from '@/components/ui';
import { durationLabel, monthName, num, shortDate } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import type { Workout } from '@/lib/types';
import { doneSetCount, workoutVolume } from '@/lib/workout-stats';
import { findExercise, nextPlanDay, useStore } from '@/store/store';

export default function TrainScreen() {
  const c = useColors();
  const workouts = useStore((s) => s.workouts);
  const plans = useStore((s) => s.plans);
  const activePlanId = useStore((s) => s.activePlanId);
  const activeWorkout = useStore((s) => s.activeWorkout);
  const customExercises = useStore((s) => s.customExercises);
  const startWorkout = useStore((s) => s.startWorkout);

  const plan = plans.find((p) => p.id === activePlanId);
  const next = nextPlanDay(plan, workouts);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonth = workouts.filter((w) => w.startedAt >= monthStart);
  const monthVolume = thisMonth.reduce((sum, w) => sum + workoutVolume(w), 0);
  const monthTime = thisMonth.reduce(
    (sum, w) => sum + ((w.finishedAt ?? w.startedAt) - w.startedAt),
    0,
  );

  // Group history by month
  const groups: { title: string; items: Workout[] }[] = [];
  for (const w of workouts) {
    const d = new Date(w.startedAt);
    const title = `${monthName(d.getMonth())} ${d.getFullYear()}`;
    const g = groups[groups.length - 1];
    if (g?.title === title) g.items.push(w);
    else groups.push({ title, items: [w] });
  }

  const begin = (opts?: Parameters<typeof startWorkout>[0]) => {
    startWorkout(opts);
    router.push('/workout');
  };

  return (
    <TabScreen title="Trainen">
      <ActiveWorkoutBanner />

      {!activeWorkout ? (
        <Card>
          <Txt variant="label">Nieuwe training</Txt>
          {plan && plan.days.length ? (
            <View style={{ gap: space.sm }}>
              {plan.days.map((d) => (
                <Button
                  key={d.id}
                  label={`${d.name}${d.id === next?.id ? ' · volgende' : ''}`}
                  icon="play"
                  variant={d.id === next?.id ? 'primary' : 'secondary'}
                  onPress={() => begin({ planId: plan.id, dayId: d.id })}
                />
              ))}
              <Button label="Lege training" icon="plus" variant="ghost" onPress={() => begin()} />
            </View>
          ) : (
            <Button label="Start lege training" icon="play" size="lg" onPress={() => begin()} />
          )}
        </Card>
      ) : null}

      <Card>
        <Txt variant="label">{monthName(now.getMonth())}</Txt>
        <Row>
          <Stat label="Trainingen" value={String(thisMonth.length)} />
          {monthTime >= 3600000 ? (
            <Stat label="Tijd" value={num(monthTime / 3600000, 1)} unit="uur" />
          ) : (
            <Stat label="Tijd" value={String(Math.round(monthTime / 60000))} unit="min" />
          )}
          <Stat label="Volume" value={num(monthVolume / 1000, 1)} unit="ton" />
        </Row>
      </Card>

      <Card onPress={() => router.push({ pathname: '/exercises', params: { mode: 'browse' } })}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.md}>
            <Icon name="chart" size={20} color={c.accent} />
            <View>
              <Txt variant="h3">Oefeningen & records</Txt>
              <Txt variant="small">Bekijk je voortgang per oefening</Txt>
            </View>
          </Row>
          <Icon name="chevronRight" size={14} color={c.textFaint} />
        </Row>
      </Card>

      {groups.length === 0 ? (
        <EmptyState
          icon="history"
          title="Nog geen trainingen"
          text="Afgeronde trainingen verschijnen hier, met je sets, volume en records."
        />
      ) : (
        groups.map((g) => (
          <View key={g.title} style={{ gap: space.md }}>
            <SectionTitle title={g.title} />
            <Card style={{ paddingVertical: space.sm, gap: 0 }}>
              {g.items.map((w, i) => {
                const names = w.exercises
                  .map((we) => findExercise(we.exerciseId, customExercises)?.name)
                  .filter(Boolean);
                const vol = workoutVolume(w);
                return (
                  <View key={w.id}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      title={w.name}
                      subtitle={`${shortDate(w.startedAt)} · ${durationLabel((w.finishedAt ?? w.startedAt) - w.startedAt)} · ${doneSetCount(w)} sets${vol ? ` · ${num(vol, 0)} kg` : ''}\n${names.join(', ')}`}
                      onPress={() => router.push(`/history/${w.id}`)}
                    />
                  </View>
                );
              })}
            </Card>
          </View>
        ))
      )}
    </TabScreen>
  );
}
