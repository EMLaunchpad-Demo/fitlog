import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  NumberField,
  ProgressBar,
  Row,
  StackScroll,
  Txt,
  confirm,
  notify,
  success,
  tap,
} from '@/components/ui';
import { clock, longDate } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { radius, space, useColors } from '@/lib/theme';
import type { Exercise, WorkoutExercise, WorkoutSet } from '@/lib/types';
import { previousSets, setLabel, targetNumber } from '@/lib/workout-stats';
import { useExerciseLookup, useStore } from '@/store/store';

export default function WorkoutScreen() {
  // Keep the screen on while training; on web the wake lock may never activate.
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  const c = useColors();
  const workout = useStore((s) => s.activeWorkout);
  const rest = useStore((s) => s.rest);
  const renameWorkout = useStore((s) => s.renameWorkout);
  const finishWorkout = useStore((s) => s.finishWorkout);
  const discardWorkout = useStore((s) => s.discardWorkout);
  const now = useNow(1000, !!workout);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const finish = async () => {
    if (!workout) return;
    const all = workout.exercises.flatMap((we) => we.sets);
    const done = all.filter((s) => s.done).length;
    if (done === 0) {
      if (
        await confirm(
          'Nog geen sets afgevinkt',
          'Wil je deze training weggooien?',
          'Weggooien',
          true,
        )
      ) {
        discardWorkout();
        close();
      }
      return;
    }
    const open = all.length - done;
    const ok = await confirm(
      'Training afronden?',
      open > 0
        ? `${open} ${open === 1 ? 'set is' : 'sets zijn'} niet afgevinkt en ${open === 1 ? 'wordt' : 'worden'} niet opgeslagen.`
        : 'Goed bezig! Je training wordt opgeslagen.',
      'Afronden',
    );
    if (!ok) return;
    const id = finishWorkout();
    success();
    if (id) router.replace({ pathname: '/history/[id]', params: { id, finished: '1' } });
    else close();
  };

  const discard = async () => {
    if (
      await confirm(
        'Training annuleren?',
        'Alle gelogde sets van deze training gaan verloren.',
        'Annuleer training',
        true,
      )
    ) {
      discardWorkout();
      close();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: workout ? clock((now - workout.startedAt) / 1000) : 'Training',
          headerTitleStyle: {
            color: c.text,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          } as never,
          headerLeft: () => (
            <View style={{ marginHorizontal: Platform.OS === 'web' ? space.md : 0 }}>
              <IconButton icon="chevronDown" label="Minimaliseer training" onPress={close} />
            </View>
          ),
          headerRight: () =>
            workout ? (
              <Pressable
                accessibilityRole="button"
                onPress={finish}
                hitSlop={8}
                style={{
                  marginHorizontal: Platform.OS === 'web' ? space.md : 0,
                  backgroundColor: c.success,
                  paddingHorizontal: 14,
                  height: 34,
                  borderRadius: 17,
                  justifyContent: 'center',
                }}>
                <Txt variant="h3" color="#FFFFFF" style={{ fontSize: 15 }}>
                  Afronden
                </Txt>
              </Pressable>
            ) : null,
        }}
      />

      {!workout ? (
        <EmptyState
          icon="dumbbell"
          title="Geen training bezig"
          text="Start een training vanaf Vandaag of Trainen."
          action={<Button label="Terug" variant="secondary" onPress={close} />}
        />
      ) : (
        <StackScroll contentContainerStyle={{ paddingBottom: rest ? 200 : 80 }}>
          <View style={{ gap: 2 }}>
            <TextInput
              value={workout.name}
              onChangeText={renameWorkout}
              accessibilityLabel="Naam van de training"
              style={{ fontSize: 26, fontWeight: '800', color: c.text, padding: 0 }}
            />
            <Txt variant="dim">{longDate(workout.startedAt)}</Txt>
          </View>

          {workout.exercises.map((we, i) => (
            <ExerciseBlock key={we.id} we={we} workoutId={workout.id} showHint={i === 0} />
          ))}

          <Button
            label="Oefening toevoegen"
            icon="plus"
            variant="secondary"
            size="lg"
            onPress={() => router.push({ pathname: '/exercises', params: { mode: 'workout' } })}
          />
          <Button label="Training annuleren" variant="danger" onPress={discard} />
        </StackScroll>
      )}

      {workout && rest ? <RestBar /> : null}
    </View>
  );
}

