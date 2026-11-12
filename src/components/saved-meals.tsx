import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Divider,
  Field,
  IconButton,
  NumberField,
  Row,
  SectionTitle,
  Txt,
  confirm,
  success,
  tap,
} from '@/components/ui';
import { addDays, num, relativeDay } from '@/lib/format';
import { mealLabel, sumMacros } from '@/lib/nutrition';
import { space, useColors } from '@/lib/theme';
import type { Meal, MealItem } from '@/lib/types';
import { useStore } from '@/store/store';

/**
 * The "Maaltijden" tab of the add-food screen: saved meals and recipes to log
 * in one tap, the same meal as yesterday, and saving what is logged now.
 */
export function SavedMeals({
  date,
  meal,
  onAdded,
}: {
  date: string;
  meal: Meal;
  onAdded: (name: string) => void;
}) {
  const c = useColors();
  const savedMeals = useStore((s) => s.savedMeals);
  const foodLog = useStore((s) => s.foodLog);
  const weekMenu = useStore((s) => s.weekMenu);
  const logMealItems = useStore((s) => s.logMealItems);
  const saveMeal = useStore((s) => s.saveMeal);
  const removeSavedMeal = useStore((s) => s.removeSavedMeal);

  const [openId, setOpenId] = useState<string | null>(null);
  const [portions, setPortions] = useState<number | null>(1);
  const [name, setName] = useState('');
  const [recipePortions, setRecipePortions] = useState<number | null>(1);

  const toItems = (entries: typeof foodLog): MealItem[] =>
    entries.map((e) => ({
      name: e.name,
      amountLabel: e.amountLabel,
      kcal: e.kcal,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
    }));
  const current = foodLog.filter((e) => e.date === date && e.meal === meal);
  const yesterday = addDays(date, -1);
  const before = foodLog.filter((e) => e.date === yesterday && e.meal === meal);
  const beforeKcal = sumMacros(before).kcal;

  const log = (items: MealItem[], label: string, factor = 1) => {
    logMealItems(items, date, meal, factor);
    success();
    onAdded(label);
    setOpenId(null);
  };

  const sorted = [...savedMeals].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {before.length ? (
        <Card onPress={() => log(toItems(before), `${mealLabel(meal)} van ${relativeDay(yesterday).toLowerCase()}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={space.md} style={{ flex: 1 }}>
              <Icon name="repeat" size={20} color={c.accent} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Zelfde als {relativeDay(yesterday).toLowerCase()}</Txt>
                <Txt variant="small" numberOfLines={1}>
                  {before.map((e) => e.name).join(', ')}
                </Txt>
              </View>
            </Row>
            <Txt variant="num">{num(beforeKcal, 0)} kcal</Txt>
          </Row>
        </Card>
      ) : null}

      {sorted.length ? (
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          {sorted.map((m, i) => {
            const t = sumMacros(m.items);
            const open = openId === m.id;
            const eaten = portions && portions > 0 ? portions : 1;
            return (
              <View key={m.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    tap();
                    setOpenId(open ? null : m.id);
                    setPortions(1);
                  }}
                  style={{ paddingVertical: space.md, gap: 2 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt variant="h3" numberOfLines={1} style={{ flex: 1 }}>
                      {m.name}
                    </Txt>
                    <Txt variant="num">{num(t.kcal / m.portions, 0)} kcal</Txt>
                  </Row>
                  <Txt variant="small" numberOfLines={open ? undefined : 1}>
                    {m.portions > 1 ? `per portie (recept voor ${m.portions}) · ` : ''}E{' '}
                    {num(t.protein / m.portions, 0)} g · {m.items.map((x) => x.name).join(', ')}
                  </Txt>
                </Pressable>
                {open ? (
                  <Row gap={space.sm} style={{ alignItems: 'flex-end', paddingBottom: space.md }}>
                    <NumberField
                      label="Porties"
                      value={portions}
                      onChange={setPortions}
                      style={{ width: 84 }}
                    />
                    <Button
                      label={`Voeg toe aan ${mealLabel(meal)}`}
                      style={{ flex: 1 }}
                      onPress={() => log(m.items, m.name, eaten / m.portions)}
                    />
                    <IconButton
                      icon="trash"
                      label={`${m.name} verwijderen`}
                      onPress={async () => {
                        if (await confirm('Maaltijd verwijderen?', m.name, 'Verwijder', true))
                          removeSavedMeal(m.id);
                      }}
                    />
                  </Row>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : (
        <Card tone="alt">
          <Txt variant="dim">
            Nog geen bewaarde maaltijden. Log een maaltijd en bewaar hem hieronder, of vraag je coach
            om een recept te bewaren. Daarna log je hem met één tik.
          </Txt>
        </Card>
      )}

      {current.length ? (
        <>
          <SectionTitle title={`${mealLabel(meal)} van ${relativeDay(date).toLowerCase()} bewaren`} />
          <Card>
            <Txt variant="small" numberOfLines={2}>
              {current.map((e) => e.name).join(', ')} · {num(sumMacros(current).kcal, 0)} kcal
            </Txt>
            <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
              <Field
                label="Naam"
                value={name}
                onChangeText={setName}
                placeholder="Bijv. Mijn ontbijt"
              />
              <NumberField
                label="Porties"
                value={recipePortions}
                onChange={setRecipePortions}
                decimals={false}
                style={{ width: 76 }}
              />
            </Row>
            <Button
              label="Bewaar als maaltijd"
              variant="secondary"
              disabled={!name.trim()}
              onPress={() => {
                saveMeal({
                  name,
                  portions: recipePortions && recipePortions >= 1 ? Math.round(recipePortions) : 1,
                  items: toItems(current),
                });
                success();
                setName('');
              }}
            />
            <Txt variant="small">
              Porties: voor hoeveel keer eten dit is. Bij een recept voor vier log je later één
              portie.
            </Txt>
          </Card>
        </>
      ) : null}

      <Card onPress={() => router.push('/menu')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.md} style={{ flex: 1 }}>
            <Icon name="calendar" size={20} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Weekmenu</Txt>
              <Txt variant="small" numberOfLines={1}>
                {weekMenu ? weekMenu.title : 'Laat je coach een menu met boodschappenlijst maken'}
              </Txt>
            </View>
          </Row>
          <Icon name="chevronRight" size={14} color={c.textFaint} />
        </Row>
      </Card>
    </>
  );
}
