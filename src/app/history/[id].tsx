import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Row,
  StackScroll,
  Stat,
  Txt,
  confirm,
} from '@/components/ui';
import { durationLabel, longDate, num } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import {
  doneSetCount,
  estimate1RM,
  personalRecords,
  setLabel,
  workoutVolume,
} from '@/lib/workout-stats';
import { useExerciseLookup, useStore } from '@/store/store';

export default function WorkoutDetail() {
  const c = useColors();
  const { id, finished } = useLocalSearchParams<{ id: string; finished?: string }>();
  const workouts = useStore((s) => s.workouts);
  const activeWorkout = useStore((s) => s.activeWorkout);
  const deleteWorkout = useStore((s) => s.deleteWorkout);
  const startWorkout = useStore((s) => s.startWorkout);
  const getExercise = useExerciseLookup();

  const workout = workouts.find((w) => w.id === id);
  if (!workout) {
    return (
      <StackScroll>
        <EmptyState
          icon="history"
          title="Training niet gevonden"
          text="Misschien is hij verwijderd."
        />
      </StackScroll>
    );
  }

  const records = personalRecords(workout, workouts, getExercise);
  const volume = workoutVolume(workout);
  const duration = (workout.finishedAt ?? workout.startedAt) - workout.startedAt;
  const justFinished = finished === '1';

  const remove = async () => {
    if (
      await confirm(
        'Training verwijderen?',
        'Dit kan niet ongedaan worden gemaakt.',
        'Verwijder',
        true,
      )
    ) {
      deleteWorkout(workout.id);
      router.back();
    }
  };

  const repeat = async () => {
    if (
      activeWorkout &&
      !(await confirm(
        'Er loopt al een training',
        'Wil je die vervangen door deze?',
        'Vervang',
        true,
      ))
    )
      return;
    startWorkout({ fromWorkoutId: workout.id });
    router.push('/workout');
  };

  return (
    <StackScroll>
      <Stack.Screen options={{ title: justFinished ? 'Afgerond' : 'Training' }} />

      {justFinished ? (
        <Card tone="accent" style={{ alignItems: 'center', paddingVertical: space.xl }}>
          <Icon name="trophy" size={36} color={c.onAccent} />
          <Txt variant="title" color={c.onAccent} style={{ textAlign: 'center' }}>
            Goed gedaan!
          </Txt>
          <Txt color={c.onAccent} style={{ textAlign: 'center', opacity: 0.9 }}>
            {records.length
              ? `Je zette ${records.length} ${records.length === 1 ? 'nieuw record' : 'nieuwe records'} neer.`
              : 'Weer een training afgevinkt.'}
          </Txt>
        </Card>
      ) : null}

      <View style={{ gap: 2 }}>
        <Txt variant="h2">{workout.name}</Txt>
        <Txt variant="dim">{longDate(workout.startedAt)}</Txt>
      </View>

      <Card>
        <Row>
          <Stat label="Duur" value={durationLabel(duration)} />
          <Stat label="Sets" value={String(doneSetCount(workout))} />
          <Stat label="Volume" value={num(volume, 0)} unit="kg" />
        </Row>
      </Card>

      {workout.exercises.map((we) => {
        const ex = getExercise(we.exerciseId);
        if (!ex) return null;
        const isPR = records.includes(ex.id);
        const best = Math.max(...we.sets.map((s) => estimate1RM(s.weight ?? 0, s.reps ?? 0)));
        return (
          <Card
            key={we.id}
            style={{ gap: space.sm }}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
                {ex.name}
              </Txt>
              {isPR ? (
                <Row gap={4}>
                  <Icon name="trophy" size={14} color={c.carbs} />
                  <Txt variant="small" color={c.carbs} style={{ fontWeight: '700' }}>
                    Record
                  </Txt>
                </Row>
              ) : null}
            </Row>
            {we.sets.map((s, i) => (
              <View key={s.id}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: 'space-between', paddingTop: i > 0 ? space.sm : 0 }}>
                  <Row gap={space.md}>
                    <Txt variant="num" color={c.textDim} style={{ width: 18 }}>
                      {i + 1}
                    </Txt>
                    <Txt variant="num">{setLabel(s, ex.kind)}</Txt>
                  </Row>
                  {ex.kind === 'weight' && s.weight && s.reps ? (
                    <Txt variant="small">1RM ≈ {num(estimate1RM(s.weight, s.reps))}</Txt>
                  ) : null}
                </Row>
              </View>
            ))}
            {ex.kind === 'weight' && best > 0 ? (
              <Txt variant="small">Beste geschatte 1RM: {num(best)} kg</Txt>
            ) : null}
          </Card>
        );
      })}

      <Button label="Herhaal deze training" icon="repeat" variant="secondary" onPress={repeat} />
      {justFinished ? (
        <Button label="Klaar" size="lg" onPress={() => router.dismissTo('/')} />
      ) : (
        <Button label="Verwijder training" variant="danger" icon="trash" onPress={remove} />
      )}
    </StackScroll>
  );
}
