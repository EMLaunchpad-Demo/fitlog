import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Divider,
  HeaderButton,
  NumberField,
  Row,
  SectionTitle,
  Segmented,
  StackScroll,
  Txt,
  success,
} from '@/components/ui';
import { BODY_METRICS, type BodyMetric, fatAndLeanKg, hasComposition } from '@/lib/body';
import { dateKey, num, parseDateKey, relativeDay, shortDate } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import type { BodyComposition, BodyWeight } from '@/lib/types';
import { startOfWeek, weeklyAverages } from '@/lib/workout-stats';
import { useStore } from '@/store/store';

/** The values most scales show, offered for manual entry. */
const QUICK_FIELDS: BodyMetric[] = ['fatPct', 'muscleKg', 'waterPct', 'visceralFat'];

type ChartMetric = 'kg' | 'fatPct' | 'muscleKg';
const CHART_OPTIONS: { key: ChartMetric; label: string }[] = [
  { key: 'kg', label: 'Gewicht' },
  { key: 'fatPct', label: 'Vet %' },
  { key: 'muscleKg', label: 'Spiermassa' },
];

const valueOf = (b: BodyWeight, m: ChartMetric) => (m === 'kg' ? b.kg : b.composition?.[m]);
const metric = (key: BodyMetric) => BODY_METRICS.find((m) => m.key === key)!;
const fmtMetric = (key: BodyMetric, v: number) => {
  const m = metric(key);
  return `${num(v, m.decimals)}${m.unit ? (m.unit === '%' ? '%' : ` ${m.unit}`) : ''}`;
};

