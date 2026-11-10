import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Button, Card, Chip, Field, HeaderButton, Row, Segmented, Txt, tap } from '@/components/ui';
import { BUILT_IN_EXERCISES, MUSCLE_GROUPS } from '@/data/exercises';
import { AppBackground } from '@/components/background';
import { space, useColors } from '@/lib/theme';
import type { Exercise, ExerciseKind, MuscleGroup } from '@/lib/types';
import { exerciseHistory } from '@/lib/workout-stats';
import { useStore } from '@/store/store';

type Mode = 'workout' | 'plan' | 'browse';

const KINDS: { key: ExerciseKind; label: string }[] = [
  { key: 'weight', label: 'Gewicht' },
  { key: 'bodyweight', label: 'Lichaam' },
  { key: 'time', label: 'Tijd' },
  { key: 'cardio', label: 'Cardio' },
];

export default function ExercisePicker() {
  const c = useColors();
  const params = useLocalSearchParams<{ mode?: Mode; planId?: string; dayId?: string }>();
  const mode: Mode = params.mode ?? 'browse';
  const customExercises = useStore((s) => s.customExercises);
  const workouts = useStore((s) => s.workouts);
  const addExercisesToWorkout = useStore((s) => s.addExercisesToWorkout);
  const addExercisesToPlanDay = useStore((s) => s.addExercisesToPlanDay);
  const addCustomExercise = useStore((s) => s.addCustomExercise);

  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState<MuscleGroup>('Borst');
  const [newKind, setNewKind] = useState<ExerciseKind>('weight');

  const all = [...BUILT_IN_EXERCISES, ...customExercises];
  const q = query.trim().toLowerCase();
  const list = all
    .filter((e) => (!muscle || e.muscle === muscle) && (!q || e.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));

  // How often each exercise was done, to show in browse mode.
  const counts = new Map<string, number>();
  for (const w of workouts)
    for (const we of w.exercises) counts.set(we.exerciseId, (counts.get(we.exerciseId) ?? 0) + 1);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const commit = (ids: string[]) => {
    if (!ids.length) return;
    if (mode === 'workout') addExercisesToWorkout(ids);
    if (mode === 'plan' && params.planId && params.dayId)
      addExercisesToPlanDay(params.planId, params.dayId, ids);
    close();
  };

  const press = (e: Exercise) => {
    if (mode === 'browse') {
      router.push({ pathname: '/exercise/[id]', params: { id: e.id } });
      return;
    }
    tap();
    setSelected((s) => (s.includes(e.id) ? s.filter((x) => x !== e.id) : [...s, e.id]));
  };

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const id = addCustomExercise({ name, muscle: newMuscle, kind: newKind });
    setCreating(false);
    setNewName('');
    setQuery('');
    setMuscle(null);
    if (mode !== 'browse') setSelected((s) => [...s, id]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppBackground />
      <Stack.Screen
        options={{
          title: mode === 'browse' ? 'Oefeningen' : 'Kies oefeningen',
          headerLeft: () => (
            <HeaderButton label={mode === 'browse' ? 'Sluit' : 'Annuleer'} onPress={close} />
          ),
          headerRight: () =>
            mode !== 'browse' ? (
              <HeaderButton
                strong
                label={`Voeg toe${selected.length ? ` (${selected.length})` : ''}`}
                disabled={!selected.length}
                onPress={() => commit(selected)}
              />
            ) : null,
        }}
      />

      <View style={{ padding: space.lg, paddingBottom: space.sm, gap: space.md }}>
        <Field
          placeholder="Zoek oefening…"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm }}>
          <Chip label="Alles" selected={!muscle} onPress={() => setMuscle(null)} />
          {MUSCLE_GROUPS.map((m) => (
            <Chip
              key={m}
              label={m}
              selected={muscle === m}
              onPress={() => setMuscle(muscle === m ? null : m)}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 120 }}
        ListHeaderComponent={
          creating ? (
            <Card style={{ marginBottom: space.md }}>
              <Txt variant="h3">Nieuwe oefening</Txt>
              <Field placeholder="Naam" value={newName} onChangeText={setNewName} autoFocus />
              <Txt variant="small">Spiergroep</Txt>
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                {MUSCLE_GROUPS.map((m) => (
                  <Chip
                    key={m}
                    label={m}
                    selected={newMuscle === m}
                    onPress={() => setNewMuscle(m)}
                  />
                ))}
              </Row>
              <Txt variant="small">Hoe log je deze oefening?</Txt>
              <Segmented options={KINDS} value={newKind} onChange={setNewKind} />
              <Row>
                <Button
                  label="Annuleer"
                  variant="secondary"
                  onPress={() => setCreating(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Opslaan"
                  onPress={create}
                  disabled={!newName.trim()}
                  style={{ flex: 1 }}
                />
              </Row>
            </Card>
          ) : (
            <Pressable
              onPress={() => {
                setCreating(true);
                setNewName(query);
                if (muscle) setNewMuscle(muscle);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                paddingVertical: space.md,
              }}>
              <Icon name="plus" size={16} color={c.accent} />
              <Txt variant="h3" color={c.accent}>
                Eigen oefening maken
              </Txt>
            </Pressable>
          )
        }
        ListEmptyComponent={
          <Txt variant="dim" style={{ textAlign: 'center', marginTop: space.xl }}>
            Geen oefeningen gevonden.
          </Txt>
        }
        renderItem={({ item }) => {
          const isSelected = selected.includes(item.id);
          const n = counts.get(item.id) ?? 0;
          const best =
            mode === 'browse' && n > 0 && item.kind === 'weight'
              ? Math.max(...exerciseHistory(workouts, item.id).map((h) => h.maxWeight))
              : 0;
          return (
            <Pressable
              onPress={() => press(item)}
              accessibilityRole={mode === 'browse' ? 'button' : 'checkbox'}
              accessibilityState={mode === 'browse' ? undefined : { checked: isSelected }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingVertical: 12,
                paddingHorizontal: space.md,
                marginBottom: 6,
                borderRadius: 14,
                backgroundColor: isSelected ? c.accentSoft : c.card,
                opacity: pressed ? 0.7 : 1,
              })}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="h3" numberOfLines={1}>
                  {item.name}
                </Txt>
                <Txt variant="small">
                  {item.muscle}
                  {item.custom ? ' · eigen' : ''}
                  {n > 0 ? ` · ${n}× gedaan` : ''}
                  {best > 0 ? ` · max ${String(best).replace('.', ',')} kg` : ''}
                </Txt>
              </View>
              {mode === 'browse' ? (
                <Icon name="chevronRight" size={14} color={c.textFaint} />
              ) : (
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected ? c.accent : c.cardAlt,
                  }}>
                  {isSelected ? <Icon name="check" size={14} color={c.onAccent} /> : null}
                </View>
              )}
            </Pressable>
          );
        }}
      />

      {mode !== 'browse' && selected.length > 0 ? (
        <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.xl }}>
          <Button
            size="lg"
            label={`Voeg ${selected.length} ${selected.length === 1 ? 'oefening' : 'oefeningen'} toe`}
            onPress={() => commit(selected)}
          />
        </View>
      ) : null}
    </View>
  );
}
