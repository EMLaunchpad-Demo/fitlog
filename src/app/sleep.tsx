import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BarChart } from '@/components/charts';
import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Divider,
  HeaderButton,
  IconButton,
  Note,
  Rating,
  Row,
  SectionTitle,
  Stat,
  StackScroll,
  TimeField,
  Txt,
  success,
} from '@/components/ui';
import { addDays, dateKey, dayShort, parseDateKey, relativeDay } from '@/lib/format';
import { CAFFEINE_CUTOFF_HOURS, sleepAdvice } from '@/lib/guidelines';
import {
  ageFromBirthYear,
  regularityLabel,
  sleepMinutes,
  sleepStats,
  targetSleepMinutes,
} from '@/lib/recovery';
import { hoursLabel, minutesBetween } from '@/lib/time';
import { space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

export default function SleepScreen() {
  const c = useColors();
  const sleepLog = useStore((s) => s.sleepLog);
  const settings = useStore((s) => s.settings);
  const logSleep = useStore((s) => s.logSleep);
  const removeSleep = useStore((s) => s.removeSleep);
  const setSettings = useStore((s) => s.setSettings);

  const today = dateKey();
  const [date, setDate] = useState(today);
  const existing = sleepLog.find((e) => e.date === date);
  const last = sleepLog[sleepLog.length - 1];
  const [bed, setBed] = useState(existing?.bed ?? last?.bed ?? settings.sleep.bedtime);
  const [wake, setWake] = useState(existing?.wake ?? last?.wake ?? settings.sleep.wake);
  const [quality, setQuality] = useState<number | null>(existing?.quality ?? null);

  const pickDate = (next: string) => {
    if (next > today) return;
    const e = sleepLog.find((x) => x.date === next);
    setDate(next);
    setBed(e?.bed ?? bed);
    setWake(e?.wake ?? wake);
    setQuality(e?.quality ?? null);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/recovery'));
  const duration = minutesBetween(bed, wake);
  const targetMin = targetSleepMinutes(settings.sleep);
  const valid = duration >= 60 && duration <= 16 * 60;

  const save = () => {
    if (!valid) return;
    logSleep({
      date,
      bed,
      wake,
      ...(quality != null ? { quality } : {}),
      // A tracker's own "asleep" time only fits the times it was measured with.
      ...(existing?.asleepMin != null && existing.bed === bed && existing.wake === wake
        ? { asleepMin: existing.asleepMin }
        : {}),
      ...(existing?.note ? { note: existing.note } : {}),
    });
    success();
    close();
  };

  const stats = sleepStats(sleepLog, targetMin, 7);
  const regular = stats ? regularityLabel(stats) : null;
  const age = ageFromBirthYear(settings.birthYear);

  // Last 14 nights, oldest first, with gaps for nights that were not logged.
  const nights = Array.from({ length: 14 }, (_, i) => {
    const key = addDays(today, i - 13);
    const e = sleepLog.find((x) => x.date === key);
    return { key, minutes: e ? sleepMinutes(e) : null };
  });

  return (
    <StackScroll>
      <Stack.Screen
        options={{ headerLeft: () => <HeaderButton label="Sluit" onPress={close} /> }}
      />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton
            icon="chevronLeft"
            label="Vorige nacht"
            onPress={() => pickDate(addDays(date, -1))}
          />
          <View style={{ alignItems: 'center' }}>
            <Txt variant="label">Nacht tot</Txt>
            <Txt variant="h3">{relativeDay(date).toLowerCase()}ochtend</Txt>
          </View>
          <IconButton
            icon="chevronRight"
            label="Volgende nacht"
            color={date >= today ? c.textFaint : undefined}
            onPress={() => pickDate(addDays(date, 1))}
          />
        </Row>
        <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
          <TimeField label="In slaap rond" value={bed} onChange={setBed} />
          <TimeField label="Wakker om" value={wake} onChange={setWake} />
        </Row>
        <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Row gap={6} style={{ alignItems: 'baseline' }}>
            <Txt variant="display" style={{ fontSize: 34 }}>
              {hoursLabel(duration)}
            </Txt>
            <Txt variant="dim">geslapen</Txt>
          </Row>
          <Txt variant="small" color={duration >= targetMin * 0.95 ? c.success : c.textDim}>
            doel {hoursLabel(targetMin)}
          </Txt>
        </Row>
        <Rating
          label="Hoe heb je geslapen?"
          value={quality}
          onChange={setQuality}
          low="slecht"
          high="top"
        />
        <Button label="Nacht opslaan" size="lg" disabled={!valid} onPress={save} />
        <Button
          label="Screenshot van je slaap-app"
          icon="image"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/coach',
              params: { attach: 'library', text: 'Log deze nacht uit mijn slaap-app.' },
            })
          }
        />
        {existing ? (
          <Txt variant="small">Deze nacht staat er al in; opslaan overschrijft hem.</Txt>
        ) : null}
      </Card>

      {stats ? (
        <Card>
          <Txt variant="label">Laatste 7 dagen</Txt>
          <Row>
            <Stat label="Gemiddeld" value={hoursLabel(stats.avgMin)} />
            <Stat label="In slaap" value={stats.avgBed} />
            <Stat label="Wakker" value={stats.avgWake} />
          </Row>
          <BarChart
            values={nights.map((n) => n.minutes)}
            labels={nights.map((n) => dayShort(parseDateKey(n.key)))}
            target={targetMin}
            color={c.accent}
            format={hoursLabel}
          />
          <Txt variant="dim">
            {stats.nights} {stats.nights === 1 ? 'nacht' : 'nachten'} gelogd
            {regular ? ` · ${regular.toLowerCase()}` : ''}
            {stats.debtMin >= 30 ? ` · ${hoursLabel(stats.debtMin)} slaap tekort` : ''}
          </Txt>
          {regular === 'Onregelmatig' ? (
            <Note>
              Je bed- en opstaantijden lopen meer dan een uur uiteen. Vaste tijden, ook in het
              weekend, doen meer voor je herstel dan af en toe uitslapen.
            </Note>
          ) : null}
        </Card>
      ) : null}

      <SectionTitle title="Mijn slaapschema" />
      <Card>
        <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
          <TimeField
            label="Licht uit"
            value={settings.sleep.bedtime}
            onChange={(bedtime) => setSettings({ sleep: { bedtime } })}
          />
          <TimeField
            label="Opstaan"
            value={settings.sleep.wake}
            onChange={(w) => setSettings({ sleep: { wake: w } })}
          />
        </Row>
        {settings.sleep.screensOff ? (
          <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
            <TimeField
              label="Schermen uit"
              value={settings.sleep.screensOff}
              onChange={(screensOff) => setSettings({ sleep: { screensOff } })}
            />
            <Button
              label="Geen schermtijd"
              variant="ghost"
              size="sm"
              onPress={() => setSettings({ sleep: { screensOff: null } })}
            />
          </Row>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setSettings({
                sleep: {
                  screensOff: addMinutes(settings.sleep.bedtime, -30),
                },
              })
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="plus" size={14} color={c.accent} />
            <Txt variant="h3" color={c.accent} style={{ fontSize: 15 }}>
              Schermen-uit-tijd toevoegen
            </Txt>
          </Pressable>
        )}
        <Txt variant="dim">
          Dat is {hoursLabel(targetMin)} in bed. {sleepAdvice(age, targetMin)}
        </Txt>
        <Note>
          Laatste koffie of energiedrank voor {addMinutes(settings.sleep.bedtime, -CAFFEINE_CUTOFF_HOURS * 60)}
          : cafeïne korter dan {CAFFEINE_CUTOFF_HOURS} uur voor bedtijd verkort je slaap nog meetbaar.
        </Note>
      </Card>

      {sleepLog.length ? (
        <>
          <SectionTitle title="Nachten" />
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {[...sleepLog]
              .reverse()
              .slice(0, 30)
              .map((e, i) => (
                <View key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row style={{ justifyContent: 'space-between', paddingVertical: space.md }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => pickDate(e.date)}
                      style={{ flex: 1 }}>
                      <Txt>{relativeDay(e.date)}</Txt>
                      <Txt variant="small">
                        {e.bed} – {e.wake}
                        {e.quality != null ? ` · kwaliteit ${e.quality}/5` : ''}
                        {e.asleepMin != null ? ' · gemeten slaaptijd' : ''}
                      </Txt>
                    </Pressable>
                    <Row gap={space.md}>
                      <Txt variant="num">{hoursLabel(sleepMinutes(e))}</Txt>
                      <Pressable
                        onPress={() => removeSleep(e.date)}
                        hitSlop={8}
                        accessibilityLabel={`Nacht van ${relativeDay(e.date)} verwijderen`}>
                        <Icon name="close" size={14} color={c.textFaint} />
                      </Pressable>
                    </Row>
                  </Row>
                </View>
              ))}
          </Card>
        </>
      ) : null}
    </StackScroll>
  );
}

function addMinutes(time: string, delta: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
