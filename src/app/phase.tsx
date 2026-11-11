import { router, Stack } from 'expo-router';
import { useState } from 'react';

import {
  Button,
  Card,
  DateField,
  HeaderButton,
  Note,
  NumberField,
  Row,
  Segmented,
  StackScroll,
  Txt,
  success,
} from '@/components/ui';
import { dateKey, num } from '@/lib/format';
import { MINOR_CUT_NOTE, isMinor } from '@/lib/guidelines';
import { DEFAULT_RATE, MAX_LOSS_PCT, PHASE_LABEL } from '@/lib/phase';
import { ageFromBirthYear } from '@/lib/recovery';
import { space } from '@/lib/theme';
import type { PhaseType } from '@/lib/types';
import { useStore } from '@/store/store';

type Choice = PhaseType | 'geen';

/** Set up the current diet phase: cut, maintenance or bulk, with dates and a target rate. */
export default function PhaseScreen() {
  const phase = useStore((s) => s.settings.phase);
  const weightKg = useStore((s) => s.bodyWeights[s.bodyWeights.length - 1]?.kg ?? null);
  const setSettings = useStore((s) => s.setSettings);
  const minor = isMinor(ageFromBirthYear(useStore((s) => s.settings.birthYear)));

  const [type, setType] = useState<Choice>(phase?.type ?? 'cut');
  const [start, setStart] = useState<string>(phase?.start ?? dateKey());
  const [end, setEnd] = useState<string | null>(phase?.end ?? null);
  const [rate, setRate] = useState<number | null>(
    Math.abs(phase?.ratePct ?? DEFAULT_RATE[phase?.type ?? 'cut']),
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/progress'));
  const pickType = (next: Choice) => {
    setType(next);
    if (next !== 'geen') setRate(Math.abs(DEFAULT_RATE[next]));
  };

  const signed = type === 'cut' ? -(rate ?? 0) : type === 'bulk' ? (rate ?? 0) : 0;
  const perWeekKg = weightKg ? (signed / 100) * weightKg : null;
  // While still growing, even a slow cut is the upper limit.
  const maxLoss = minor ? 0.5 : MAX_LOSS_PCT;
  const tooFast = type === 'cut' && (rate ?? 0) > maxLoss;
  const valid = type === 'geen' || (rate != null && rate >= 0 && rate <= 2 && (!end || end > start));

  const save = () => {
    if (!valid) return;
    setSettings({
      phase: type === 'geen' ? null : { type, start, ...(end ? { end } : {}), ratePct: signed },
    });
    success();
    close();
  };

  return (
    <StackScroll>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderButton label="Annuleer" onPress={close} />,
          headerRight: () => <HeaderButton label="Bewaar" strong disabled={!valid} onPress={save} />,
        }}
      />
      <Card>
        <Segmented
          options={[
            { key: 'cut' as Choice, label: PHASE_LABEL.cut },
            { key: 'onderhoud' as Choice, label: PHASE_LABEL.onderhoud },
            { key: 'bulk' as Choice, label: PHASE_LABEL.bulk },
          ]}
          value={type === 'geen' ? ('' as Choice) : type}
          onChange={pickType}
        />
        {type !== 'geen' ? (
          <>
            <Row gap={space.sm}>
              <DateField label="Start" value={start} onChange={(d) => d && setStart(d)} />
              <DateField label="Einde (optioneel)" value={end} onChange={setEnd} optional />
            </Row>
            {type !== 'onderhoud' ? (
              <NumberField
                label={`${type === 'cut' ? 'Afvallen' : 'Aankomen'} per week (% van je gewicht)`}
                value={rate}
                onChange={setRate}
              />
            ) : null}
            <Txt variant="dim">
              {type === 'onderhoud'
                ? 'Je gewicht blijft gelijk; de app waarschuwt als het weekgemiddelde wegloopt.'
                : perWeekKg != null
                  ? `Dat is ongeveer ${num(Math.abs(perWeekKg), 2)} kg per week bij ${num(weightKg!, 1)} kg.`
                  : 'Log een weging om te zien hoeveel kg per week dat is.'}
            </Txt>
            {type === 'cut' && minor ? <Note>{MINOR_CUT_NOTE}</Note> : null}
            {tooFast ? (
              <Note>
                Meer dan {num(maxLoss, 1)}% per week is te snel als je spiermassa wilt houden.
                {minor ? '' : ' Kies liever 0,5%: dat kost je nauwelijks kracht.'}
              </Note>
            ) : null}
            {end && end <= start ? <Note>De einddatum moet na de startdatum liggen.</Note> : null}
          </>
        ) : (
          <Txt variant="dim">Zonder fase volgt de app alleen je gewicht, zonder doeltempo.</Txt>
        )}
        <Button label="Fase opslaan" size="lg" disabled={!valid} onPress={save} />
        {type !== 'geen' && phase ? (
          <Button label="Geen fase" variant="ghost" onPress={() => pickType('geen')} />
        ) : null}
      </Card>
      <Note>
        De app vergelijkt de trend van je wegingen (laatste drie weken) met dit tempo en stelt kleine
        stappen van 50 tot 200 kcal voor. Wijzig je doel niet vaker dan om de twee weken: je gewicht
        heeft tijd nodig om te volgen.
      </Note>
    </StackScroll>
  );
}
