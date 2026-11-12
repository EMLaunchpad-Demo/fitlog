/** Looking up packaged food by barcode in Open Food Facts (free, open database). */

export interface ScannedProduct {
  code: string;
  name: string;
  brand: string | null;
  /** Per 100 g (or 100 ml) */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Grams in one serving, when the pack says so */
  servingGrams: number | null;
}

export type LookupResult =
  | { status: 'found'; product: ScannedProduct }
  | { status: 'no-nutrition'; name: string }
  | { status: 'not-found' }
  | { status: 'error' };

/** Digits only; EAN-13, EAN-8, UPC-A (12) and UPC-E (8) all carry a check digit. */
export function cleanBarcode(text: string): string {
  return text.replace(/\D/g, '');
}

/** Checks the check digit, so a misread never turns into the wrong product. */
export function isValidBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  // From the right, the weights alternate 3, 1, 3, …
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const numberOr = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<LookupResult> {
  const fields =
    'code,product_name,product_name_nl,generic_name_nl,brands,serving_quantity,nutriments';
  let data: { status?: number; product?: Record<string, unknown> };
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`,
      { signal },
    );
    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) return { status: 'error' };
    data = await res.json();
  } catch {
    return { status: 'error' };
  }
  const p = data.product;
  if (data.status !== 1 || !p) return { status: 'not-found' };

  const text = (key: string) => (typeof p[key] === 'string' ? (p[key] as string).trim() : '');
  const name = text('product_name_nl') || text('product_name') || text('generic_name_nl');
  const brand = text('brands').split(',')[0]?.trim() || null;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kj = numberOr(n['energy_100g']);
  const kcal = numberOr(n['energy-kcal_100g']) ?? (kj != null ? kj / 4.184 : null);
  const protein = numberOr(n['proteins_100g']);
  const carbs = numberOr(n['carbohydrates_100g']);
  const fat = numberOr(n['fat_100g']);
  if (kcal == null || protein == null || carbs == null || fat == null)
    return { status: 'no-nutrition', name: name || code };

  const serving = numberOr(p.serving_quantity);
  return {
    status: 'found',
    product: {
      code,
      name: name || `Product ${code}`,
      brand,
      kcal: Math.round(kcal),
      protein: round1(protein),
      carbs: round1(carbs),
      fat: round1(fat),
      servingGrams: serving != null && serving >= 1 && serving <= 2000 ? Math.round(serving) : null,
    },
  };
}
