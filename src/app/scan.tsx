import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';

import { BarcodeCamera, CAMERA_SCANNING } from '@/components/barcode-camera';
import { MacroLine } from '@/components/shared';
import {
  Button,
  Card,
  Field,
  HeaderButton,
  Note,
  NumberField,
  Row,
  StackScroll,
  Txt,
  success,
} from '@/components/ui';
import { type ScannedProduct, cleanBarcode, isValidBarcode, lookupBarcode } from '@/lib/barcode';
import { dateKey, num, relativeDay } from '@/lib/format';
import { mealForNow, mealLabel } from '@/lib/nutrition';
import { space } from '@/lib/theme';
import type { Meal } from '@/lib/types';
import { useStore } from '@/store/store';

type Status = 'scan' | 'loading' | 'found' | 'not-found' | 'no-nutrition' | 'error';

/** Scan (or type) a barcode, look the product up in Open Food Facts and log it. */
export default function ScanScreen() {
  const params = useLocalSearchParams<{ date?: string; meal?: Meal }>();
  const date = params.date ?? dateKey();
  const meal = params.meal ?? mealForNow();
  const addFoodEntry = useStore((s) => s.addFoodEntry);
  const addCustomFood = useStore((s) => s.addCustomFood);
  const customFoods = useStore((s) => s.customFoods);

  const [status, setStatus] = useState<Status>('scan');
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [unknownName, setUnknownName] = useState('');
  const [grams, setGrams] = useState<number | null>(100);
  const busy = useRef(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/food'));

  const lookup = async (raw: string) => {
    const c = cleanBarcode(raw);
    if (busy.current || !isValidBarcode(c)) return;
    busy.current = true;
    setCode(c);
    setStatus('loading');
    const result = await lookupBarcode(c);
    busy.current = false;
    if (result.status === 'found') {
      setProduct(result.product);
      setGrams(result.product.servingGrams ?? 100);
    } else if (result.status === 'no-nutrition') setUnknownName(result.name);
    setStatus(result.status);
  };

  const again = () => {
    setProduct(null);
    setTyped('');
    setStatus('scan');
  };

  const label = product ? [product.brand, product.name].filter(Boolean).join(' · ') : '';
  const factor = (grams ?? 0) / 100;
  const macros = product
    ? {
        kcal: Math.round(product.kcal * factor),
        protein: Math.round(product.protein * factor * 10) / 10,
        carbs: Math.round(product.carbs * factor * 10) / 10,
        fat: Math.round(product.fat * factor * 10) / 10,
      }
    : null;

  const add = () => {
    if (!product || !macros || !grams) return;
    // Keep the product, so next time it shows up in the search without scanning.
    const existing = customFoods.find((f) => f.name === label);
    const foodId =
      existing?.id ??
      addCustomFood({
        name: label,
        basis: '100g',
        kcal: product.kcal,
        protein: product.protein,
        carbs: product.carbs,
        fat: product.fat,
        ...(product.servingGrams ? { unit: { label: 'portie', grams: product.servingGrams } } : {}),
      });
    addFoodEntry({
      ...macros,
      date,
      meal,
      name: label,
      foodId,
      amountLabel: `${String(grams).replace('.', ',')} g`,
      amount: grams,
      amountUnit: 'g',
    });
    success();
    close();
  };

  const typedCode = cleanBarcode(typed);

  return (
    <StackScroll>
      <Stack.Screen
        options={{
          title: `Scannen · ${mealLabel(meal)}`,
          headerLeft: () => <HeaderButton label="Sluit" onPress={close} />,
        }}
      />

      {status === 'scan' || status === 'loading' ? (
        <>
          {CAMERA_SCANNING ? (
            <BarcodeCamera onCode={lookup} paused={status !== 'scan'} />
          ) : null}
          <Card>
            <Txt variant="dim">
              {status === 'loading'
                ? `Product ${code} opzoeken…`
                : CAMERA_SCANNING
                  ? 'Hou de barcode over de groene lijn. Lukt het niet, typ dan de cijfers onder de streepjes.'
                  : 'Typ de cijfers die onder de streepjes van de barcode staan.'}
            </Txt>
            <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
              <Field
                label="Barcode"
                value={typed}
                onChangeText={setTyped}
                placeholder="bijv. 5410013108009"
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={14}
                onSubmitEditing={() => lookup(typed)}
              />
              <Button
                label="Zoek"
                variant="secondary"
                disabled={!isValidBarcode(typedCode) || status === 'loading'}
                onPress={() => lookup(typed)}
              />
            </Row>
            {typedCode.length >= 8 && !isValidBarcode(typedCode) ? (
              <Txt variant="small">
                Deze code klopt niet (het controlecijfer past niet). Kijk de cijfers na.
              </Txt>
            ) : null}
          </Card>
        </>
      ) : null}

      {status === 'found' && product && macros ? (
        <Card>
          <Txt variant="label">Gevonden</Txt>
          <Txt variant="h2">{product.name}</Txt>
          <Txt variant="small">
            {product.brand ? `${product.brand} · ` : ''}
            {num(product.kcal, 0)} kcal per 100 g · E {num(product.protein)} · K {num(product.carbs)}{' '}
            · V {num(product.fat)}
          </Txt>
          <NumberField label="Hoeveelheid (gram of ml)" value={grams} onChange={setGrams} />
          {product.servingGrams ? (
            <Txt variant="small">Eén portie volgens de verpakking: {product.servingGrams} g.</Txt>
          ) : null}
          <MacroLine m={macros} />
          <Button
            label={`Voeg toe aan ${mealLabel(meal)}`}
            size="lg"
            disabled={!grams || grams <= 0}
            onPress={add}
          />
          <Button label="Ander product scannen" variant="ghost" onPress={again} />
          <Txt variant="small">
            {relativeDay(date)} · het product staat hierna ook bij Zoeken.
          </Txt>
        </Card>
      ) : null}

      {status === 'not-found' || status === 'no-nutrition' || status === 'error' ? (
        <Card>
          <Txt variant="h3">
            {status === 'error'
              ? 'Opzoeken lukte niet'
              : status === 'no-nutrition'
                ? `${unknownName}: geen voedingswaarden bekend`
                : `Barcode ${code} niet gevonden`}
          </Txt>
          <Txt variant="dim">
            {status === 'error'
              ? 'Check je internet en probeer het opnieuw.'
              : 'Dit product staat niet (volledig) in Open Food Facts. Stuur een foto van het etiket naar je coach, of vul het zelf in bij Snel invoeren.'}
          </Txt>
          <Button label="Opnieuw scannen" variant="secondary" onPress={again} />
          {status !== 'error' ? (
            <Button
              label="Foto van het etiket naar de coach"
              icon="camera"
              variant="ghost"
              onPress={() =>
                router.replace({
                  pathname: '/coach',
                  params: { attach: 'camera', text: 'Log dit product van het etiket.' },
                })
              }
            />
          ) : null}
        </Card>
      ) : null}

      <Note>
        De voedingswaarden komen uit Open Food Facts, een open databank die door gebruikers wordt
        ingevuld. Klopt iets niet met de verpakking, dan heeft de verpakking gelijk.
      </Note>
    </StackScroll>
  );
}
