import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { COACH_REQUESTS, askCoach } from '@/ai/shortcuts';
import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Row,
  SectionTitle,
  StackScroll,
  Txt,
  confirm,
  success,
  tap,
} from '@/components/ui';
import { dateKey, num } from '@/lib/format';
import { mealLabel, sumMacros } from '@/lib/nutrition';
import { space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

/** The coach's week menu: log a meal in one tap and tick off the shopping list. */
export default function MenuScreen() {
  const c = useColors();
  const menu = useStore((s) => s.weekMenu);
  const goals = useStore((s) => s.goals);
  const logMealItems = useStore((s) => s.logMealItems);
  const toggleShoppingItem = useStore((s) => s.toggleShoppingItem);
  const setWeekMenu = useStore((s) => s.setWeekMenu);
  const [dayIndex, setDayIndex] = useState(0);
  const [logged, setLogged] = useState<string[]>([]);

  if (!menu) {
    return (
      <StackScroll>
        <EmptyState
          icon="calendar"
          title="Nog geen weekmenu"
          text="Je coach maakt een menu dat op je calorieën en eiwit uitkomt, met wat je lust en in huis hebt, plus een boodschappenlijst."
          action={
            <Button
              label="Maak mijn weekmenu"
              icon="sparkles"
              onPress={() => askCoach(COACH_REQUESTS.weekMenu)}
            />
          }
        />
      </StackScroll>
    );
  }

  const day = menu.days[Math.min(dayIndex, menu.days.length - 1)];
  const totals = sumMacros(day.meals.flatMap((m) => m.items));
  const open = menu.shopping.filter((x) => !x.done).length;

  return (
    <StackScroll>
      <View style={{ gap: 2 }}>
        <Txt variant="h2">{menu.title}</Txt>
        <Txt variant="small">
          Doel {num(goals.kcal, 0)} kcal · {goals.protein} g eiwit
        </Txt>
      </View>

      {menu.days.length > 1 ? (
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {menu.days.map((d, i) => (
            <Chip key={i} label={d.label} selected={i === dayIndex} onPress={() => setDayIndex(i)} />
          ))}
        </Row>
      ) : null}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label">{day.label}</Txt>
          <Txt variant="small" style={{ fontVariant: ['tabular-nums'] }}>
            {num(totals.kcal, 0)} kcal · E {num(totals.protein, 0)} · K {num(totals.carbs, 0)} · V{' '}
            {num(totals.fat, 0)}
          </Txt>
        </Row>
        {day.meals.map((m, i) => {
          const t = sumMacros(m.items);
          const key = `${dayIndex}-${i}`;
          const done = logged.includes(key);
          return (
            <View key={i} style={{ gap: space.sm }}>
              {i > 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="small">{mealLabel(m.meal)}</Txt>
                  <Txt variant="h3">{m.name}</Txt>
                  <Txt variant="small">
                    {m.items.map((x) => `${x.name} ${x.amountLabel}`).join(' · ')}
                  </Txt>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Txt variant="num">{num(t.kcal, 0)}</Txt>
                  <Button
                    label={done ? 'Gelogd' : 'Log'}
                    icon={done ? 'check' : 'plus'}
                    size="sm"
                    variant={done ? 'ghost' : 'secondary'}
                    disabled={done}
                    onPress={() => {
                      logMealItems(m.items, dateKey(), m.meal);
                      success();
                      setLogged((l) => [...l, key]);
                    }}
                  />
                </View>
              </Row>
            </View>
          );
        })}
      </Card>

      {menu.shopping.length ? (
        <>
          <SectionTitle
            title="Boodschappen"
            action={<Txt variant="small">{open ? `nog ${open}` : 'alles in huis'}</Txt>}
          />
          <Card style={{ gap: space.sm }}>
            {menu.shopping.map((item, i) => (
              <Pressable
                key={i}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                accessibilityLabel={item.name}
                onPress={() => {
                  tap();
                  toggleShoppingItem(i);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: item.done ? c.accent : c.cardAlt,
                    borderWidth: item.done ? 0 : 1.5,
                    borderColor: c.textFaint,
                  }}>
                  {item.done ? <Icon name="check" size={13} color={c.onAccent} /> : null}
                </View>
                <Txt
                  style={{ flex: 1, textDecorationLine: item.done ? 'line-through' : 'none' }}
                  color={item.done ? c.textDim : c.text}>
                  {item.name}
                </Txt>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      <Button
        label="Nieuw weekmenu laten maken"
        icon="sparkles"
        variant="secondary"
        onPress={() => askCoach(COACH_REQUESTS.weekMenu)}
      />
      <Button
        label="Weekmenu verwijderen"
        variant="ghost"
        onPress={async () => {
          if (await confirm('Weekmenu verwijderen?', menu.title, 'Verwijder', true)) {
            setWeekMenu(null);
            if (router.canGoBack()) router.back();
          }
        }}
      />
    </StackScroll>
  );
}
