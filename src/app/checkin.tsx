import { router, Stack } from 'expo-router';
import { useState } from 'react';

import {
  Button,
  Card,
  Field,
  HeaderButton,
  Note,
  Rating,
  Row,
  StackScroll,
  Txt,
  success,
} from '@/components/ui';
import { dateKey } from '@/lib/format';
import { sleepMinutes, targetSleepMinutes } from '@/lib/recovery';
import { hoursLabel } from '@/lib/time';
import { useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

/** Morning check-in: four quick scores that feed the readiness estimate. */
export default function CheckInScreen() {
  const c = useColors();
  const today = dateKey();
  const existing = useStore((s) => s.checkIns.find((x) => x.date === today));
  const lastNight = useStore((s) => s.sleepLog.find((x) => x.date === today));
  const targetMin = useStore((s) => targetSleepMinutes(s.settings.sleep));
  const saveCheckIn = useStore((s) => s.saveCheckIn);

  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [soreness, setSoreness] = useState<number | null>(existing?.soreness ?? null);
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null);
  const [mood, setMood] = useState<number | null>(existing?.mood ?? null);
  const [note, setNote] = useState(existing?.note ?? '');

  const close = () => (router.canGoBack() ? router.back() : router.replace('/recovery'));
  const complete = energy != null && soreness != null && stress != null && mood != null;

  const save = () => {
    if (!complete) return;
    saveCheckIn({
      date: today,
      energy,
      soreness,
      stress,
      mood,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    success();
    close();
  };

  return (
    <StackScroll>
      <Stack.Screen
        options={{ headerLeft: () => <HeaderButton label="Sluit" onPress={close} /> }}
      />
      <Card>
        <Txt variant="label">Hoe sta je ervoor vandaag?</Txt>
        <Rating
          label="Energie"
          value={energy}
          onChange={setEnergy}
          low="leeg"
          high="vol energie"
        />
        <Rating
          label="Spieren"
          value={soreness}
          onChange={setSoreness}
          low="veel spierpijn"
          high="fris"
        />
        <Rating
          label="Stress"
          value={stress}
          onChange={setStress}
          low="gestrest"
          high="ontspannen"
        />
        <Rating label="Humeur" value={mood} onChange={setMood} low="slecht" high="top" />
        <Field
          label="Notitie (optioneel)"
          value={note}
          onChangeText={setNote}
          placeholder="Bijv. drukke dag op school, pijntje in de schouder"
        />
        <Button label="Check-in opslaan" size="lg" disabled={!complete} onPress={save} />
      </Card>

      <Card onPress={() => router.push('/sleep')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">Slaap vannacht</Txt>
          <Txt variant="h3" color={lastNight ? c.text : c.accent}>
            {lastNight ? hoursLabel(sleepMinutes(lastNight)) : 'Loggen'}
          </Txt>
        </Row>
        <Txt variant="dim">
          {lastNight
            ? `${lastNight.bed} – ${lastNight.wake} · doel ${hoursLabel(targetMin)}`
            : 'Log ook je nacht: slaap telt voor 40% mee in je herstelscore.'}
        </Txt>
      </Card>

      <Note>
        Je eigen inschatting van energie, spierpijn, stress en humeur volgt je trainingsbelasting
        goed, vaak beter dan gemeten waarden. Vul het in vlak na het opstaan en wees eerlijk; het
        duurt twintig seconden.
      </Note>
    </StackScroll>
  );
}
