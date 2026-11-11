import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Sparkline } from '@/components/charts';
import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Chip,
  Field,
  IconButton,
  Note,
  Ring,
  Row,
  SectionTitle,
  TabScreen,
  Txt,
  tap,
} from '@/components/ui';
import { addDays, dateKey } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import {
  READINESS_LABEL,
  WEEKDAYS,
  dayPlan,
  deloadStatus,
  minutesUntil,
  readiness,
  readinessAdvice,
  regularityLabel,
  sleepMinutes,
  sleepStats,
  targetSleepMinutes,
  weekKey,
  weekdayIndex,
} from '@/lib/recovery';
import { hoursLabel } from '@/lib/time';
import { space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

const HABIT_IDEAS = [
  'Schermen uit op tijd',
  '10 min mobiliteit',
  'Daglicht in de ochtend',
  'Groenten bij elke maaltijd',
];

export default function RecoveryScreen() {
  const c = useColors();
  const checkIns = useStore((s) => s.checkIns);
  const sleepLog = useStore((s) => s.sleepLog);
  const settings = useStore((s) => s.settings);
  const workouts = useStore((s) => s.workouts);
  const plans = useStore((s) => s.plans);
  const activePlanId = useStore((s) => s.activePlanId);
  const habits = useStore((s) => s.habits);
  const habitLog = useStore((s) => s.habitLog);
  const setSettings = useStore((s) => s.setSettings);
  const setDeloadWeek = useStore((s) => s.setDeloadWeek);
  const addHabit = useStore((s) => s.addHabit);
  const removeHabit = useStore((s) => s.removeHabit);
  const toggleHabit = useStore((s) => s.toggleHabit);
  const [newHabit, setNewHabit] = useState('');
  const [editHabits, setEditHabits] = useState(false);
  const now = new Date(useNow(60_000));

  const today = dateKey(now);
  const targetMin = targetSleepMinutes(settings.sleep);
  const checkIn = checkIns.find((x) => x.date === today);
  const lastNight = sleepLog.find((x) => x.date === today);
  const ready = readiness(checkIn, lastNight, targetMin);
  const plan = plans.find((p) => p.id === activePlanId);
  const day = dayPlan(settings, workouts, plan, now);
  const deload = deloadStatus(settings, workouts, now);
  const stats = sleepStats(sleepLog, targetMin, 7, today);
  const regular = stats ? regularityLabel(stats) : null;

  // Readiness of the last 14 days, for the trend line.
  const trend = Array.from({ length: 14 }, (_, i) => {
    const key = addDays(today, i - 13);
    return readiness(
      checkIns.find((x) => x.date === key),
      sleepLog.find((x) => x.date === key),
      targetMin,
    )?.score;
  }).filter((v): v is number => v != null);
  // There is no proven cut-off for a score like this, so compare with the user's own average.
  const earlier = ready ? trend.slice(0, -1) : trend;
  const baseline =
    earlier.length >= 3 ? Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length) : null;
  const vsBaseline = ready && baseline != null ? ready.score - baseline : null;
  const yesterdayLow =
    readiness(
      checkIns.find((x) => x.date === addDays(today, -1)),
      sleepLog.find((x) => x.date === addDays(today, -1)),
      targetMin,
    )?.level === 'laag';

  const monday = weekKey(0, now);
  const todayIndex = weekdayIndex(now);
  const week = WEEKDAYS.map((label, i) => {
    const key = addDays(monday, i);
    return {
      label,
      index: i,
      trained: workouts.some((w) => dateKey(w.startedAt) === key),
      rest: settings.restDays.includes(i),
    };
  });
  const toggleRestDay = (i: number) =>
    setSettings({
      restDays: settings.restDays.includes(i)
        ? settings.restDays.filter((d) => d !== i)
        : [...settings.restDays, i].sort(),
    });

  const done = habitLog[today] ?? [];
  const untilBed = minutesUntil(settings.sleep.bedtime, now);
  const ringColor = !ready
    ? c.accent
    : ready.level === 'goed'
      ? c.success
      : ready.level === 'redelijk'
        ? c.carbs
        : c.danger;

  const submitHabit = (name: string) => {
    if (!name.trim()) return;
    addHabit(name);
    setNewHabit('');
  };

  return (
    <TabScreen title="Herstel">
      <Card>
        <Row gap={space.lg}>
          <Ring value={ready?.score ?? 0} max={100} size={108} stroke={11} color={ringColor}>
            <Txt variant="h2" style={{ fontSize: 26, fontVariant: ['tabular-nums'] }}>
              {ready ? ready.score : '–'}
            </Txt>
            <Txt variant="small">van 100</Txt>
          </Ring>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="label">Herstel vandaag</Txt>
            <Txt variant="h2">{ready ? READINESS_LABEL[ready.level] : 'Nog geen check-in'}</Txt>
            <Txt variant="dim">
              {ready
                ? readinessAdvice(ready.level, day.kind === 'rest')
                : 'Vul je check-in in en log je nacht, dan zie je hoe hersteld je bent.'}
            </Txt>
          </View>
        </Row>
        {ready ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" style={{ flex: 1 }}>
              {[
                ready.wellnessScore != null ? `check-in ${ready.wellnessScore}` : 'geen check-in',
                ready.sleepScore != null ? `slaap ${ready.sleepScore}` : 'geen slaap gelogd',
                vsBaseline != null
                  ? vsBaseline === 0
                    ? 'gelijk aan je gemiddelde'
                    : `${Math.abs(vsBaseline)} ${vsBaseline > 0 ? 'boven' : 'onder'} je gemiddelde`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Txt>
            {trend.length > 1 ? (
              <Sparkline values={trend} color={c.accent} width={84} height={26} />
            ) : null}
          </Row>
        ) : null}
        {ready?.level === 'laag' && yesterdayLow ? (
          <Note>
            Twee dagen op rij weinig hersteld. Doe deze week minder sets of hou meer reps in reserve,
            en kijk eerst naar je slaap en of je genoeg eet.
          </Note>
        ) : null}
        <Button
          label={checkIn ? 'Check-in aanpassen' : 'Check-in doen'}
          icon={checkIn ? 'edit' : 'heart'}
          variant={checkIn ? 'secondary' : 'primary'}
          onPress={() => router.push('/checkin')}
        />
      </Card>

      <SectionTitle title="Slaap" />
      <Card onPress={() => router.push('/sleep')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.md}>
            <Icon name="moon" size={20} color={c.accent} />
            <View>
              <Txt variant="h3">
                {lastNight ? `${hoursLabel(sleepMinutes(lastNight))} geslapen` : 'Nacht loggen'}
              </Txt>
              <Txt variant="small">
                {lastNight
                  ? `${lastNight.bed} – ${lastNight.wake} · doel ${hoursLabel(targetMin)}`
                  : `Doel ${hoursLabel(targetMin)} · ${settings.sleep.bedtime} – ${settings.sleep.wake}`}
              </Txt>
            </View>
          </Row>
          <Icon name="chevronRight" size={14} color={c.textFaint} />
        </Row>
        {stats ? (
          <Txt variant="dim">
            Gemiddeld {hoursLabel(stats.avgMin)} over {stats.nights}{' '}
            {stats.nights === 1 ? 'nacht' : 'nachten'}
            {regular ? ` · ${regular.toLowerCase()}` : ''}
            {stats.debtMin >= 60 ? ` · ${hoursLabel(stats.debtMin)} tekort` : ''}
          </Txt>
        ) : null}
        <Row gap={6}>
          <Icon name="timer" size={14} color={c.textDim} />
          <Txt variant="small" style={{ flex: 1 }}>
            {settings.sleep.screensOff ? `Schermen uit ${settings.sleep.screensOff} · ` : ''}
            licht uit {settings.sleep.bedtime}
            {untilBed > 0 && untilBed <= 240 ? ` (over ${hoursLabel(untilBed)})` : ''} · op om{' '}
            {settings.sleep.wake}
          </Txt>
        </Row>
      </Card>

      <SectionTitle title="Rust" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="h3">
            {day.kind === 'done'
              ? 'Training gedaan'
              : day.kind === 'rest'
                ? 'Vandaag: rustdag'
                : 'Vandaag: trainingsdag'}
          </Txt>
          <Txt variant="small">
            {settings.restDays.length
              ? `${7 - settings.restDays.length}× trainen per week`
              : 'geen vaste rustdagen'}
          </Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          {week.map((d) => {
            const isToday = d.index === todayIndex;
            return (
              <Pressable
                key={d.label}
                accessibilityRole="button"
                accessibilityLabel={`${d.label}: ${d.rest ? 'rustdag' : 'trainingsdag'}`}
                onPress={() => {
                  tap();
                  toggleRestDay(d.index);
                }}
                style={{ alignItems: 'center', gap: 6 }}>
                <Txt
                  variant="small"
                  style={isToday ? { color: c.text, fontWeight: '700' } : undefined}>
                  {d.label}
                </Txt>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: d.trained ? c.accent : d.rest ? c.cardAlt : c.accentSoft,
                    borderWidth: isToday ? 2 : 0,
                    borderColor: c.accent,
                  }}>
                  {d.trained ? (
                    <Icon name="check" size={16} color={c.onAccent} />
                  ) : d.rest ? (
                    <Icon name="moon" size={14} color={c.textFaint} />
                  ) : (
                    <Icon name="dumbbell" size={14} color={c.accent} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </Row>
        <Txt variant="small">
          Tik op een dag om er een vaste rustdag van te maken. Op rustdagen krijg je op Vandaag
          hersteltips in plaats van een training.
        </Txt>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">Deload</Txt>
          <Txt variant="small">
            {deload.active
              ? 'deze week'
              : settings.deloadEveryWeeks
                ? `week ${Math.min(deload.weeksSince, 99)} van ${settings.deloadEveryWeeks}`
                : 'uit'}
          </Txt>
        </Row>
        <Txt variant="dim">
          {deload.active
            ? 'Deloadweek: je schema start met de helft van de sets. Zelfde gewichten, maar stop 3-4 reps voor falen.'
            : deload.due
              ? `Je traint ${deload.weeksSince} weken zonder deload. Voel je je moe of stagneren je gewichten, plan dan een lichte week.`
              : 'Een lichte week met ongeveer de helft van je sets, als je vermoeidheid opstapelt. Plan hem wanneer je hem nodig hebt, niet uit gewoonte.'}
        </Txt>
        <Button
          label={deload.active ? 'Deloadweek stoppen' : 'Start deloadweek'}
          variant={deload.due && !deload.active ? 'primary' : 'secondary'}
          onPress={() => setDeloadWeek(!deload.active)}
        />
      </Card>

      <SectionTitle
        title="Gewoontes"
        action={
          habits.length ? (
            <Pressable accessibilityRole="button" onPress={() => setEditHabits(!editHabits)}>
              <Txt variant="small" color={c.accent} style={{ fontWeight: '600' }}>
                {editHabits ? 'Klaar' : 'Wijzig'}
              </Txt>
            </Pressable>
          ) : undefined
        }
      />
      <Card>
        {habits.map((h) => {
          const checked = done.includes(h.id);
          return (
            <Row key={h.id} gap={space.md}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={h.name}
                onPress={() => {
                  tap();
                  toggleHabit(today, h.id);
                }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
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
              {editHabits ? (
                <IconButton
                  icon="trash"
                  label={`${h.name} verwijderen`}
                  size={30}
                  onPress={() => removeHabit(h.id)}
                />
              ) : null}
            </Row>
          );
        })}
        {!habits.length ? (
          <Txt variant="dim">
            Kleine dingen die je elke dag wilt afvinken. Kies er een paar of typ er zelf een.
          </Txt>
        ) : null}
        {!habits.length || editHabits ? (
          <>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {HABIT_IDEAS.filter((idea) => !habits.some((h) => h.name === idea)).map((idea) => (
                <Chip key={idea} label={`+ ${idea}`} onPress={() => addHabit(idea)} />
              ))}
            </Row>
            <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
              <Field
                label="Eigen gewoonte"
                value={newHabit}
                onChangeText={setNewHabit}
                placeholder="Bijv. 2 liter water"
                onSubmitEditing={() => submitHabit(newHabit)}
              />
              <Button
                label="Voeg toe"
                variant="secondary"
                disabled={!newHabit.trim()}
                onPress={() => submitHabit(newHabit)}
              />
            </Row>
          </>
        ) : null}
      </Card>

      <Card onPress={() => router.push('/guide')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.md} style={{ flex: 1 }}>
            <Icon name="book" size={20} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Waarom deze cijfers?</Txt>
              <Txt variant="small">De onderbouwing van je slaap-, trainings- en voedingsdoelen</Txt>
            </View>
          </Row>
          <Icon name="chevronRight" size={14} color={c.textFaint} />
        </Row>
      </Card>
      <Note>De herstelscore is een samenvatting van wat je zelf invult, geen meting.</Note>
    </TabScreen>
  );
}
