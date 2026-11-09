import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Sparkline } from '@/components/charts';
import { Icon } from '@/components/icon';
import { ActiveWorkoutBanner, CalorieRing, MacroBars } from '@/components/shared';
import { Button, Card, IconButton, Row, SectionTitle, Txt, TabScreen } from '@/components/ui';
import {
  addDays,
  dateKey,
  dayShort,
  greeting,
  longDate,
  num,
  parseDateKey,
  shortDate,
} from '@/lib/format';
import { sumMacros } from '@/lib/nutrition';
import { space, useColors } from '@/lib/theme';
import { startOfWeek, weekStreak } from '@/lib/workout-stats';
import { findExercise, nextPlanDay, useStore } from '@/store/store';

export default function TodayScreen() {
  const c = useColors();
  const workouts = useStore((s) => s.workouts);
  const plans = useStore((s) => s.plans);
  const activePlanId = useStore((s) => s.activePlanId);
  const activeWorkout = useStore((s) => s.activeWorkout);
  const customExercises = useStore((s) => s.customExercises);
  const foodLog = useStore((s) => s.foodLog);
  const goals = useStore((s) => s.goals);
  const water = useStore((s) => s.water);
  const bodyWeights = useStore((s) => s.bodyWeights);
  const startWorkout = useStore((s) => s.startWorkout);

  const today = dateKey();
  const plan = plans.find((p) => p.id === activePlanId);
  const nextDay = nextPlanDay(plan, workouts);

  // Week overview (Mon–Sun)
  const monday = startOfWeek();
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    return {
      key,
      label: dayShort(d),
      trained: workouts.some((w) => dateKey(w.startedAt) === key),
    };
  });
  const weekCount = workouts.filter((w) => w.startedAt >= monday.getTime()).length;
  const streak = weekStreak(workouts);

  const totals = sumMacros(foodLog.filter((e) => e.date === today));
  const glasses = water[today] ?? 0;

  const lastWeights = bodyWeights.slice(-14);
  const latest = bodyWeights[bodyWeights.length - 1];
  const monthAgo = addDays(today, -30);
  const reference = bodyWeights.find((b) => b.date >= monthAgo) ?? bodyWeights[0];
  const delta = latest && reference && latest.id !== reference.id ? latest.kg - reference.kg : null;

  const start = () => {
    if (activeWorkout) return router.push('/workout');
    if (plan && nextDay) startWorkout({ planId: plan.id, dayId: nextDay.id });
    else startWorkout();
    router.push('/workout');
  };

  return (
    <TabScreen
      title={greeting()}
      subtitle={longDate(new Date())}
      right={
        <Row gap={space.sm}>
          <IconButton
            icon="sparkles"
            label="Coach"
            bg={c.accentSoft}
            color={c.accent}
            onPress={() => router.push('/coach')}
          />
          <IconButton icon="settings" label="Instellingen" onPress={() => router.push('/goals')} />
        </Row>
      }>
      <ActiveWorkoutBanner />

      {!activeWorkout ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">{plan && nextDay ? 'Volgende training' : 'Trainen'}</Txt>
            {plan ? (
              <Txt variant="small" numberOfLines={1}>
                {plan.name}
              </Txt>
            ) : null}
          </Row>
          {plan && nextDay ? (
            <>
              <Txt variant="h2">{nextDay.name}</Txt>
              <View style={{ gap: 6 }}>
                {nextDay.exercises.slice(0, 4).map((pe) => (
                  <Row key={pe.id} style={{ justifyContent: 'space-between' }}>
                    <Txt variant="dim" numberOfLines={1} style={{ flex: 1 }}>
                      {findExercise(pe.exerciseId, customExercises)?.name ?? 'Oefening'}
                    </Txt>
                    <Txt variant="dim" style={{ fontVariant: ['tabular-nums'] }}>
                      {pe.sets} × {pe.target}
                    </Txt>
                  </Row>
                ))}
                {nextDay.exercises.length > 4 ? (
                  <Txt variant="small">+ {nextDay.exercises.length - 4} meer</Txt>
                ) : null}
              </View>
            </>
          ) : (
            <Txt variant="dim">
              Kies een schema bij Schema&apos;s, of start een lege training en voeg zelf oefeningen
              toe.
            </Txt>
          )}
          <Button
            label={plan && nextDay ? `Start ${nextDay.name}` : 'Start lege training'}
            icon="play"
            size="lg"
            onPress={start}
          />
        </Card>
      ) : null}

      <Card>
        <Row gap={space.md}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/coach')}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              opacity: pressed ? 0.7 : 1,
            })}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: c.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="sparkles" size={20} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Vraag je coach</Txt>
              <Txt variant="small">Over je training of voeding, of stuur een foto van je eten.</Txt>
            </View>
          </Pressable>
          <IconButton
            icon="camera"
            label="Maaltijd fotograferen"
            onPress={() => router.push({ pathname: '/coach', params: { attach: 'camera' } })}
          />
        </Row>
      </Card>

      <Card onPress={() => router.push('/train')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">Deze week</Txt>
          <Row gap={4}>
            <Icon name="flame" size={14} color={streak > 0 ? c.accent : c.textFaint} />
            <Txt variant="small" style={{ fontWeight: '600' }}>
              {streak} {streak === 1 ? 'week' : 'weken'} op rij
            </Txt>
          </Row>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          {week.map((d) => {
            const isToday = d.key === today;
            return (
              <View key={d.key} style={{ alignItems: 'center', gap: 6 }}>
                <Txt
                  variant="small"
                  style={isToday ? { color: c.text, fontWeight: '700' } : undefined}>
                  {d.label}
                </Txt>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: d.trained ? c.accent : c.cardAlt,
                    borderWidth: isToday && !d.trained ? 2 : 0,
                    borderColor: c.accent,
                  }}>
                  {d.trained ? <Icon name="check" size={16} color={c.onAccent} /> : null}
                </View>
              </View>
            );
          })}
        </Row>
        <Txt variant="dim">
          {weekCount === 0
            ? 'Nog geen training deze week.'
            : `${weekCount} ${weekCount === 1 ? 'training' : 'trainingen'} deze week.`}
        </Txt>
      </Card>

      <SectionTitle title="Voeding vandaag" />
      <Card onPress={() => router.push('/food')}>
        <Row gap={space.lg}>
          <CalorieRing eaten={totals.kcal} goal={goals.kcal} size={116} />
          <MacroBars totals={totals} goals={goals} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="dim">
            {num(totals.kcal, 0)} van {num(goals.kcal, 0)} kcal gegeten
          </Txt>
          <Row gap={4}>
            <Icon name="water" size={14} color={c.water} />
            <Txt variant="dim" style={{ fontVariant: ['tabular-nums'] }}>
              {glasses}/{goals.waterGlasses}
            </Txt>
          </Row>
        </Row>
      </Card>

      <SectionTitle title="Lichaamsgewicht" />
      <Card onPress={() => router.push('/weight')}>
        {latest ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Row gap={4} style={{ alignItems: 'baseline' }}>
                <Txt variant="display" style={{ fontSize: 34 }}>
                  {num(latest.kg)}
                </Txt>
                <Txt variant="dim">kg</Txt>
              </Row>
              <Txt variant="small">
                {shortDate(parseDateKey(latest.date))}
                {delta != null
                  ? ` · ${delta > 0 ? '+' : ''}${num(delta)} kg sinds ${shortDate(parseDateKey(reference!.date))}`
                  : ''}
              </Txt>
              {latest.composition?.fatPct != null ? (
                <Txt variant="small">
                  {num(latest.composition.fatPct, 1)}% vet
                  {latest.composition.muscleKg != null
                    ? ` · ${num(latest.composition.muscleKg, 1)} kg spiermassa`
                    : ''}
                </Txt>
              ) : null}
            </View>
            <Sparkline values={lastWeights.map((b) => b.kg)} color={c.accent} />
          </Row>
        ) : (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="dim" style={{ flex: 1 }}>
              Houd je gewicht bij om je voortgang te zien.
            </Txt>
            <Row gap={4}>
              <Icon name="plus" size={14} color={c.accent} />
              <Txt variant="h3" color={c.accent}>
                Weging
              </Txt>
            </Row>
          </Row>
        )}
      </Card>
    </TabScreen>
  );
}