function ExerciseBlock({
  we,
  workoutId,
  showHint,
}: {
  we: WorkoutExercise;
  workoutId: string;
  showHint: boolean;
}) {
  const c = useColors();
  const getExercise = useExerciseLookup();
  const workouts = useStore((s) => s.workouts);
  const defaultRest = useStore((s) => s.defaultRestSec);
  const addSet = useStore((s) => s.addSet);
  const removeSet = useStore((s) => s.removeSet);
  const updateSet = useStore((s) => s.updateSet);
  const removeWorkoutExercise = useStore((s) => s.removeWorkoutExercise);
  const startRest = useStore((s) => s.startRest);

  const ex = getExercise(we.exerciseId);
  if (!ex) return null;
  const prev = previousSets(workouts, ex.id, workoutId);
  const restSec = we.restSec ?? defaultRest;
  const target = targetNumber(we.target);

  const toggle = (s: WorkoutSet, i: number) => {
    if (s.done) {
      updateSet(we.id, s.id, { done: false });
      return;
    }
    // Fill empty fields from the previous session or the plan target.
    const p = prev[i] ?? prev[prev.length - 1];
    const patch: Partial<WorkoutSet> = { done: true };
    if (ex.kind === 'weight' || ex.kind === 'bodyweight') {
      if (s.weight == null && p?.weight != null) patch.weight = p.weight;
      if (s.reps == null) patch.reps = p?.reps ?? target ?? null;
      if (ex.kind === 'weight' && (patch.weight ?? s.weight) == null)
        return notify('Gewicht ontbreekt', `Vul eerst in hoeveel kg je deed bij set ${i + 1}.`);
      if ((patch.reps ?? s.reps) == null)
        return notify('Reps ontbreken', `Vul eerst het aantal herhalingen in bij set ${i + 1}.`);
    } else if (ex.kind === 'time') {
      if (s.duration == null) patch.duration = p?.duration ?? target ?? null;
      if ((patch.duration ?? s.duration) == null)
        return notify('Tijd ontbreekt', `Vul eerst het aantal seconden in bij set ${i + 1}.`);
    } else {
      if (s.duration == null && p?.duration != null) patch.duration = p.duration;
      if (s.distance == null && p?.distance != null) patch.distance = p.distance;
      if ((patch.duration ?? s.duration) == null && (patch.distance ?? s.distance) == null)
        return notify('Nog niets ingevuld', 'Vul de afstand of de duur in.');
    }
    updateSet(we.id, s.id, patch);
    tap();
    if (ex.kind !== 'cardio') startRest(restSec);
  };

  const remove = async () => {
    if (await confirm('Oefening verwijderen?', ex.name, 'Verwijder', true))
      removeWorkoutExercise(we.id);
  };

  const columns = columnsFor(ex);

  return (
    <Card style={{ gap: space.sm, paddingHorizontal: space.md }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.xs }}>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })}>
          <Txt variant="h3" color={c.accent} numberOfLines={1}>
            {ex.name}
          </Txt>
          <Txt variant="small">
            {we.target ? `Doel ${we.target}` : ex.muscle}
            {ex.kind !== 'cardio' ? ` · rust ${clock(restSec)}` : ''}
          </Txt>
        </Pressable>
        <IconButton icon="more" label={`Opties voor ${ex.name}`} onPress={remove} size={32} />
      </Row>

      <View style={styles.headerRow}>
        <Txt variant="label" style={styles.colSet}>
          Set
        </Txt>
        <Txt variant="label" style={styles.colPrev}>
          Vorige
        </Txt>
        {columns.map((col) => (
          <Txt key={col.key} variant="label" style={[styles.colInput, { textAlign: 'center' }]}>
            {col.label}
          </Txt>
        ))}
        <View style={styles.colCheck} />
      </View>

      {we.sets.map((s, i) => {
        const p = prev[i];
        return (
          <View
            key={s.id}
            style={[styles.setRow, { backgroundColor: s.done ? c.successSoft : 'transparent' }]}>
            <Pressable
              style={styles.colSet}
              accessibilityLabel={`Set ${i + 1} verwijderen`}
              onLongPress={() => removeSet(we.id, s.id)}
              delayLongPress={350}>
              <Txt variant="num" style={{ textAlign: 'center' }}>
                {i + 1}
              </Txt>
            </Pressable>
            <Txt variant="small" numberOfLines={1} style={styles.colPrev}>
              {p ? setLabel(p, ex.kind) : '–'}
            </Txt>
            {columns.map((col) => (
              <NumberField
                key={col.key}
                style={styles.colInput}
                align="center"
                decimals={col.decimals}
                accessibilityLabel={`${col.label} set ${i + 1}`}
                value={s[col.key]}
                placeholder={placeholderFor(col.key, p, we.target)}
                onChange={(n) => updateSet(we.id, s.id, { [col.key]: n })}
              />
            ))}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: s.done }}
              accessibilityLabel={`Set ${i + 1} afvinken`}
              onPress={() => toggle(s, i)}
              hitSlop={4}
              style={[
                styles.colCheck,
                styles.check,
                { backgroundColor: s.done ? c.success : c.cardAlt },
              ]}>
              <Icon name="check" size={16} color={s.done ? '#FFFFFF' : c.textFaint} />
            </Pressable>
          </View>
        );
      })}

      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.xs }}>
        <Button
          label="Set"
          icon="plus"
          size="sm"
          variant="secondary"
          onPress={() => addSet(we.id)}
        />
        {showHint && we.sets.length > 0 ? (
          <Txt variant="small" style={{ flex: 1, textAlign: 'right' }}>
            Houd een setnummer ingedrukt om te verwijderen
          </Txt>
        ) : null}
      </Row>
    </Card>
  );
}

