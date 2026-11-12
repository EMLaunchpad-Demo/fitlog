import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { SavedMeals } from '@/components/saved-meals';
import { MacroLine } from '@/components/shared';
import {
  Button,
  Card,
  Field,
  HeaderButton,
  NumberField,
  Row,
  SectionTitle,
  Segmented,
  StackScroll,
  Txt,
  success,
  tap,
} from '@/components/ui';
import { BUILT_IN_FOODS } from '@/data/foods';
import { dateKey, num, relativeDay } from '@/lib/format';
import { MEALS, amountLabel, macrosFor, mealForNow, mealLabel, recentFoods } from '@/lib/nutrition';
import { radius, space, useColors } from '@/lib/theme';
import type { Food, Macros, Meal } from '@/lib/types';
import { findFood, useStore } from '@/store/store';

type Unit = 'g' | 'unit' | 'portie';

export default function FoodAdd() {
  const c = useColors();
  const params = useLocalSearchParams<{ date?: string; meal?: Meal; tab?: 'search' | 'meals' }>();
  const date = params.date ?? dateKey();
  const [meal, setMeal] = useState<Meal>(params.meal ?? mealForNow());
  const [tab, setTab] = useState<'search' | 'quick' | 'meals'>(params.tab ?? 'search');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>('g');
  const [added, setAdded] = useState<string[]>([]);

  const foodLog = useStore((s) => s.foodLog);
  const customFoods = useStore((s) => s.customFoods);
  const addFoodEntry = useStore((s) => s.addFoodEntry);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/food'));

  const select = (food: Food, lastAmount?: number, lastUnit?: Unit) => {
    tap();
    setSelected(food);
    if (food.basis === 'portie') {
      setUnit('portie');
      setAmount(lastAmount ?? 1);
    } else if (lastAmount && lastUnit && lastUnit !== 'portie') {
      setUnit(lastUnit);
      setAmount(lastAmount);
    } else if (food.unit) {
      setUnit('unit');
      setAmount(1);
    } else {
      setUnit('g');
      setAmount(100);
    }
  };

  const add = (
    entry: Macros & {
      name: string;
      amountLabel: string;
      foodId?: string;
      amount?: number;
      amountUnit?: Unit;
    },
  ) => {
    addFoodEntry({ ...entry, date, meal });
    success();
    setAdded((a) => [...a, entry.name]);
    setSelected(null);
    setQuery('');
  };

  const q = query.trim().toLowerCase();
  const allFoods = [...customFoods, ...BUILT_IN_FOODS];
  const results = q ? allFoods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 40) : [];
  const recents = recentFoods(foodLog);

  // Group the full list by category when not searching.
  const byCategory = new Map<string, Food[]>();
  if (!q) {
    for (const f of allFoods) {
      const cat = f.custom ? 'Eigen producten' : (f.category ?? 'Overig');
      byCategory.set(cat, [...(byCategory.get(cat) ?? []), f]);
    }
  }

  const preview = selected && amount ? macrosFor(selected, amount, unit) : null;

  return (
    <StackScroll>
      <Stack.Screen
        options={{
          title: `${mealLabel(meal)} · ${relativeDay(date)}`,
          headerLeft: () => (
            <HeaderButton
              label={added.length ? 'Klaar' : 'Sluit'}
              strong={added.length > 0}
              onPress={close}
            />
          ),
        }}
      />

      <Segmented options={MEALS} value={meal} onChange={setMeal} />

      {added.length ? (
        <Card tone="alt" style={{ paddingVertical: space.md }}>
          <Row gap={6} style={{ alignItems: 'flex-start' }}>
            <Icon name="check" size={16} color={c.success} />
            <Txt variant="dim" style={{ flex: 1 }}>
              Toegevoegd: {added.join(', ')}
            </Txt>
          </Row>
        </Card>
      ) : null}

      <Segmented
        options={[
          { key: 'search', label: 'Zoeken' },
          { key: 'quick', label: 'Snel invoeren' },
          { key: 'meals', label: 'Maaltijden' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'meals' ? (
        <SavedMeals date={date} meal={meal} onAdded={(name) => setAdded((x) => [...x, name])} />
      ) : tab === 'quick' ? (
        <QuickAdd onAdd={add} />
      ) : (
        <>
          <Button
            label="Scan barcode"
            icon="barcode"
            variant="secondary"
            onPress={() => router.push({ pathname: '/scan', params: { date, meal } })}
          />
          {selected ? (
            <Card style={{ borderColor: c.accent, borderWidth: 1.5 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="h3" style={{ flex: 1 }}>
                  {selected.name}
                </Txt>
                <Pressable
                  onPress={() => setSelected(null)}
                  hitSlop={8}
                  accessibilityLabel="Selectie wissen">
                  <Icon name="close" size={16} color={c.textDim} />
                </Pressable>
              </Row>
              <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
                <NumberField
                  label="Hoeveelheid"
                  value={amount}
                  onChange={setAmount}
                  style={{ width: 110 }}
                  align="center"
                />
                {selected.basis === '100g' ? (
                  <View style={{ flex: 1 }}>
                    <Segmented
                      options={[
                        { key: 'g' as Unit, label: 'gram' },
                        ...(selected.unit
                          ? [{ key: 'unit' as Unit, label: selected.unit.label }]
                          : []),
                      ]}
                      value={unit}
                      onChange={(u) => {
                        setUnit(u);
                        setAmount(
                          u === 'g'
                            ? selected.unit && amount
                              ? Math.round(amount * selected.unit.grams)
                              : 100
                            : 1,
                        );
                      }}
                    />
                  </View>
                ) : (
                  <Txt variant="dim" style={{ flex: 1, paddingBottom: 12 }}>
                    {amount === 1 ? 'portie' : 'porties'}
                  </Txt>
                )}
              </Row>
              {selected.unit && selected.basis === '100g' ? (
                <Txt variant="small">
                  1 {selected.unit.label} = {selected.unit.grams} g · {num(selected.kcal, 0)} kcal
                  per 100 g
                </Txt>
              ) : null}
              {preview ? <MacroLine m={preview} /> : null}
              <Button
                label={`Voeg toe aan ${mealLabel(meal)}`}
                size="lg"
                disabled={!amount}
                onPress={() =>
                  preview &&
                  amount &&
                  add({
                    ...preview,
                    name: selected.name,
                    foodId: selected.id,
                    amountLabel: amountLabel(selected, amount, unit),
                    amount,
                    amountUnit: unit,
                  })
                }
              />
            </Card>
          ) : null}

          <Field
            placeholder="Zoek product, bijv. kwark"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />

          {q ? (
            results.length ? (
              <FoodList foods={results} onPress={(f) => select(f)} />
            ) : (
              <Card tone="alt">
                <Txt variant="dim">
                  Niets gevonden voor &quot;{query}&quot;. Gebruik Snel invoeren om het zelf toe te
                  voegen.
                </Txt>
                <Button label="Snel invoeren" variant="secondary" onPress={() => setTab('quick')} />
              </Card>
            )
          ) : (
            <>
              {recents.length ? (
                <>
                  <SectionTitle title="Recent" />
                  <View style={{ gap: 6 }}>
                    {recents.map((e) => {
                      const food = e.foodId ? findFood(e.foodId, customFoods) : undefined;
                      return (
                        <FoodRow
                          key={e.id}
                          title={e.name}
                          subtitle={`${e.amountLabel} · ${num(e.kcal, 0)} kcal`}
                          onPress={() =>
                            food
                              ? select(food, e.amount, e.amountUnit)
                              : add({
                                  name: e.name,
                                  amountLabel: e.amountLabel,
                                  kcal: e.kcal,
                                  protein: e.protein,
                                  carbs: e.carbs,
                                  fat: e.fat,
                                })
                          }
                        />
                      );
                    })}
                  </View>
                </>
              ) : null}
              {[...byCategory.entries()].map(([cat, foods]) => (
                <View key={cat} style={{ gap: space.md }}>
                  <SectionTitle title={cat} />
                  <FoodList foods={foods} onPress={(f) => select(f)} />
                </View>
              ))}
              <Txt variant="small" style={{ textAlign: 'center' }}>
                Waarden zijn gemiddelden per 100 g. Check het etiket voor exacte cijfers.
              </Txt>
            </>
          )}
        </>
      )}
    </StackScroll>
  );
}

function FoodList({ foods, onPress }: { foods: Food[]; onPress: (f: Food) => void }) {
  return (
    <View style={{ gap: 6 }}>
      {foods.map((f) => (
        <FoodRow
          key={f.id}
          title={f.name}
          subtitle={
            f.basis === 'portie'
              ? `${num(f.kcal, 0)} kcal per portie`
              : `${num(f.kcal, 0)} kcal / 100 g · E ${num(f.protein)} g${f.unit ? ` · 1 ${f.unit.label} = ${f.unit.grams} g` : ''}`
          }
          onPress={() => onPress(f)}
        />
      ))}
    </View>
  );
}

function FoodRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: c.card,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="h3" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="small" numberOfLines={1}>
          {subtitle}
        </Txt>
      </View>
      <Icon name="plus" size={16} color={c.accent} />
    </Pressable>
  );
}

function QuickAdd({
  onAdd,
}: {
  onAdd: (
    e: Macros & {
      name: string;
      amountLabel: string;
      foodId?: string;
      amount?: number;
      amountUnit?: Unit;
    },
  ) => void;
}) {
  const c = useColors();
  const addCustomFood = useStore((s) => s.addCustomFood);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [save, setSave] = useState(true);

  // Fill in kcal from macros when left empty.
  const derivedKcal = Math.round((protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9);
  const finalKcal = kcal ?? (derivedKcal || null);

  const submit = () => {
    if (!name.trim() || finalKcal == null) return;
    const macros = { kcal: finalKcal, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
    let foodId: string | undefined;
    if (save) foodId = addCustomFood({ name: name.trim(), basis: 'portie', ...macros });
    onAdd({
      ...macros,
      name: name.trim(),
      amountLabel: '1 portie',
      foodId,
      amount: 1,
      amountUnit: 'portie',
    });
    setName('');
    setKcal(null);
    setProtein(null);
    setCarbs(null);
    setFat(null);
  };

  return (
    <Card>
      <Field
        label="Wat heb je gegeten?"
        placeholder="Bijv. Eiwitshake"
        value={name}
        onChangeText={setName}
      />
      <Row gap={space.md}>
        <NumberField
          label="Calorieën (kcal)"
          value={kcal}
          onChange={setKcal}
          decimals={false}
          placeholder={derivedKcal ? String(derivedKcal) : ''}
          style={{ flex: 1 }}
        />
      </Row>
      <Row gap={space.sm}>
        <NumberField label="Eiwit (g)" value={protein} onChange={setProtein} style={{ flex: 1 }} />
        <NumberField label="Koolh. (g)" value={carbs} onChange={setCarbs} style={{ flex: 1 }} />
        <NumberField label="Vet (g)" value={fat} onChange={setFat} style={{ flex: 1 }} />
      </Row>
      <Pressable
        onPress={() => setSave(!save)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: save }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: save ? c.accent : c.cardAlt,
          }}>
          {save ? <Icon name="check" size={13} color={c.onAccent} /> : null}
        </View>
        <Txt variant="dim">Bewaar als eigen product (per portie)</Txt>
      </Pressable>
      <Button
        label="Toevoegen"
        size="lg"
        disabled={!name.trim() || finalKcal == null}
        onPress={submit}
      />
    </Card>
  );
}
