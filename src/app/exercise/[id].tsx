import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { LineChart } from '@/components/charts';
import {
  Card,
  Divider,
  EmptyState,
  ListRow,
  Row,
  SectionTitle,
  StackScroll,
  Stat,
  Txt,
} from '@/components/ui';
import { clock, num, shortDate } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import {
  estimate1RM,
  exerciseHistory,
  metricLabel,
  sessionMetric,
  setLabel,
} from '@/lib/workout-stats';
import { useExerciseLookup, useStore } from '@/store/store';

export default function ExerciseDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workouts = useStore((s) => s.workouts);
  const getExercise = useExerciseLookup();
  const ex = getExercise(id);

  if (!ex) {
    return (
      <StackScroll>
        <EmptyState icon="dumbbell" title="Oefening niet gevonden" text="" />
      </StackScroll>
    );
  }

  const history = exerciseHistory(workouts, ex.id);
  const recent = history.slice(-12);
  const allSets = history.flatMap((h) => h.sets);

  const stats: { label: string; value: string; unit?: string }[] = [];
  if (ex.kind === 'weight') {
    const bestSet = allSets.reduce<(typeof allSets)[number] | null>(
      (best, s) =>
        !best ||
        estimate1RM(s.weight ?? 0, s.reps ?? 0) > estimate1RM(best.weight ?? 0, best.reps ?? 0)
          ? s
          : best,
      null,
    );
    stats.push(
      {
        label: 'Zwaarste',
        value: num(Math.max(0, ...allSets.map((s) => s.weight ?? 0))),
        unit: 'kg',
      },
      { label: 'Beste 1RM', value: num(Math.max(0, ...history.map((h) => h.best1RM))), unit: 'kg' },
      { label: 'Beste set', value: bestSet ? setLabel(bestSet, ex.kind).replace(' kg', '') : '–' },
    );
  } else if (ex.kind === 'bodyweight') {
    stats.push(
      { label: 'Meeste reps', value: String(Math.max(0, ...allSets.map((s) => s.reps ?? 0))) },
      {
        label: 'Totaal reps',
        value: num(
          allSets.reduce((n, s) => n + (s.reps ?? 0), 0),
          0,
        ),
      },
    );
  } else if (ex.kind === 'time') {
    stats.push({
      label: 'Langste',
      value: clock(Math.max(0, ...allSets.map((s) => s.duration ?? 0))),
    });
  } else {
    stats.push(
      {
        label: 'Verste',
        value: num(Math.max(0, ...allSets.map((s) => s.distance ?? 0)), 2),
        unit: 'km',
      },
      {
        label: 'Totaal',
        value: num(
          allSets.reduce((n, s) => n + (s.distance ?? 0), 0),
          1,
        ),
        unit: 'km',
      },
    );
  }
  stats.push({ label: 'Sessies', value: String(history.length) });

  return (
    <StackScroll>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ gap: 2 }}>
        <Txt variant="title">{ex.name}</Txt>
        <Txt variant="dim">{ex.muscle}</Txt>
      </View>

      {history.length === 0 ? (
        <EmptyState
          icon="chart"
          title="Nog geen data"
          text="Log deze oefening in een training om hier je voortgang en records te zien."
        />
      ) : (
        <>
          <Card>
            <Row style={{ alignItems: 'flex-start' }}>
              {stats.slice(0, 4).map((s) => (
                <Stat key={s.label} label={s.label} value={s.value} unit={s.unit} />
              ))}
            </Row>
          </Card>

          {recent.length > 1 ? (
            <Card>
              <Txt variant="label">{metricLabel(ex.kind)}</Txt>
              <LineChart
                values={recent.map((h) => sessionMetric(h, ex.kind))}
                labels={recent.map((h) => shortDate(h.date))}
                color={c.accent}
              />
            </Card>
          ) : null}

          <SectionTitle title="Geschiedenis" />
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {[...history].reverse().map((h, i) => (
              <View key={h.workoutId}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={shortDate(h.date)}
                  subtitle={h.sets.map((s) => setLabel(s, ex.kind)).join('  ·  ')}
                  onPress={() => router.push(`/history/${h.workoutId}`)}
                />
              </View>
            ))}
          </Card>
        </>
      )}
    </StackScroll>
  );
}
