import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { CalorieRing, MacroBars } from '@/components/shared';
import {
  Button,
  Card,
  Divider,
  IconButton,
  Row,
  TabScreen,
  Txt,
  confirm,
  tap,
} from '@/components/ui';
import { addDays, dateKey, num, relativeDay } from '@/lib/format';
import { MEALS, sumMacros } from '@/lib/nutrition';
import { space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

export default function FoodScreen() {
  const c = useColors();
  const [date, setDate] = useState(dateKey());
  const foodLog = useStore((s) => s.foodLog);
  const goals = useStore((s) => s.goals);
  const water = useStore((s) => s.water);
  const setWater = useStore((s) => s.setWater);
  const removeFoodEntry = useStore((s) => s.removeFoodEntry);

  const entries = foodLog.filter((e) => e.date === date);
  const totals = sumMacros(entries);
  const glasses = water[date] ?? 0;
  const isToday = date === dateKey();

  return (
    <TabScreen
      title="Voeding"
      right={<IconButton icon="target" label="Doelen" onPress={() => router.push('/goals')} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton
          icon="chevronLeft"
          label="Vorige dag"
          onPress={() => setDate(addDays(date, -1))}
        />
        <Pressable onPress={() => setDate(dateKey())} disabled={isToday}>
          <Txt variant="h3">{relativeDay(date)}</Txt>
        </Pressable>
        <IconButton
          icon="chevronRight"
          label="Volgende dag"
          onPress={() => setDate(addDays(date, 1))}
        />
      </Row>

      <Card>
        <Row gap={space.lg}>
          <CalorieRing eaten={totals.kcal} goal={goals.kcal} />
          <MacroBars totals={totals} goals={goals} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="dim">Gegeten</Txt>
          <Txt variant="num">
            {num(totals.kcal, 0)} / {num(goals.kcal, 0)} kcal
          </Txt>
        </Row>
      </Card>

      <Row gap={space.sm}>
        <Button
          label="Foto maken"
          icon="camera"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/coach', params: { attach: 'camera' } })}
        />
        <Button
          label="Beschrijven"
          icon="sparkles"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => router.push('/coach')}
        />
      </Row>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Row gap={6}>
              <Icon name="water" size={16} color={c.water} />
              <Txt variant="h3">Water</Txt>
            </Row>
            <Txt variant="small" style={{ fontVariant: ['tabular-nums'] }}>
              {glasses} / {goals.waterGlasses} glazen · {num(glasses * 0.25, 2)} L
            </Txt>
          </View>
          <Row gap={space.sm}>
            <IconButton
              icon="minus"
              label="Glas water eraf"
              onPress={() => setWater(date, glasses - 1)}
            />
            <IconButton
              icon="plus"
              label="Glas water toevoegen"
              bg={c.water}
              color="#FFFFFF"
              onPress={() => setWater(date, glasses + 1)}
            />
          </Row>
        </Row>
        <Row gap={6}>
          {Array.from({ length: Math.max(goals.waterGlasses, glasses) }, (_, i) => {
            const filled = i < glasses;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${i + 1} glazen water`}
                onPress={() => {
                  tap();
                  setWater(date, i + 1 === glasses ? i : i + 1);
                }}
                style={{
                  flex: 1,
                  maxWidth: 44,
                  height: 40,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: filled ? c.water : c.cardAlt,
                }}>
                <Icon name="water" size={16} color={filled ? '#FFFFFF' : c.textFaint} />
              </Pressable>
            );
          })}
        </Row>
      </Card>

      {MEALS.map((meal) => {
        const items = entries.filter((e) => e.meal === meal.key);
        const mealKcal = items.reduce((n, e) => n + e.kcal, 0);
        return (
          <Card key={meal.key} style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Txt variant="h3">{meal.label}</Txt>
                <Txt variant="small">
                  {items.length ? `${num(mealKcal, 0)} kcal` : 'Nog niets toegevoegd'}
                </Txt>
              </View>
              <IconButton
                icon="plus"
                label={`Toevoegen aan ${meal.label}`}
                bg={c.accentSoft}
                color={c.accent}
                onPress={() =>
                  router.push({ pathname: '/food-add', params: { date, meal: meal.key } })
                }
              />
            </Row>
            {items.map((e) => (
              <View key={e.id}>
                <Divider />
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Verwijderen"
                  onPress={async () => {
                    if (
                      await confirm(
                        'Verwijderen?',
                        `${e.name} (${e.amountLabel})`,
                        'Verwijder',
                        true,
                      )
                    )
                      removeFoodEntry(e.id);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingTop: space.sm,
                    gap: space.md,
                    opacity: pressed ? 0.6 : 1,
                  })}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt numberOfLines={1}>{e.name}</Txt>
                    <Txt variant="small">
                      {e.amountLabel} · E {num(e.protein, 0)} · K {num(e.carbs, 0)} · V{' '}
                      {num(e.fat, 0)}
                    </Txt>
                  </View>
                  <Txt variant="num">{num(e.kcal, 0)}</Txt>
                </Pressable>
              </View>
            ))}
          </Card>
        );
      })}
      <Txt variant="small" style={{ textAlign: 'center' }}>
        Tik op een item om het te verwijderen.
      </Txt>
    </TabScreen>
  );
}
