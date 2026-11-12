import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  HeaderButton,
  ListRow,
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
import { PHASE_LABEL } from '@/lib/phase';
import { ageFromBirthYear } from '@/lib/recovery';
import { space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

const REST_CHOICES = [60, 90, 120, 180];
const DELOAD_CHOICES = [0, 4, 6, 8];
const BAR_CHOICES = [20, 15, 10];

export default function GoalsScreen() {
  const c = useColors();
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
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

  const [sex, setSex] = useState<Sex>(settings.sex);
  const [birthYear, setBirthYear] = useState<number | null>(settings.birthYear);
  const [height, setHeight] = useState<number | null>(settings.heightCm ?? 180);
  const [weight, setWeight] = useState<number | null>(lastWeight ?? 80);
  const [activity, setActivity] = useState<Activity>('gemiddeld');
  const [goalType, setGoalType] = useState<GoalType>(
    settings.phase?.type === 'cut'
      ? 'afvallen'
      : settings.phase?.type === 'bulk'
        ? 'aankomen'
        : 'onderhouden',
  );
  const [stepGoal, setStepGoal] = useState<number | null>(settings.stepGoal);
  const [cardioGoal, setCardioGoal] = useState<number | null>(settings.cardioGoalMin);
  const [deloadEvery, setDeloadEvery] = useState(settings.deloadEveryWeeks);
  const [barKg, setBarKg] = useState(settings.barKg);
  const age = ageFromBirthYear(birthYear) ?? 30;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const calculate = () => {
    if (!height || !weight) return;
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
    setSettings({
      sex,
      birthYear: ageFromBirthYear(birthYear) != null ? birthYear : null,
      heightCm: height && height >= 100 && height <= 250 ? Math.round(height) : settings.heightCm,
      stepGoal: stepGoal && stepGoal >= 1000 ? Math.round(stepGoal) : settings.stepGoal,
      cardioGoalMin: cardioGoal != null && cardioGoal >= 0 ? Math.round(cardioGoal) : settings.cardioGoalMin,
      deloadEveryWeeks: deloadEvery,
      barKg,
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
            label="Geboortejaar"
            value={birthYear}
            onChange={setBirthYear}
            decimals={false}
            placeholder="jjjj"
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
          Op basis van de Mifflin-St Jeor-formule{birthYear ? '' : ' (zonder geboortejaar reken ik met 30 jaar)'}.
          Eiwit 1,8 g per kg (2 g bij afvallen), vet 25% van je energie. Een schatting: stuur bij op
          basis van je gewichtsverloop bij Voortgang.
        </Txt>
      </Card>

      <SectionTitle title="Beweging" />
      <Card>
        <Row gap={space.sm}>
          <NumberField
            label="Stappen per dag"
            value={stepGoal}
            onChange={setStepGoal}
            decimals={false}
            style={{ flex: 1 }}
          />
          <NumberField
            label="Cardio per week (min)"
            value={cardioGoal}
            onChange={setCardioGoal}
            decimals={false}
            style={{ flex: 1 }}
          />
        </Row>
        <Txt variant="small">
          Cardiominuten op matige inspanning; zware minuten tellen dubbel.
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
        <Txt variant="small">Gewicht van de stang (voor de schijvenrekenaar)</Txt>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {BAR_CHOICES.map((kg) => (
            <Chip key={kg} label={`${kg} kg`} selected={barKg === kg} onPress={() => setBarKg(kg)} />
          ))}
        </Row>
        <Txt variant="small">Herinner me aan een deloadweek na</Txt>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {DELOAD_CHOICES.map((w) => (
            <Chip
              key={w}
              label={w === 0 ? 'Nooit' : `${w} weken`}
              selected={deloadEvery === w}
              onPress={() => setDeloadEvery(w)}
            />
          ))}
        </Row>
      </Card>

      <SectionTitle title="Meer instellen" />
      <Card style={{ paddingVertical: space.sm, gap: 0 }}>
        <ListRow
          title="Slaapschema"
          subtitle={`${settings.sleep.bedtime} – ${settings.sleep.wake}`}
          left={<Icon name="moon" size={20} color={c.accent} />}
          onPress={() => router.push('/sleep')}
        />
        <Divider />
        <ListRow
          title="Fase"
          subtitle={settings.phase ? PHASE_LABEL[settings.phase.type] : 'Cut, onderhoud of bulk'}
          left={<Icon name="target" size={20} color={c.accent} />}
          onPress={() => router.push('/phase')}
        />
        <Divider />
        <ListRow
          title="Coach"
          subtitle="API-key, profiel en model"
          left={<Icon name="sparkles" size={20} color={c.accent} />}
          onPress={() => router.push('/coach-settings')}
        />
        <Divider />
        <ListRow
          title="Persoonlijke setup laden"
          subtitle="Alles in één keer instellen met een setup-code"
          left={<Icon name="download" size={20} color={c.accent} />}
          onPress={() => router.push('/setup')}
        />
      </Card>

      <SectionTitle title="Gegevens" />
      <Card>
        <Txt variant="small">
          Maak af en toe een back-up van al je trainingen, voeding, wegingen, slaap, cardio,
          schema&apos;s en je profiel. Je API-key zit er niet in.
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