export default function WeightScreen() {
  const c = useColors();
  const bodyWeights = useStore((s) => s.bodyWeights);
  const logBodyWeight = useStore((s) => s.logBodyWeight);
  const removeBodyWeight = useStore((s) => s.removeBodyWeight);
  const last = bodyWeights[bodyWeights.length - 1];
  const today = dateKey();
  const todayEntry = bodyWeights.find((b) => b.date === today);
  const [kg, setKg] = useState<number | null>(last?.kg ?? null);
  const [showComposition, setShowComposition] = useState(false);
  const [composition, setComposition] = useState<BodyComposition>(todayEntry?.composition ?? {});
  const [chartMetric, setChartMetric] = useState<ChartMetric>('kg');

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const save = () => {
    if (!kg || kg < 20 || kg > 400) return;
    logBodyWeight(kg, today, hasComposition(composition) ? composition : undefined);
    success();
    close();
  };

  // Latest reading with body composition, and the one before it (for changes).
  const withComposition = bodyWeights.filter((b) => hasComposition(b.composition));
  const latestComp = withComposition[withComposition.length - 1];
  const prevComp = withComposition[withComposition.length - 2];
  const derived = latestComp ? fatAndLeanKg(latestComp.kg, latestComp.composition) : null;

  // Weekly averages of weight, fat % and muscle mass, newest first.
  const thisWeek = dateKey(startOfWeek());
  const weekLabel = (weekStart: string) =>
    weekStart === thisWeek ? 'Deze week' : `Week van ${shortDate(parseDateKey(weekStart))}`;
  const weeks = weeklyAverages(bodyWeights, (b) => b.kg)
    .slice(-6)
    .reverse();
  const fatWeeks = new Map(
    weeklyAverages(bodyWeights, (b) => b.composition?.fatPct).map((w) => [w.weekStart, w.avg]),
  );
  const muscleWeeks = new Map(
    weeklyAverages(bodyWeights, (b) => b.composition?.muscleKg).map((w) => [w.weekStart, w.avg]),
  );

  const chartOptions = CHART_OPTIONS.filter(
    (o) => bodyWeights.filter((b) => valueOf(b, o.key) != null).length > 1,
  );
  const activeChart = chartOptions.some((o) => o.key === chartMetric) ? chartMetric : 'kg';
  const chartPoints = bodyWeights.filter((b) => valueOf(b, activeChart) != null).slice(-30);

  return (
    <StackScroll>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderButton label="Sluit" onPress={close} />,
        }}
      />
      <Card>
        <Txt variant="label">Weging vandaag</Txt>
        <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
          <NumberField
            value={kg}
            onChange={setKg}
            placeholder="0,0"
            style={{ flex: 1 }}
            accessibilityLabel="Gewicht in kg"
          />
          <Txt variant="h3" style={{ paddingBottom: 12 }}>
            kg
          </Txt>
        </Row>

        <Pressable
          accessibilityRole="button"
          onPress={() => setShowComposition(!showComposition)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name={showComposition ? 'chevronUp' : 'chevronDown'} size={14} color={c.accent} />
          <Txt variant="h3" color={c.accent} style={{ fontSize: 15 }}>
            Lichaamssamenstelling (optioneel)
          </Txt>
        </Pressable>
        {showComposition ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {QUICK_FIELDS.map((key) => {
              const m = metric(key);
              return (
                <NumberField
                  key={key}
                  label={m.unit ? `${m.label} (${m.unit})` : m.label}
                  value={composition[key] ?? null}
                  onChange={(v) =>
                    setComposition((prev) => {
                      const next = { ...prev };
                      if (v == null) delete next[key];
                      else next[key] = v;
                      return next;
                    })
                  }
                  style={{ width: '48%' }}
                />
              );
            })}
          </View>
        ) : null}

        <Button label="Opslaan" size="lg" disabled={!kg} onPress={save} />
        <Button
          label="Screenshot van je weegschaal"
          icon="image"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/coach',
              params: { attach: 'library', text: 'Log deze weging van mijn weegschaal.' },
            })
          }
        />
        <Txt variant="small">
          De coach leest alle waarden van een screenshot uit bijvoorbeeld Fitdays af.
          {todayEntry ? ' Je hebt vandaag al gewogen; opslaan overschrijft die meting.' : ''}
        </Txt>
      </Card>

      {latestComp ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">Lichaamssamenstelling</Txt>
            <Txt variant="small">{relativeDay(latestComp.date)}</Txt>
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
            {BODY_METRICS.filter((m) => latestComp.composition?.[m.key] != null).map((m) => {
              const value = latestComp.composition![m.key]!;
              const before = prevComp?.composition?.[m.key];
              const change = before != null ? value - before : null;
              const better =
                change == null || change === 0 ? null : m.lowerIsBetter ? change < 0 : change > 0;
              return (
                <View key={m.key} style={{ width: '50%', gap: 2 }}>
                  <Txt variant="small">{m.label}</Txt>
                  <Row gap={6} style={{ alignItems: 'baseline' }}>
                    <Txt variant="h3" style={{ fontVariant: ['tabular-nums'] }}>
                      {fmtMetric(m.key, value)}
                    </Txt>
                    {change != null && change !== 0 ? (
                      <Txt variant="small" color={better ? c.success : c.textDim}>
                        {change > 0 ? '+' : ''}
                        {num(change, m.decimals)}
                      </Txt>
                    ) : null}
                  </Row>
                </View>
              );
            })}
          </View>
          {derived ? (
            <Txt variant="small">
              Vetmassa {num(derived.fatKg, 1)} kg · vetvrije massa {num(derived.leanKg, 1)} kg
              {prevComp ? ` · verschil t.o.v. ${relativeDay(prevComp.date).toLowerCase()}` : ''}
            </Txt>
          ) : null}
          <Txt variant="small">
            Een weegschaal schat vet en spieren via een zwakke stroom; vocht, eten en tijdstip
            beïnvloeden dat. Kijk daarom naar de weekgemiddelden hieronder.
          </Txt>
        </Card>
      ) : null}

      {weeks.length ? (
        <Card>
          <Txt variant="label">Weekgemiddelde</Txt>
          <Row style={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Row gap={4} style={{ alignItems: 'baseline' }}>
              <Txt variant="display" style={{ fontSize: 34 }}>
                {num(weeks[0].avg, 1)}
              </Txt>
              <Txt variant="dim">kg · {weekLabel(weeks[0].weekStart).toLowerCase()}</Txt>
            </Row>
            {weeks[1] ? (
              <Txt variant="h3" color={weeks[0].avg - weeks[1].avg <= 0 ? c.success : c.textDim}>
                {weeks[0].avg - weeks[1].avg > 0 ? '+' : ''}
                {num(weeks[0].avg - weeks[1].avg, 2)} kg
              </Txt>
            ) : null}
          </Row>
          <View style={{ gap: 6 }}>
            {weeks.map((w) => {
              const fat = fatWeeks.get(w.weekStart);
              const muscle = muscleWeeks.get(w.weekStart);
              return (
                <Row key={w.weekStart} style={{ justifyContent: 'space-between' }}>
                  <Txt variant="dim">{weekLabel(w.weekStart)}</Txt>
                  <Txt variant="num">
                    {num(w.avg, 1)} kg
                    {fat != null ? <Txt variant="small"> · {num(fat, 1)}% vet</Txt> : null}
                    {muscle != null ? (
                      <Txt variant="small"> · {num(muscle, 1)} kg spier</Txt>
                    ) : null}
                    <Txt variant="small"> ({w.count}×)</Txt>
                  </Txt>
                </Row>
              );
            })}
          </View>
          <Txt variant="small">
            Het weekgemiddelde vlakt schommelingen door vocht en zout af. Weeg je bij voorkeur elke
            ochtend, na het toilet en voor het ontbijt.
          </Txt>
        </Card>
      ) : null}

      {chartPoints.length > 1 ? (
        <Card>
          <Txt variant="label">Verloop</Txt>
          {chartOptions.length > 1 ? (
            <Segmented options={chartOptions} value={activeChart} onChange={setChartMetric} />
          ) : null}
          <LineChart
            values={chartPoints.map((b) => valueOf(b, activeChart)!)}
            labels={chartPoints.map((b) => shortDate(parseDateKey(b.date)))}
            color={c.accent}
          />
        </Card>
      ) : null}

      {bodyWeights.length ? (
        <>
          <SectionTitle title="Metingen" />
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {[...bodyWeights].reverse().map((b, i, arr) => {
              const prev = arr[i + 1];
              const diff = prev ? b.kg - prev.kg : null;
              return (
                <View key={b.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row style={{ justifyContent: 'space-between', paddingVertical: space.md }}>
                    <View>
                      <Txt>{relativeDay(b.date)}</Txt>
                      {b.composition?.fatPct != null || b.composition?.muscleKg != null ? (
                        <Txt variant="small">
                          {[
                            b.composition.fatPct != null
                              ? `${num(b.composition.fatPct, 1)}% vet`
                              : null,
                            b.composition.muscleKg != null
                              ? `${num(b.composition.muscleKg, 1)} kg spier`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Txt>
                      ) : null}
                    </View>
                    <Row gap={space.md}>
                      {diff != null && diff !== 0 ? (
                        <Txt variant="small" color={diff < 0 ? c.success : c.textDim}>
                          {diff > 0 ? '+' : ''}
                          {num(diff)}
                        </Txt>
                      ) : null}
                      <Txt variant="num">{num(b.kg)} kg</Txt>
                      <Pressable
                        onPress={() => removeBodyWeight(b.id)}
                        hitSlop={8}
                        accessibilityLabel={`Meting van ${relativeDay(b.date)} verwijderen`}>
                        <Icon name="close" size={14} color={c.textFaint} />
                      </Pressable>
                    </Row>
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
