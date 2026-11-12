import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Sparkline } from '@/components/charts';
import { Icon } from '@/components/icon';
import { ActiveWorkoutBanner, CalorieRing, MacroBars } from '@/components/shared';
import {
  Button,
  Card,
  IconButton,
  Row,
  SectionTitle,
  Tile,
  Txt,
  TabScreen,
  tap,
} from '@/components/ui';
import { weekCardio } from '@/lib/cardio';
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
import { useNow } from '@/lib/hooks';
import { sumMacros } from '@/lib/nutrition';
import { PHASE_LABEL, phaseProgress } from '@/lib/phase';
import {
  READINESS_LABEL,
  dayPlan,
  deloadStatus,
  minutesUntil,
  readiness,
  sleepMinutes,
  targetSleepMinutes,
  weekKey,
} from '@/lib/recovery';
import { hoursLabel } from '@/lib/time';
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
  const settings = useStore((s) => s.settings);
  const sleepLog = useStore((s) => s.sleepLog);
  const checkIns = useStore((s) => s.checkIns);
  const steps = useStore((s) => s.steps);
  const cardioLog = useStore((s) => s.cardioLog);
  const habits = useStore((s) => s.habits);
  const habitLog = useStore((s) => s.habitLog);
  const toggleHabit = useStore((s) => s.toggleHabit);
  const now = new Date(useNow(60_000));

  const today = dateKey(now);
  const plan = plans.find((p) => p.id === activePlanId);
  const nextDay = nextPlanDay(plan, workouts);

  // Rest, recovery and movement
  const day = dayPlan(settings, workouts, plan, now);
  const deload = deloadStatus(settings, workouts, now);
  const targetSleep = targetSleepMinutes(settings.sleep);
  const lastNight = sleepLog.find((e) => e.date === today);
  const checkIn = checkIns.find((x) => x.date === today);
  const ready = readiness(checkIn, lastNight, targetSleep);
  const stepsToday = steps[today] ?? 0;
  const cardioWeek = weekCardio(cardioLog, weekKey(0, now));
  const todaysWorkout = workouts.find((w) => dateKey(w.startedAt) === today);
  const doneHabits = habitLog[today] ?? [];
  const phase = settings.phase;
  const phaseNow = phase ? phaseProgress(phase, bodyWeights, today) : null;

  // Evening: count down to screens off and lights out.
  const untilScreens = settings.sleep.screensOff ? minutesUntil(settings.sleep.screensOff, now) : null;
  const untilBed = minutesUntil(settings.sleep.bedtime, now);
  const windDown = untilBed <= 120 && untilBed > -90;

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

      {windDown ? (
        <Card tone="alt" onPress={() => router.push('/sleep')}>
          <Row gap={space.md}>
            <Icon name="moon" size={20} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">
                {untilBed > 0
                  ? `Licht uit over ${hoursLabel(untilBed)}`
                  : `Bedtijd was om ${settings.sleep.bedtime}`}
              </Txt>
              <Txt variant="small">
                {untilScreens != null && untilScreens > 0
                  ? `Schermen uit over ${hoursLabel(untilScreens)} (${settings.sleep.screensOff}) · `
                  : untilScreens != null && untilBed > 0
                    ? 'Schermen horen nu uit te zijn · '
                    : ''}
                op om {settings.sleep.wake}
              </Txt>
            </View>
          </Row>
        </Card>
      ) : null}

      {!activeWorkout && day.kind === 'train' ? (
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
              Kies een schema bij Trainen, of start een lege training en voeg zelf oefeningen toe.
            </Txt>
          )}
          {deload.active ? (
            <Txt variant="small" color={c.accent} style={{ fontWeight: '600' }}>
              Deloadweek: de helft van je sets, 3-4 reps in reserve.
            </Txt>
          ) : deload.due ? (
            <Txt variant="small">
              {deload.weeksSince} weken zonder deload: voel je je moe, plan dan een lichte week bij
              Herstel.
            </Txt>
          ) : ready?.level === 'laag' ? (
            <Txt variant="small">
              Weinig hersteld vandaag: hou het licht of schuif de training een dag op.
            </Txt>
          ) : null}
          <Button
            label={plan && nextDay ? `Start ${nextDay.name}` : 'Start lege training'}
            icon="play"
            size="lg"
            onPress={start}
          />
        </Card>
      ) : null}


      {!activeWorkout && day.kind === 'rest' ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">Vandaag</Txt>
            <Txt variant="small">
              {day.reason === 'vast' ? 'vaste rustdag' : 'weekdoel gehaald'}
            </Txt>
          </Row>
          <Row gap={space.md}>
            <Icon name="rest" size={26} color={c.accent} />
            <Txt variant="h2">Rustdag</Txt>
          </Row>
          <Txt variant="dim">
            Spieren groeien tussen je trainingen. Wandel je stappen vol, eet op je doel (eiwit blijft
            even belangrijk) en ga op tijd slapen.
            {plan && nextDay ? ` Volgende training: ${nextDay.name}.` : ''}
          </Txt>
          <Row gap={space.sm}>
            <Button
              label="Cardio of wandeling"
              icon="walk"
              variant="secondary"
              onPress={() => router.push('/cardio')}
              style={{ flex: 1 }}
            />
            <Button label="Toch trainen" variant="ghost" onPress={start} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : null}

      {!activeWorkout && day.kind === 'done' && todaysWorkout ? (
        <Card onPress={() => router.push(`/history/${todaysWorkout.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">Training gedaan</Txt>
            <Icon name="check" size={16} color={c.success} />
          </Row>
          <Txt variant="h2">{todaysWorkout.name}</Txt>
          <Txt variant="dim">
            Goed bezig. Eet je eiwit, drink genoeg en slaap op tijd: daar zit je herstel.
            {plan && nextDay ? ` Volgende training: ${nextDay.name}.` : ''}
          </Txt>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Tile
          icon="heart"
          label="Herstel"
          value={ready ? String(ready.score) : 'Check-in'}
          unit={ready ? '/ 100' : undefined}
          detail={
            ready
              ? `${READINESS_LABEL[ready.level]}${checkIn ? '' : ' · doe je check-in'}`
              : 'Hoe voel je je vandaag?'
          }
          color={
            !ready ? undefined : ready.level === 'goed' ? c.success : ready.level === 'laag' ? c.danger : c.carbs
          }
          progress={ready ? ready.score / 100 : 0}
          onPress={() => router.push(checkIn ? '/recovery' : '/checkin')}
        />
        <Tile
          icon="moon"
          label="Slaap"
          value={lastNight ? hoursLabel(sleepMinutes(lastNight)) : 'Log nacht'}
          detail={`doel ${hoursLabel(targetSleep)}`}
          progress={lastNight ? Math.min(1, sleepMinutes(lastNight) / targetSleep) : 0}
          onPress={() => router.push('/sleep')}
        />
        <Tile
          icon="walk"
          label="Stappen"
          value={stepsToday ? num(stepsToday, 0) : 'Log'}
          detail={`doel ${num(settings.stepGoal, 0)}`}
          progress={Math.min(1, stepsToday / settings.stepGoal)}
          onPress={() => router.push('/cardio')}
        />
        <Tile
          icon="run"
          label="Cardio"
          value={String(cardioWeek.moderateEq)}
          unit="min"
          detail={`van ${settings.cardioGoalMin} min deze week`}
          progress={Math.min(1, cardioWeek.moderateEq / settings.cardioGoalMin)}
          onPress={() => router.push('/cardio')}
        />
      </View>

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
              <Txt variant="small">
                Over training, voeding, slaap of herstel, of stuur een foto van je eten.
              </Txt>
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

      {habits.length ? (
        <>
          <SectionTitle title="Gewoontes" />
          <Card>
            {habits.map((h) => {
              const checked = doneHabits.includes(h.id);
              return (
                <Pressable
                  key={h.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={h.name}
                  onPress={() => {
                    tap();
                    toggleHabit(today, h.id);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: checked ? c.accent : c.cardAlt,
                      borderWidth: checked ? 0 : 1.5,
                      borderColor: c.textFaint,
                    }}>
                    {checked ? <Icon name="check" size={14} color={c.onAccent} /> : null}
                  </View>
                  <Txt style={{ flex: 1 }}>{h.name}</Txt>
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}

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
              {phase && phaseNow && !phaseNow.ended ? (
                <Txt variant="small" color={c.accent} style={{ fontWeight: '600' }}>
                  {PHASE_LABEL[phase.type]}
                  {phaseNow.totalDays ? ` · dag ${phaseNow.dayNo} van ${phaseNow.totalDays}` : ''}
                  {phaseNow.ratePct != null
                    ? ` · ${phaseNow.ratePct > 0 ? '+' : ''}${num(phaseNow.ratePct, 2)}% per week`
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
