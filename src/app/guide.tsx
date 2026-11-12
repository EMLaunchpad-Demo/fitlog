import { Linking, Pressable, View } from 'react-native';

import { Card, Note, Row, SectionTitle, StackScroll, Txt } from '@/components/ui';
import { num } from '@/lib/format';
import { CAFFEINE_CUTOFF_HOURS, GUIDE, STRENGTH_LABEL, sleepRange } from '@/lib/guidelines';
import { PHASE_LABEL } from '@/lib/phase';
import { ageFromBirthYear, targetSleepMinutes } from '@/lib/recovery';
import { formatTime, hoursLabel, parseTime } from '@/lib/time';
import { space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

/** The user's own targets next to what the research says, with sources. */
export default function GuideScreen() {
  const c = useColors();
  const goals = useStore((s) => s.goals);
  const settings = useStore((s) => s.settings);
  const weightKg = useStore((s) => s.bodyWeights[s.bodyWeights.length - 1]?.kg ?? null);

  const age = ageFromBirthYear(settings.birthYear);
  const targetSleep = targetSleepMinutes(settings.sleep);
  const [sleepLo, sleepHi] = sleepRange(age);
  const lastCoffee = formatTime(
    (parseTime(settings.sleep.bedtime) ?? 0) - CAFFEINE_CUTOFF_HOURS * 60,
  );
  const mine: { label: string; value: string; detail: string }[] = [
    {
      label: 'Eiwit',
      value: `${goals.protein} g`,
      detail: weightKg
        ? `${num(goals.protein / weightKg, 1)} g per kg · richtlijn 1,6-2,7`
        : 'log een weging voor g per kg',
    },
    {
      label: 'Vet',
      value: `${goals.fat} g`,
      detail: `${Math.round(((goals.fat * 9) / goals.kcal) * 100)}% van je kcal${weightKg ? ` · ${num(goals.fat / weightKg, 1)} g per kg` : ''}`,
    },
    {
      label: 'Slaap',
      value: hoursLabel(targetSleep),
      detail: `${settings.sleep.bedtime} – ${settings.sleep.wake} · richtlijn ${sleepLo}-${sleepHi} u`,
    },
    {
      label: 'Laatste koffie',
      value: lastCoffee,
      detail: `${CAFFEINE_CUTOFF_HOURS} uur voor licht uit`,
    },
    {
      label: 'Stappen',
      value: num(settings.stepGoal, 0),
      detail: 'voordeel vlakt af rond 8.000-10.000',
    },
    {
      label: 'Cardio',
      value: `${settings.cardioGoalMin} min`,
      detail: 'per week, matige inspanning',
    },
  ];
  if (settings.phase)
    mine.push({
      label: PHASE_LABEL[settings.phase.type],
      value: `${settings.phase.ratePct > 0 ? '+' : ''}${num(settings.phase.ratePct, 2)}%`,
      detail: 'van je gewicht per week',
    });

  return (
    <StackScroll>
      <Card>
        <Txt variant="label">Jouw cijfers</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
          {mine.map((m) => (
            <View key={m.label} style={{ width: '50%', gap: 2, paddingRight: space.sm }}>
              <Txt variant="small">{m.label}</Txt>
              <Txt variant="h3" style={{ fontVariant: ['tabular-nums'] }}>
                {m.value}
              </Txt>
              <Txt variant="small">{m.detail}</Txt>
            </View>
          ))}
        </View>
      </Card>

      {GUIDE.map((section) => (
        <View key={section.key} style={{ gap: space.md }}>
          <SectionTitle title={section.title} />
          <Card style={{ gap: space.lg }}>
            {section.points.map((p, i) => (
              <View key={i} style={{ gap: 6 }}>
                <Txt>{p.text}</Txt>
                <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      height: 22,
                      borderRadius: 11,
                      justifyContent: 'center',
                      backgroundColor: p.strength === 'zwak' ? c.cardAlt : c.accentSoft,
                    }}>
                    <Txt
                      variant="small"
                      color={p.strength === 'zwak' ? c.textDim : c.accent}
                      style={{ fontWeight: '600' }}>
                      {STRENGTH_LABEL[p.strength]}
                    </Txt>
                  </View>
                  {p.sources.map((s) => (
                    <Pressable
                      key={s.url}
                      accessibilityRole="link"
                      hitSlop={6}
                      onPress={() => Linking.openURL(s.url).catch(() => {})}>
                      <Txt variant="small" color={c.accent} style={{ textDecorationLine: 'underline' }}>
                        {s.label}
                      </Txt>
                    </Pressable>
                  ))}
                </Row>
              </View>
            ))}
          </Card>
        </View>
      ))}

      <Note>
        Dit is algemene informatie, geen medisch advies. Bij pijn, een blessure of twijfel over je
        gezondheid: ga naar je huisarts.
      </Note>
    </StackScroll>
  );
}
