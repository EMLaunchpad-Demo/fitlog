import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  HeaderButton,
  NumberField,
  Row,
  SectionTitle,
  Segmented,
  StackScroll,
  Txt,
  confirm,
  notify,
  success,
} from '@/components/ui';
import { exportBackup, pickBackupFile, restoreBackup, summarizeBackup } from '@/lib/backup';
import { num } from '@/lib/format';
import { ACTIVITY, type Activity, type GoalType, type Sex, calculateGoals } from '@/lib/nutrition';
import { space } from '@/lib/theme';
import { useStore } from '@/store/store';

const REST_CHOICES = [60, 90, 120, 180];

export default function GoalsScreen() {
  const goals = useStore((s) => s.goals);
  const setGoals = useStore((s) => s.setGoals);
  const defaultRestSec = useStore((s) => s.defaultRestSec);
  const setDefaultRest = useStore((s) => s.setDefaultRest);
  const lastWeight = useStore((s) => s.bodyWeights[s.bodyWeights.length - 1]?.kg ?? null);

  const [kcal, setKcal] = useState<number | null>(goals.kcal);
  const [protein, setProtein] = useState<number | null>(goals.protein);
  const [carbs, setCarbs] = useState<number | null>(goals.carbs);
  const [fat, setFat] = useState<number | null>(goals.fat);
  const [water, setWater] = useState<number | null>(goals.waterGlasses);

  const [sex, setSex] = useState<Sex>('man');
  const [age, setAge] = useState<number | null>(30);
  const [height, setHeight] = useState<number | null>(180);
  const [weight, setWeight] = useState<number | null>(lastWeight ?? 80);
  const [activity, setActivity] = useState<Activity>('gemiddeld');
  const [goalType, setGoalType] = useState<GoalType>('onderhouden');

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const calculate = () => {
    if (!age || !height || !weight) return;
    const r = calculateGoals({
      sex,
      age,
      heightCm: height,
      weightKg: weight,
      activity,
      goal: goalType,
    });
    setKcal(r.kcal);
    setProtein(r.protein);
    setCarbs(r.carbs);
    setFat(r.fat);
  };

  const save = () => {
    setGoals({
      kcal: kcal ?? goals.kcal,
      protein: protein ?? goals.protein,
      carbs: carbs ?? goals.carbs,
      fat: fat ?? goals.fat,
      waterGlasses: water ?? goals.waterGlasses,
    });
    success();
    close();
  };

  const macroKcal = (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9;

  return (
    <StackScroll>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderButton label="Annuleer" onPress={close} />,
          headerRight: () => <HeaderButton label="Bewaar" strong onPress={save} />,
        }}
      />

      <SectionTitle title="Dagelijkse doelen" />
      <Card>
        <NumberField label="Calorieën (kcal)" value={kcal} onChange={setKcal} decimals={false} />
        <Row gap={space.sm}>
          <NumberField
            label="Eiwit (g)"
            value={protein}
            onChange={setProtein}
            decimals={false}
            style={{ flex: 1 }}
          />
          <NumberField
            label="Koolh. (g)"
            value={carbs}
            onChange={setCarbs}
            decimals={false}
            style={{ flex: 1 }}
          />
          <NumberField
            label="Vet (g)"
            value={fat}
            onChange={setFat}
            decimals={false}
            style={{ flex: 1 }}
          />
        </Row>
        <Txt variant="small">
          Macro&apos;s samen: {num(macroKcal, 0)} kcal
          {kcal && Math.abs(macroKcal - kcal) > 50
            ? ` (wijkt ${num(Math.abs(macroKcal - kcal), 0)} kcal af van je doel)`
            : ''}
        </Txt>
        <NumberField
          label="Water (glazen van 250 ml)"
          value={water}
          onChange={setWater}
          decimals={false}
        />
      </Card>

      <SectionTitle title="Bereken voor mij" />
      <Card>
        <Segmented
          options={[
            { key: 'man' as Sex, label: 'Man' },
            { key: 'vrouw' as Sex, label: 'Vrouw' },
          ]}
          value={sex}
          onChange={setSex}
        />
        <Row gap={space.sm}>
          <NumberField
            label="Leeftijd"
            value={age}
            onChange={setAge}
            decimals={false}
            style={{ flex: 1 }}
          />
          <NumberField
            label="Lengte (cm)"
            value={height}
            onChange={setHeight}
            decimals={false}
            style={{ flex: 1 }}
          />
          <NumberField
            label="Gewicht (kg)"
            value={weight}
            onChange={setWeight}
            style={{ flex: 1 }}
          />
        </Row>
        <Txt variant="small">Activiteit</Txt>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {ACTIVITY.map((a) => (
            <Chip
              key={a.key}
              label={a.label}
              selected={activity === a.key}
              onPress={() => setActivity(a.key)}
            />
          ))}
        </Row>
        <Txt variant="small">Doel</Txt>
        <Segmented
          options={[
            { key: 'afvallen' as GoalType, label: 'Afvallen' },
            { key: 'onderhouden' as GoalType, label: 'Behouden' },
            { key: 'aankomen' as GoalType, label: 'Aankomen' },
          ]}
          value={goalType}
          onChange={setGoalType}
        />
        <Button label="Bereken doelen" variant="secondary" onPress={calculate} />
        <Txt variant="small">
          Op basis van de Mifflin-St Jeor-formule. Eiwit 1,8 g per kg (2 g bij afvallen), vet 25%
          van je energie. Een schatting: stuur bij op basis van je gewichtsverloop.
        </Txt>
      </Card>

      <SectionTitle title="Training" />
      <Card>
        <Txt variant="small">Standaard rusttijd (voor lege trainingen)</Txt>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {REST_CHOICES.map((s) => (
            <Chip
              key={s}
              label={`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
              selected={defaultRestSec === s}
              onPress={() => setDefaultRest(s)}
            />
          ))}
        </Row>
      </Card>

      <SectionTitle title="Gegevens" />
      <Card>
        <Txt variant="small">
          Maak af en toe een back-up van al je trainingen, voeding, wegingen, schema&apos;s en je
          profiel. Je API-key zit er niet in.
        </Txt>
        <Button
          label="Back-up maken"
          icon="history"
          variant="secondary"
          onPress={() =>
            exportBackup().catch(() => notify('Back-up', 'De back-up kon niet worden gemaakt.'))
          }
        />
        {Platform.OS === 'web' ? (
          <Button
            label="Back-up terugzetten"
            icon="repeat"
            variant="ghost"
            onPress={async () => {
              const json = await pickBackupFile();
              if (!json) return;
              const check = summarizeBackup(json);
              if (!check.ok) return notify('Back-up', check.error);
              const ok = await confirm(
                'Back-up terugzetten?',
                `Dit vervangt al je huidige gegevens door: ${check.summary}.`,
                'Terugzetten',
                true,
              );
              if (!ok) return;
              const result = restoreBackup(json);
              if (result.ok) {
                success();
                notify('Back-up', 'Je gegevens zijn teruggezet.');
              } else notify('Back-up', result.error);
            }}
          />
        ) : null}
      </Card>

      <View style={{ height: space.sm }} />
      <Button label="Bewaar doelen" size="lg" onPress={save} />
    </StackScroll>
  );
}
