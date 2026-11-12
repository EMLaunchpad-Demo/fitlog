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
  Note,
  NumberField,
  Row,
  SectionTitle,
  StackScroll,
  Txt,
  success,
} from '@/components/ui';
import { dateKey, num, parseDateKey, relativeDay, shortDate } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import type { BodyMeasure } from '@/lib/types';
import { useStore } from '@/store/store';

type Key = keyof Omit<BodyMeasure, 'id' | 'date'>;
const FIELDS: { key: Key; label: string }[] = [
  { key: 'waist', label: 'Taille' },
  { key: 'chest', label: 'Borst' },
  { key: 'arm', label: 'Bovenarm' },
  { key: 'thigh', label: 'Bovenbeen' },
  { key: 'hips', label: 'Heup' },
];

/** Body measurements: the tape measure next to the scale. */
export default function BodyScreen() {
  const c = useColors();
  const measures = useStore((s) => s.measures);
  const heightCm = useStore((s) => s.settings.heightCm);
  const logMeasure = useStore((s) => s.logMeasure);
  const removeMeasure = useStore((s) => s.removeMeasure);

  const today = dateKey();
  const todayEntry = measures.find((m) => m.date === today);
  const last = measures[measures.length - 1];
  const [values, setValues] = useState<Partial<Record<Key, number | null>>>(
    todayEntry ?? { waist: last?.waist ?? null },
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/progress'));
  const filled = FIELDS.filter((f) => {
    const v = values[f.key];
    return v != null && v >= 15 && v <= 200;
  });
  const save = () => {
    if (!filled.length) return;
    logMeasure(today, Object.fromEntries(filled.map((f) => [f.key, values[f.key]!])));
    success();
    close();
  };

  const waists = measures.filter((m) => m.waist != null);
  const latestWaist = waists[waists.length - 1];
  const ratio = latestWaist && heightCm ? latestWaist.waist! / heightCm : null;

  return (
    <StackScroll>
      <Stack.Screen
        options={{ headerLeft: () => <HeaderButton label="Sluit" onPress={close} /> }}
      />
      <Card>
        <Txt variant="label">Maten vandaag (cm)</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              value={values[f.key] ?? null}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
              placeholder="–"
              style={{ width: '31%', flexGrow: 1 }}
            />
          ))}
        </View>
        <Button label="Maten opslaan" size="lg" disabled={!filled.length} onPress={save} />
        <Note>
          Meet &apos;s ochtends, op de blote huid, na een gewone uitademing. Taille: ter hoogte van je
          navel. Bovenarm: aangespannen, op het dikste punt. Eén keer per week of per twee weken is
          genoeg.
        </Note>
      </Card>

      {latestWaist ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">Taille</Txt>
            <Txt variant="small">{relativeDay(latestWaist.date)}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Row gap={4} style={{ alignItems: 'baseline' }}>
              <Txt variant="display" style={{ fontSize: 34 }}>
                {num(latestWaist.waist!, 1)}
              </Txt>
              <Txt variant="dim">cm</Txt>
            </Row>
            {ratio != null ? (
              <Txt variant="h3" color={ratio < 0.5 ? c.success : c.textDim}>
                {num(ratio, 2)} × je lengte
              </Txt>
            ) : null}
          </Row>
          {waists.length > 1 ? (
            <LineChart
              values={waists.slice(-20).map((m) => m.waist!)}
              labels={waists.slice(-20).map((m) => shortDate(parseDateKey(m.date)))}
              color={c.accent}
            />
          ) : null}
          <Txt variant="small">
            {ratio != null
              ? 'Richtlijn: hou je taille onder de helft van je lengte. '
              : 'Vul je lengte in bij Instellingen om je taille met je lengte te vergelijken. '}
            Je taille volgt vetverlies of vettoename betrouwbaarder dan het vetpercentage van een
            weegschaal.
          </Txt>
        </Card>
      ) : null}

      {measures.length ? (
        <>
          <SectionTitle title="Metingen" />
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {[...measures]
              .reverse()
              .slice(0, 30)
              .map((m, i) => (
                <View key={m.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row style={{ justifyContent: 'space-between', paddingVertical: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Txt>{relativeDay(m.date)}</Txt>
                      <Txt variant="small">
                        {FIELDS.filter((f) => m[f.key] != null)
                          .map((f) => `${f.label.toLowerCase()} ${num(m[f.key]!, 1)}`)
                          .join(' · ')}
                      </Txt>
                    </View>
                    <Pressable
                      onPress={() => removeMeasure(m.date)}
                      hitSlop={8}
                      accessibilityLabel={`Maten van ${relativeDay(m.date)} verwijderen`}>
                      <Icon name="close" size={14} color={c.textFaint} />
                    </Pressable>
                  </Row>
                </View>
              ))}
          </Card>
        </>
      ) : null}
    </StackScroll>
  );
}
