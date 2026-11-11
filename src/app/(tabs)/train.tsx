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
  ProgressBar,
  Row,
  SectionTitle,
  Stat,
  TabScreen,
  Txt,
} from '@/components/ui';
import { weekCardio, weekSteps } from '@/lib/cardio';
import { dateKey, durationLabel, monthName, num, shortDate } from '@/lib/format';
import { deloadStatus, weekKey } from '@/lib/recovery';
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
  const cardioLog = useStore((s) => s.cardioLog);
  const steps = useStore((s) => s.steps);
  const settings = useStore((s) => s.settings);

  const thisWeek = weekKey(0);
  const cardio = weekCardio(cardioLog, thisWeek);
  const stepWeek = weekSteps(steps, thisWeek);
  const stepsToday = steps[dateKey()] ?? 0;
  const deload = deloadStatus(settings, workouts);

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
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">Nieuwe training</Txt>
            {plan ? (
              <Txt variant="small" numberOfLines={1}>
                {plan.name}
              </Txt>
            ) : null}
          </Row>
          {deload.active ? (
            <Txt variant="small" color={c.accent} style={{ fontWeight: '600' }}>
              Deloadweek: je start met de helft van de sets. Stop 3-4 reps voor falen.
            </Txt>
          ) : null}
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

      <Card onPress={() => router.push('/cardio')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.sm}>
            <Icon name="run" size={16} color={c.accent} />
            <Txt variant="label">Cardio & stappen</Txt>
          </Row>
          <Row gap={4}>
            <Icon name="plus" size={14} color={c.accent} />
            <Txt variant="h3" color={c.accent}>
              Loggen
            </Txt>
          </Row>
        </Row>
        <Row>
          <Stat label="Cardio deze week" value={String(cardio.moderateEq)} unit="min" />
          <Stat label="Stappen vandaag" value={stepsToday ? num(stepsToday, 0) : '–'} />
          <Stat label="Stappen gem." value={stepWeek.days ? num(stepWeek.avg, 0) : '–'} />
        </Row>
        <ProgressBar value={cardio.moderateEq} max={settings.cardioGoalMin} color={c.accent} cap />
        <Txt variant="small">
          Doel {settings.cardioGoalMin} min per week en {num(settings.stepGoal, 0)} stappen per dag.
        </Txt>
      </Card>

      <Card style={{ paddingVertical: space.sm, gap: 0 }}>
        <ListRow
          title="Schema’s"
          subtitle={plan ? `Actief: ${plan.name}` : 'Kies of maak een trainingsschema'}
          left={<Icon name="plans" size={20} color={c.accent} />}
          onPress={() => router.push('/plans')}
        />
        <Divider />
        <ListRow
          title="Oefeningen & records"
          subtitle="Bekijk je voortgang per oefening"
          left={<Icon name="chart" size={20} color={c.accent} />}
          onPress={() => router.push({ pathname: '/exercises', params: { mode: 'browse' } })}
        />
      </Card>

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
