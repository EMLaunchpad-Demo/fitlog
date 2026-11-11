import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BarChart } from '@/components/charts';
import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  HeaderButton,
  Note,
  NumberField,
  ProgressBar,
  Row,
  SectionTitle,
  Segmented,
  StackScroll,
  Stat,
  Txt,
  success,
} from '@/components/ui';
import {
  CARDIO_KINDS,
  INTENSITIES,
  cardioKcal,
  cardioKind,
  heartRateZones,
  paceLabel,
  weekCardio,
  weekSteps,
} from '@/lib/cardio';
import { addDays, dateKey, dayShort, num, parseDateKey, relativeDay } from '@/lib/format';
import { ageFromBirthYear, weekKey } from '@/lib/recovery';
import { space, useColors } from '@/lib/theme';
import type { CardioKind, Intensity } from '@/lib/types';
import { useStore } from '@/store/store';

export default function CardioScreen() {
  const c = useColors();
  const cardioLog = useStore((s) => s.cardioLog);
  const steps = useStore((s) => s.steps);
  const settings = useStore((s) => s.settings);
  const weightKg = useStore((s) => s.bodyWeights[s.bodyWeights.length - 1]?.kg ?? null);
  const addCardio = useStore((s) => s.addCardio);
  const removeCardio = useStore((s) => s.removeCardio);
  const setSteps = useStore((s) => s.setSteps);

  const today = dateKey();
  const yesterday = addDays(today, -1);
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<CardioKind>('wandelen');
  const [intensity, setIntensity] = useState<Intensity>('matig');
  const [minutes, setMinutes] = useState<number | null>(30);
  const [distance, setDistance] = useState<number | null>(null);
  const [avgHr, setAvgHr] = useState<number | null>(null);
  const [stepsToday, setStepsToday] = useState<number | null>(steps[today] ?? null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/train'));
  const valid = minutes != null && minutes >= 1 && minutes <= 600;
  const draft = { kind, intensity, minutes: minutes ?? 0 };
  const estimate = valid ? cardioKcal(draft, weightKg) : null;

  const save = () => {
    if (!valid) return;
    addCardio({
      date,
      kind,
      intensity,
      minutes: Math.round(minutes!),
      ...(distance ? { distanceKm: distance } : {}),
      ...(avgHr ? { avgHr: Math.round(avgHr) } : {}),
    });
    success();
    setDistance(null);
    setAvgHr(null);
  };

  const thisWeek = weekKey(0);
  const week = weekCardio(cardioLog, thisWeek);
  const stepWeek = weekSteps(steps, thisWeek);
  const age = ageFromBirthYear(settings.birthYear);
  const zones = age ? heartRateZones(age) : null;
  const hint = INTENSITIES.find((i) => i.key === intensity)?.hint;

  const stepDays = Array.from({ length: 14 }, (_, i) => {
    const key = addDays(today, i - 13);
    return { key, steps: steps[key] ?? null };
  });
  const history = [...cardioLog].reverse().slice(0, 40);

  return (
    <StackScroll>
      <Stack.Screen
        options={{ headerLeft: () => <HeaderButton label="Sluit" onPress={close} /> }}
      />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">Deze week</Txt>
          <Txt variant="small">
            doel {settings.cardioGoalMin} min · {num(settings.stepGoal, 0)} stappen
          </Txt>
        </Row>
        <Row>
          <Stat label="Cardio" value={String(week.moderateEq)} unit="min" />
          <Stat label="Sessies" value={String(week.sessions)} />
          <Stat
            label="Stappen gem."
            value={stepWeek.days ? num(stepWeek.avg, 0) : '–'}
          />
        </Row>
        <ProgressBar value={week.moderateEq} max={settings.cardioGoalMin} color={c.accent} cap />
        <Note>
          Matige minuten tellen één keer, zware dubbel, lichte niet: zo rekenen de
          beweegrichtlijnen ook. Wandelen op een rustig tempo telt wel mee voor je stappen.
        </Note>
      </Card>

      <SectionTitle title="Stappen" />
      <Card>
        <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
          <NumberField
            label="Stappen vandaag"
            value={stepsToday}
            onChange={setStepsToday}
            decimals={false}
            placeholder="0"
            style={{ flex: 1 }}
          />
          <Button
            label="Bewaar"
            variant="secondary"
            disabled={stepsToday == null}
            onPress={() => {
              setSteps(today, stepsToday ?? 0);
              success();
            }}
          />
        </Row>
        <ProgressBar value={steps[today] ?? 0} max={settings.stepGoal} color={c.accent} cap />
        {stepDays.some((d) => d.steps != null) ? (
          <BarChart
            values={stepDays.map((d) => d.steps)}
            labels={stepDays.map((d) => dayShort(parseDateKey(d.key)))}
            target={settings.stepGoal}
            color={c.accent}
            height={110}
          />
        ) : null}
        <Button
          label="Screenshot van je stappen"
          icon="image"
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: '/coach',
              params: { attach: 'library', text: 'Log mijn stappen van deze screenshot.' },
            })
          }
        />
      </Card>

      <SectionTitle title="Cardio loggen" />
      <Card>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {CARDIO_KINDS.map((k) => (
            <Chip
              key={k.key}
              label={k.label}
              selected={kind === k.key}
              onPress={() => setKind(k.key)}
            />
          ))}
        </Row>
        <Segmented
          options={INTENSITIES.map((i) => ({ key: i.key, label: i.label }))}
          value={intensity}
          onChange={setIntensity}
        />
        <Txt variant="small">
          {hint ? `${hint[0].toUpperCase()}${hint.slice(1)}.` : ''}
          {intensity === 'matig' && zones
            ? ` Voor jou ongeveer ${zones.zone2[0]}-${zones.zone2[1]} slagen per minuut.`
            : ''}
        </Txt>
        <Row gap={space.sm}>
          <NumberField
            label="Minuten"
            value={minutes}
            onChange={setMinutes}
            decimals={false}
            style={{ flex: 1 }}
          />
          <NumberField
            label="Afstand (km)"
            value={distance}
            onChange={setDistance}
            placeholder="–"
            style={{ flex: 1 }}
          />
          <NumberField
            label="Gem. hartslag"
            value={avgHr}
            onChange={setAvgHr}
            decimals={false}
            placeholder="–"
            style={{ flex: 1 }}
          />
        </Row>
        <Row gap={space.sm}>
          <Chip label="Vandaag" selected={date === today} onPress={() => setDate(today)} />
          <Chip
            label="Gisteren"
            selected={date === yesterday}
            onPress={() => setDate(yesterday)}
          />
          {estimate != null ? (
            <Txt variant="small" style={{ flex: 1, textAlign: 'right' }}>
              ≈ {num(estimate, 0)} kcal
            </Txt>
          ) : null}
        </Row>
        <Button label="Cardio opslaan" size="lg" disabled={!valid} onPress={save} />
      </Card>

      {history.length ? (
        <>
          <SectionTitle title="Geschiedenis" />
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {history.map((s, i) => {
              const k = cardioKind(s.kind);
              const kcal = cardioKcal(s, weightKg);
              const pace = paceLabel(s);
              return (
                <View key={s.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row gap={space.md} style={{ paddingVertical: space.md }}>
                    <Icon name={k.icon} size={18} color={c.accent} />
                    <View style={{ flex: 1 }}>
                      <Txt>
                        {k.label} · {s.minutes} min
                      </Txt>
                      <Txt variant="small">
                        {[
                          relativeDay(s.date),
                          s.intensity,
                          s.distanceKm ? `${num(s.distanceKm, 2)} km` : null,
                          pace,
                          s.avgHr ? `${s.avgHr} bpm` : null,
                          kcal != null ? `${s.kcal != null ? '' : '≈ '}${num(kcal, 0)} kcal` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Txt>
                    </View>
                    <Pressable
                      onPress={() => removeCardio(s.id)}
                      hitSlop={8}
                      accessibilityLabel={`${k.label} van ${relativeDay(s.date)} verwijderen`}>
                      <Icon name="close" size={14} color={c.textFaint} />
                    </Pressable>
                  </Row>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </StackScroll>
  );
}
