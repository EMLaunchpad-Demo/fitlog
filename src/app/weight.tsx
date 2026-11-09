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
  StackScroll,
  Txt,
  success,
} from '@/components/ui';
import { dateKey, num, parseDateKey, relativeDay, shortDate } from '@/lib/format';
import { startOfWeek, weeklyAverages } from '@/lib/workout-stats';
import { space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

export default function WeightScreen() {
  const c = useColors();
  const bodyWeights = useStore((s) => s.bodyWeights);
  const logBodyWeight = useStore((s) => s.logBodyWeight);
  const removeBodyWeight = useStore((s) => s.removeBodyWeight);
  const last = bodyWeights[bodyWeights.length - 1];
  const today = dateKey();
  const [kg, setKg] = useState<number | null>(last?.kg ?? null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const save = () => {
    if (!kg || kg < 20 || kg > 400) return;
    logBodyWeight(kg, today);
    success();
    close();
  };

  const recent = bodyWeights.slice(-30);
  const weeks = weeklyAverages(bodyWeights).slice(-6).reverse();
  const thisWeek = dateKey(startOfWeek());
  const weekLabel = (weekStart: string) =>
    weekStart === thisWeek ? 'Deze week' : `Week van ${shortDate(parseDateKey(weekStart))}`;

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
        <Button label="Opslaan" size="lg" disabled={!kg} onPress={save} />
        {bodyWeights.some((b) => b.date === today) ? (
          <Txt variant="small">Je hebt vandaag al gewogen; opslaan overschrijft die meting.</Txt>
        ) : null}
      </Card>

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
            {weeks.map((w) => (
              <Row key={w.weekStart} style={{ justifyContent: 'space-between' }}>
                <Txt variant="dim">{weekLabel(w.weekStart)}</Txt>
                <Txt variant="num">
                  {num(w.avg, 1)} kg <Txt variant="small">({w.count}× gewogen)</Txt>
                </Txt>
              </Row>
            ))}
          </View>
          <Txt variant="small">
            Het weekgemiddelde vlakt schommelingen door vocht en zout af. Weeg je bij voorkeur elke
            ochtend, na het toilet en voor het ontbijt.
          </Txt>
        </Card>
      ) : null}

      {recent.length > 1 ? (
        <Card>
          <Txt variant="label">Verloop</Txt>
          <LineChart
            values={recent.map((b) => b.kg)}
            labels={recent.map((b) => shortDate(parseDateKey(b.date)))}
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
                    <Txt>{relativeDay(b.date)}</Txt>
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
