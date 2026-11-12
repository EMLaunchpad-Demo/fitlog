import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Sparkline } from '@/components/charts';
import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Divider,
  ListRow,
  Note,
  ProgressBar,
  Row,
  SectionTitle,
  Segmented,
  TabScreen,
  Txt,
  success,
} from '@/components/ui';
import { COACH_REQUESTS, askCoach } from '@/ai/shortcuts';
import { daysUntilReview, findPlateaus, plateauAdvice } from '@/lib/analysis';
import { dateKey, num, parseDateKey, shortDate } from '@/lib/format';
import { VOLUME_RANGE } from '@/lib/guidelines';
import { PHASE_LABEL, estimateEnergyUse, phaseProgress, phaseStatusText } from '@/lib/phase';
import { targetSleepMinutes, weekKey } from '@/lib/recovery';
import { weekReport, weeklyMuscleSets } from '@/lib/report';
import { hoursLabel } from '@/lib/time';
import { space, useColors } from '@/lib/theme';
import { weeklyAverages } from '@/lib/workout-stats';
import { useExerciseLookup, useStore } from '@/store/store';

type WeekChoice = 'deze' | 'vorige';

export default function ProgressScreen() {
  const c = useColors();
  const workouts = useStore((s) => s.workouts);
  const foodLog = useStore((s) => s.foodLog);
  const goals = useStore((s) => s.goals);
  const sleepLog = useStore((s) => s.sleepLog);
  const steps = useStore((s) => s.steps);
  const cardioLog = useStore((s) => s.cardioLog);
  const bodyWeights = useStore((s) => s.bodyWeights);
  const checkIns = useStore((s) => s.checkIns);
  const settings = useStore((s) => s.settings);
  const setGoals = useStore((s) => s.setGoals);
  const coachPlan = useStore((s) => s.coachPlan);
  const measures = useStore((s) => s.measures);
  const getExercise = useExerciseLookup();
  const [showPlan, setShowPlan] = useState(false);
  const [weekChoice, setWeekChoice] = useState<WeekChoice>('deze');

  const today = dateKey();
  const phase = settings.phase;
  const progress = phase ? phaseProgress(phase, bodyWeights, today) : null;

  const weekStart = weekKey(weekChoice === 'deze' ? 0 : 1);
  const data = { workouts, foodLog, goals, sleepLog, steps, cardioLog, bodyWeights, checkIns };
  const report = weekReport(weekStart, data);
  const before = weekReport(weekKey(weekChoice === 'deze' ? 1 : 2), data);
  const muscles = weeklyMuscleSets(workouts, weekStart, getExercise);
  const energy = estimateEnergyUse(foodLog, bodyWeights, 21, today);
  const targetSleep = targetSleepMinutes(settings.sleep);

  const reviewIn = coachPlan ? daysUntilReview(coachPlan, today) : null;
  const plateaus = findPlateaus(workouts, getExercise);
  const lastMeasure = measures[measures.length - 1];

  const weeks = weeklyAverages(bodyWeights, (b) => b.kg);
  const latestWeek = weeks[weeks.length - 1];
  const prevWeek = weeks[weeks.length - 2];
  const latest = bodyWeights[bodyWeights.length - 1];

  /** Applies the suggested kcal change; the difference goes to carbs. */
  const applyKcal = (delta: number) => {
    const kcal = goals.kcal + delta;
    const carbs = Math.max(0, Math.round((kcal - goals.protein * 4 - goals.fat * 9) / 4));
    setGoals({ kcal, carbs });
    success();
  };

  const weightDelta =
    report.avgWeight != null && before.avgWeight != null
      ? report.avgWeight - before.avgWeight
      : null;
  const rows: { label: string; value: string; detail?: string }[] = [
    {
      label: 'Trainingen',
      value: String(report.workouts),
      detail: report.sets ? `${report.sets} sets · ${num(report.volumeKg, 0)} kg` : undefined,
    },
    {
      label: 'Calorieën',
      value: report.avgKcal != null ? `${num(report.avgKcal, 0)} kcal` : '–',
      detail: report.foodDays
        ? `${report.kcalOnTarget} van ${report.foodDays} dagen binnen 10% van ${num(goals.kcal, 0)}`
        : 'geen volledige dagen gelogd',
    },
    {
      label: 'Eiwit',
      value: report.avgProtein != null ? `${num(report.avgProtein, 0)} g` : '–',
      detail: report.foodDays
        ? `${report.proteinOnTarget} van ${report.foodDays} dagen op doel (${goals.protein} g)`
        : undefined,
    },
    {
      label: 'Slaap',
      value: report.avgSleepMin != null ? hoursLabel(report.avgSleepMin) : '–',
      detail: report.sleepNights
        ? `${report.sleepNights} nachten · doel ${hoursLabel(targetSleep)}`
        : 'geen nachten gelogd',
    },
    {
      label: 'Stappen',
      value: report.avgSteps != null ? num(report.avgSteps, 0) : '–',
      detail: report.stepDays
        ? `gemiddeld over ${report.stepDays} dagen · doel ${num(settings.stepGoal, 0)}`
        : 'geen stappen gelogd',
    },
    {
      label: 'Cardio',
      value: `${report.cardioModerateEq} min`,
      detail: `${report.cardioSessions} sessies · doel ${settings.cardioGoalMin} min`,
    },
    {
      label: 'Gewicht',
      value: report.avgWeight != null ? `${num(report.avgWeight, 1)} kg` : '–',
      detail: report.weighIns
        ? `${report.weighIns} wegingen${weightDelta != null ? ` · ${weightDelta > 0 ? '+' : ''}${num(weightDelta, 2)} kg t.o.v. week ervoor` : ''}`
        : 'geen wegingen',
    },
  ];
  if (report.avgEnergy != null)
    rows.push({
      label: 'Energie',
      value: `${num(report.avgEnergy, 1)} / 5`,
      detail: `${report.checkIns} check-ins`,
    });

  return (
    <TabScreen title="Voortgang">
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.sm}>
            <Icon name="sparkles" size={14} color={c.accent} />
            <Txt variant="label">Mijn plan</Txt>
          </Row>
          {coachPlan ? (
            <Txt variant="small">van {shortDate(parseDateKey(coachPlan.date))}</Txt>
          ) : null}
        </Row>
        {coachPlan ? (
          <>
            <View style={{ gap: 6 }}>
              {coachPlan.focus.map((f, i) => (
                <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
                  <View style={{ marginTop: 4 }}>
                    <Icon name="target" size={13} color={c.accent} />
                  </View>
                  <Txt style={{ flex: 1 }}>{f}</Txt>
                </Row>
              ))}
            </View>
            <Txt variant="dim" numberOfLines={showPlan ? undefined : 4}>
              {coachPlan.summary}
            </Txt>
            <Pressable accessibilityRole="button" onPress={() => setShowPlan(!showPlan)}>
              <Txt variant="small" color={c.accent} style={{ fontWeight: '600' }}>
                {showPlan ? 'Minder tonen' : 'Hele analyse lezen'}
              </Txt>
            </Pressable>
            <Txt variant="small" color={reviewIn! <= 0 ? c.accent : undefined}>
              {reviewIn! <= 0
                ? 'Tijd voor een nieuwe analyse: je coach kijkt wat er veranderd is en stuurt bij.'
                : `Nieuwe analyse over ${reviewIn} ${reviewIn === 1 ? 'dag' : 'dagen'} (${shortDate(parseDateKey(coachPlan.reviewDate))}).`}
            </Txt>
            <Button
              label="Plan herzien"
              icon="sparkles"
              variant={reviewIn! <= 0 ? 'primary' : 'secondary'}
              onPress={() => askCoach(COACH_REQUESTS.review)}
            />
          </>
        ) : (
          <>
            <Txt variant="dim">
              Laat je coach je lichaam en je gegevens analyseren. Hij kiest zelf je fase en je
              voedingsdoelen, stuurt je training bij en kijkt om de twee weken opnieuw.
            </Txt>
            <Button
              label="Analyseer mijn lichaam"
              icon="sparkles"
              size="lg"
              onPress={() => askCoach(COACH_REQUESTS.analyse)}
            />
            <Txt variant="small">
              Hoe meer je logt (wegingen, taille, trainingen, voeding, slaap), hoe scherper de
              analyse.
            </Txt>
          </>
        )}
      </Card>

      {phase && progress ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">{PHASE_LABEL[phase.type]}</Txt>
            <Txt variant="small">
              {progress.ended
                ? 'afgelopen'
                : progress.totalDays
                  ? `dag ${Math.min(progress.dayNo, progress.totalDays)} van ${progress.totalDays}`
                  : `dag ${progress.dayNo}`}
            </Txt>
          </Row>
          {progress.totalDays ? (
            <ProgressBar value={progress.dayNo} max={progress.totalDays} color={c.accent} cap />
          ) : null}
          <Row>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="small">Sinds de start</Txt>
              <Txt variant="h2" style={{ fontVariant: ['tabular-nums'] }}>
                {progress.changeKg != null
                  ? `${progress.changeKg > 0 ? '+' : ''}${num(progress.changeKg, 1)} kg`
                  : '–'}
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="small">Tempo per week</Txt>
              <Txt variant="h2" style={{ fontVariant: ['tabular-nums'] }}>
                {progress.ratePct != null
                  ? `${progress.ratePct > 0 ? '+' : ''}${num(progress.ratePct, 2)}%`
                  : '–'}
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="small">Gepland</Txt>
              <Txt variant="h2" style={{ fontVariant: ['tabular-nums'] }}>
                {phase.ratePct > 0 ? '+' : ''}
                {num(phase.ratePct, 2)}%
              </Txt>
            </View>
          </Row>
          <Txt
            variant="dim"
            color={
              progress.status === 'op-koers'
                ? c.success
                : progress.status === 'veel-te-snel'
                  ? c.danger
                  : undefined
            }>
            {progress.ended
              ? `Deze fase liep tot ${shortDate(parseDateKey(phase.end!))}. Stel je volgende fase in: na een cut is een paar weken onderhoud een goede volgende stap.`
              : phaseStatusText(progress, phase)}
          </Txt>
          {!progress.ended && progress.daysLeft != null ? (
            <Txt variant="small">
              Nog {progress.daysLeft} {progress.daysLeft === 1 ? 'dag' : 'dagen'} tot{' '}
              {shortDate(parseDateKey(phase.end!))}
              {progress.startKg != null ? ` · gestart op ${num(progress.startKg, 1)} kg` : ''}
            </Txt>
          ) : null}
          <Row gap={space.sm}>
            {!progress.ended && progress.kcalAdjust !== 0 ? (
              <Button
                label={`Doel ${progress.kcalAdjust > 0 ? '+' : ''}${progress.kcalAdjust} kcal`}
                size="sm"
                onPress={() => applyKcal(progress.kcalAdjust)}
                style={{ flex: 1 }}
              />
            ) : null}
            {progress.ended ? (
              <Button
                label="Nieuw plan van je coach"
                icon="sparkles"
                size="sm"
                onPress={() => askCoach(COACH_REQUESTS.review)}
                style={{ flex: 1 }}
              />
            ) : null}
            <Button
              label="Fase aanpassen"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/phase')}
              style={{ flex: 1 }}
            />
          </Row>
        </Card>
      ) : (
        <Card>
          <Txt variant="label">Fase</Txt>
          <Txt variant="dim">
            Cut, onderhoud of bulk: je coach kiest de fase bij zijn analyse, of je stelt hem zelf in.
            De app vergelijkt daarna je gewichtstrend met het doeltempo.
          </Txt>
          <Button
            label="Zelf een fase instellen"
            icon="target"
            variant="secondary"
            onPress={() => router.push('/phase')}
          />
        </Card>
      )}

      <Card onPress={() => router.push('/weight')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">Gewicht</Txt>
          <Icon name="chevronRight" size={14} color={c.textFaint} />
        </Row>
        {latest ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Row gap={4} style={{ alignItems: 'baseline' }}>
                <Txt variant="display" style={{ fontSize: 34 }}>
                  {num(latestWeek?.avg ?? latest.kg, 1)}
                </Txt>
                <Txt variant="dim">kg weekgemiddelde</Txt>
              </Row>
              <Txt variant="small">
                {prevWeek && latestWeek
                  ? `${latestWeek.avg - prevWeek.avg > 0 ? '+' : ''}${num(latestWeek.avg - prevWeek.avg, 2)} kg t.o.v. vorige week · `
                  : ''}
                laatste weging {num(latest.kg, 1)} kg
              </Txt>
            </View>
            <Sparkline values={bodyWeights.slice(-21).map((b) => b.kg)} color={c.accent} />
          </Row>
        ) : (
          <Txt variant="dim">Nog geen wegingen. Weeg je elke ochtend voor het beste beeld.</Txt>
        )}
      </Card>

      <SectionTitle title="Weekrapport" />
      <Card>
        <Segmented
          options={[
            { key: 'deze' as WeekChoice, label: 'Deze week' },
            { key: 'vorige' as WeekChoice, label: 'Vorige week' },
          ]}
          value={weekChoice}
          onChange={setWeekChoice}
        />
        <View>
          {rows.map((r, i) => (
            <View key={r.label}>
              {i > 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between', paddingVertical: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Txt>{r.label}</Txt>
                  {r.detail ? <Txt variant="small">{r.detail}</Txt> : null}
                </View>
                <Txt variant="num">{r.value}</Txt>
              </Row>
            </View>
          ))}
        </View>
        <Button
          label="Bespreek deze week met je coach"
          icon="sparkles"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/coach',
              params: {
                text:
                  weekChoice === 'deze'
                    ? 'Maak een weekreview van deze week: wat ging goed, wat kan beter, en wat pas ik aan?'
                    : 'Maak een weekreview van vorige week: wat ging goed, wat kan beter, en wat pas ik aan?',
              },
            })
          }
        />
      </Card>

      <SectionTitle title="Sets per spiergroep" />
      <Card>
        {muscles.length ? (
          <View style={{ gap: space.md }}>
            {muscles.map((m) => (
              <View key={m.muscle} style={{ gap: 5 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="small" style={{ fontWeight: '600' }}>
                    {m.muscle}
                  </Txt>
                  <Txt
                    variant="small"
                    style={{ fontVariant: ['tabular-nums'] }}
                    color={m.sets >= VOLUME_RANGE[0] ? c.success : c.textDim}>
                    {m.sets} sets
                  </Txt>
                </Row>
                <ProgressBar value={m.sets} max={VOLUME_RANGE[1]} color={c.accent} height={6} cap />
              </View>
            ))}
          </View>
        ) : (
          <Txt variant="dim">
            {weekChoice === 'deze' ? 'Nog geen training deze week.' : 'Geen trainingen vorige week.'}
          </Txt>
        )}
        <Note>
          Richtlijn: {VOLUME_RANGE[0]}-{VOLUME_RANGE[1]} harde sets per spiergroep per week. Elke set
          telt alleen voor de hoofdspier van de oefening, dus biceps, triceps en billen krijgen meer
          werk dan hier staat.
        </Note>
      </Card>

      {energy ? (
        <Card>
          <Txt variant="label">Geschat verbruik</Txt>
          <Row gap={4} style={{ alignItems: 'baseline' }}>
            <Txt variant="display" style={{ fontSize: 34 }}>
              {num(energy.tdee, 0)}
            </Txt>
            <Txt variant="dim">kcal per dag</Txt>
          </Row>
          <Txt variant="dim">
            Je at gemiddeld {num(energy.avgIntake, 0)} kcal over {energy.loggedDays} gelogde dagen en
            je gewicht veranderde {energy.kgPerWeek > 0 ? '+' : ''}
            {num(energy.kgPerWeek, 2)} kg per week.
          </Txt>
          <Note>
            Een ruwe schatting: ze klopt alleen als je alles logt, en ze schuift mee met vocht in je
            lichaam. Gebruik ze als richting, niet als exact getal.
          </Note>
        </Card>
      ) : null}

      {plateaus.length ? (
        <>
          <SectionTitle title="Stagnatie" />
          <Card>
            {plateaus.slice(0, 4).map((p) => (
              <View key={p.exerciseId} style={{ gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
                    {p.name}
                  </Txt>
                  <Txt variant="small">{p.stalled} trainingen gelijk</Txt>
                </Row>
                <Txt variant="small">Laatst: {p.lastSets}</Txt>
              </View>
            ))}
            <Note>{plateauAdvice(phase?.type === 'cut')}</Note>
            <Button
              label="Vraag je coach om een oplossing"
              icon="sparkles"
              variant="secondary"
              onPress={() =>
                askCoach(
                  `Ik stagneer op ${plateaus
                    .slice(0, 3)
                    .map((p) => p.name)
                    .join(', ')}. Bekijk mijn geschiedenis en pas mijn schema aan waar dat helpt.`,
                )
              }
            />
          </Card>
        </>
      ) : null}

      <Card style={{ paddingVertical: space.sm, gap: 0 }}>
        <ListRow
          title="Lichaamsmaten"
          subtitle={
            lastMeasure?.waist
              ? `Taille ${num(lastMeasure.waist, 1)} cm · ${shortDate(parseDateKey(lastMeasure.date))}`
              : 'Taille en andere maten bijhouden'
          }
          left={<Icon name="target" size={20} color={c.accent} />}
          onPress={() => router.push('/body')}
        />
        <Divider />
        <ListRow
          title="Oefeningen & records"
          subtitle="Je voortgang per oefening"
          left={<Icon name="chart" size={20} color={c.accent} />}
          onPress={() => router.push({ pathname: '/exercises', params: { mode: 'browse' } })}
        />
        <Divider />
        <ListRow
          title="Waarom deze cijfers?"
          subtitle="De onderbouwing van je doelen"
          left={<Icon name="book" size={20} color={c.accent} />}
          onPress={() => router.push('/guide')}
        />
      </Card>
    </TabScreen>
  );
}