type Col = { key: 'weight' | 'reps' | 'duration' | 'distance'; label: string; decimals: boolean };

function columnsFor(ex: Exercise): Col[] {
  switch (ex.kind) {
    case 'weight':
      return [
        { key: 'weight', label: 'kg', decimals: true },
        { key: 'reps', label: 'reps', decimals: false },
      ];
    case 'bodyweight':
      return [
        { key: 'weight', label: '+kg', decimals: true },
        { key: 'reps', label: 'reps', decimals: false },
      ];
    case 'time':
      return [{ key: 'duration', label: 'sec', decimals: false }];
    case 'cardio':
      return [
        { key: 'distance', label: 'km', decimals: true },
        { key: 'duration', label: 'min', decimals: true },
      ];
  }
}

function placeholderFor(key: Col['key'], prev: WorkoutSet | undefined, target?: string) {
  const v = prev?.[key];
  if (v != null) return String(v).replace('.', ',');
  if ((key === 'reps' || key === 'duration') && target) return String(targetNumber(target) ?? '');
  return '';
}

function RestBar() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const rest = useStore((s) => s.rest);
  const adjustRest = useStore((s) => s.adjustRest);
  const clearRest = useStore((s) => s.clearRest);
  const now = useNow(250, !!rest);
  const notified = useRef<number | null>(null);

  const left = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (rest && left === 0 && notified.current !== rest.endsAt) {
      notified.current = rest.endsAt;
      success();
      const t = setTimeout(clearRest, 1500);
      return () => clearTimeout(t);
    }
  }, [left, rest, clearRest]);

  if (!rest) return null;

  return (
    <View
      style={[
        styles.restBar,
        {
          backgroundColor: c.text,
          bottom: Math.max(insets.bottom, space.md),
        },
      ]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Txt variant="label" color={c.bg} style={{ opacity: 0.7 }}>
            {left === 0 ? 'Rust voorbij' : 'Rust'}
          </Txt>
          <Txt variant="display" color={c.bg} style={{ fontSize: 34 }}>
            {clock(left)}
          </Txt>
        </View>
        <Row gap={space.sm}>
          <RestButton label="−15" onPress={() => adjustRest(-15)} />
          <RestButton label="+15" onPress={() => adjustRest(15)} />
          <RestButton label="Skip" onPress={clearRest} strong />
        </Row>
      </Row>
      <ProgressBar
        value={rest.duration - left}
        max={rest.duration}
        color={c.accent}
        trackColor="rgba(127,127,127,0.3)"
        height={6}
      />
    </View>
  );
}

function RestButton({
  label,
  onPress,
  strong,
}: {
  label: string;
  onPress: () => void;
  strong?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        height: 40,
        minWidth: 52,
        paddingHorizontal: 12,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: strong ? c.accent : 'rgba(127,127,127,0.25)',
        opacity: pressed ? 0.7 : 1,
      })}>
      <Txt variant="h3" color={strong ? c.onAccent : c.bg}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.xs },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.xs,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  colSet: { width: 28 },
  colPrev: { flex: 1.3 },
  colInput: { flex: 1 },
  colCheck: { width: 40 },
  check: { height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  restBar: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
