import type { Food } from '@/lib/types';

/**
 * Common foods with approximate values per 100 g (kcal, protein, carbs, fat).
 * Values are rounded estimates based on typical Dutch products; check the
 * package label when you want exact numbers.
 */
type Row = [
  id: string,
  name: string,
  category: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  unit?: [label: string, grams: number],
];

const rows: Row[] = [
  // Brood & ontbijt
  ['volkorenbrood', 'Volkorenbrood', 'Brood & ontbijt', 230, 9.5, 38, 2.8, ['snee', 35]],
  ['witbrood', 'Witbrood', 'Brood & ontbijt', 250, 8.5, 47, 2.5, ['snee', 30]],
  ['havermout', 'Havermout', 'Brood & ontbijt', 370, 13, 59, 7, ['portie', 40]],
  ['muesli', 'Muesli', 'Brood & ontbijt', 360, 10, 62, 6.5, ['portie', 50]],
  ['cornflakes', 'Cornflakes', 'Brood & ontbijt', 375, 7, 84, 0.9, ['portie', 30]],
  ['beschuit', 'Beschuit', 'Brood & ontbijt', 400, 10, 73, 6.5, ['stuk', 10]],
  ['rijstwafel', 'Rijstwafel', 'Brood & ontbijt', 380, 8, 80, 3, ['stuk', 8]],
  ['wrap', 'Wrap (tortilla)', 'Brood & ontbijt', 300, 8, 50, 7, ['stuk', 60]],
  ['croissant', 'Croissant', 'Brood & ontbijt', 410, 8, 45, 21, ['stuk', 55]],

  // Zuivel & ei
  ['ei', 'Ei (gekookt)', 'Zuivel & ei', 140, 12.5, 0.3, 10, ['stuk', 55]],
  ['melk-halfvol', 'Halfvolle melk', 'Zuivel & ei', 46, 3.5, 4.7, 1.5, ['glas', 200]],
  ['melk-mager', 'Magere melk', 'Zuivel & ei', 35, 3.6, 4.7, 0.1, ['glas', 200]],
  ['kwark-mager', 'Magere kwark', 'Zuivel & ei', 57, 10, 3.7, 0.2, ['bakje', 150]],
  ['skyr', 'Skyr', 'Zuivel & ei', 63, 11, 4, 0.2, ['bakje', 150]],
  ['griekse-yoghurt', 'Griekse yoghurt (vol)', 'Zuivel & ei', 120, 4.5, 4, 10, ['bakje', 150]],
  ['yoghurt-halfvol', 'Halfvolle yoghurt', 'Zuivel & ei', 47, 4, 4.6, 1.5, ['schaaltje', 150]],
  ['kaas-48', 'Kaas jong belegen 48+', 'Zuivel & ei', 360, 23, 0, 30, ['plak', 20]],
  ['kaas-30', 'Kaas 30+', 'Zuivel & ei', 270, 30, 0, 16.5, ['plak', 20]],
  ['huttenkase', 'Hüttenkäse', 'Zuivel & ei', 98, 11, 3.4, 4.3, ['bakje', 100]],
  ['mozzarella', 'Mozzarella', 'Zuivel & ei', 250, 18, 1, 19, ['bol', 125]],
  ['roomboter', 'Roomboter', 'Zuivel & ei', 740, 0.6, 0.6, 82, ['besmeren', 5]],

  // Vlees, vis & vega
  ['kipfilet', 'Kipfilet (rauw)', 'Vlees, vis & vega', 110, 23.5, 0, 1.5],
  ['kalkoenfilet', 'Kalkoenfilet (rauw)', 'Vlees, vis & vega', 105, 23.5, 0, 1.2],
  ['rundergehakt', 'Rundergehakt (rauw)', 'Vlees, vis & vega', 200, 20, 0, 13.5],
  ['biefstuk', 'Biefstuk (rauw)', 'Vlees, vis & vega', 125, 22, 0, 4],
  ['zalm', 'Zalm (rauw)', 'Vlees, vis & vega', 200, 20, 0, 13],
  ['tonijn-blik', 'Tonijn in water (blik)', 'Vlees, vis & vega', 105, 24, 0, 1, ['blikje', 120]],
  ['garnalen', 'Garnalen', 'Vlees, vis & vega', 85, 19, 0, 1],
  ['ham', 'Ham (beleg)', 'Vlees, vis & vega', 115, 19, 1, 3.8, ['plak', 15]],
  ['kipfilet-beleg', 'Kipfilet (beleg)', 'Vlees, vis & vega', 100, 21, 1, 1.5, ['plak', 15]],
  ['tofu', 'Tofu', 'Vlees, vis & vega', 125, 12.5, 2, 7.5],
  ['tempeh', 'Tempeh', 'Vlees, vis & vega', 190, 19, 8, 10.5],
  ['linzen', 'Linzen (gekookt)', 'Vlees, vis & vega', 115, 9, 17, 0.4],
  ['kikkererwten', 'Kikkererwten (blik)', 'Vlees, vis & vega', 125, 7, 15, 2.5],
  ['zwarte-bonen', 'Zwarte bonen (blik)', 'Vlees, vis & vega', 110, 7.5, 15, 0.6],

  // Aardappel, rijst & pasta
  ['rijst-wit', 'Witte rijst (gekookt)', 'Aardappel, rijst & pasta', 130, 2.7, 28, 0.3],
  ['rijst-zilvervlies', 'Zilvervliesrijst (gekookt)', 'Aardappel, rijst & pasta', 120, 2.8, 25, 1],
  ['pasta', 'Pasta (gekookt)', 'Aardappel, rijst & pasta', 155, 5.5, 30, 0.9],
  ['pasta-volkoren', 'Volkoren pasta (gekookt)', 'Aardappel, rijst & pasta', 140, 6, 26, 1.2],
  ['aardappel', 'Aardappelen (gekookt)', 'Aardappel, rijst & pasta', 80, 2, 17, 0.1],
  ['zoete-aardappel', 'Zoete aardappel (gekookt)', 'Aardappel, rijst & pasta', 86, 1.6, 20, 0.1],
  ['couscous', 'Couscous (bereid)', 'Aardappel, rijst & pasta', 112, 3.8, 23, 0.2],
  ['quinoa', 'Quinoa (gekookt)', 'Aardappel, rijst & pasta', 120, 4.4, 21, 1.9],
  ['friet', 'Friet', 'Aardappel, rijst & pasta', 300, 3.5, 38, 15, ['portie', 165]],

  // Groente & fruit
  ['banaan', 'Banaan', 'Groente & fruit', 90, 1.1, 20, 0.3, ['stuk', 120]],
  ['appel', 'Appel', 'Groente & fruit', 52, 0.3, 12, 0.2, ['stuk', 150]],
  ['sinaasappel', 'Sinaasappel', 'Groente & fruit', 45, 0.9, 9.5, 0.2, ['stuk', 150]],
  ['blauwe-bessen', 'Blauwe bessen', 'Groente & fruit', 57, 0.7, 12, 0.3, ['bakje', 125]],
  ['aardbeien', 'Aardbeien', 'Groente & fruit', 32, 0.7, 6, 0.3, ['bakje', 250]],
  ['druiven', 'Druiven', 'Groente & fruit', 69, 0.7, 16, 0.2],
  ['avocado', 'Avocado', 'Groente & fruit', 160, 2, 2, 15, ['stuk', 140]],
  ['broccoli', 'Broccoli', 'Groente & fruit', 34, 2.8, 4, 0.4],
  ['spinazie', 'Spinazie', 'Groente & fruit', 23, 2.9, 1.4, 0.4],
  ['paprika', 'Paprika', 'Groente & fruit', 31, 1, 6, 0.3, ['stuk', 150]],
  ['tomaat', 'Tomaat', 'Groente & fruit', 18, 0.9, 3, 0.2, ['stuk', 100]],
  ['komkommer', 'Komkommer', 'Groente & fruit', 15, 0.7, 2.5, 0.1],
  ['wortel', 'Wortel', 'Groente & fruit', 41, 0.9, 7, 0.2, ['stuk', 80]],
  ['sla', 'Sla', 'Groente & fruit', 15, 1.3, 1.5, 0.2],

  // Snacks & beleg
  ['pindakaas', 'Pindakaas', 'Snacks & beleg', 620, 25, 13, 50, ['portie', 15]],
  ['hagelslag', 'Hagelslag (puur)', 'Snacks & beleg', 480, 5, 70, 20, ['portie', 15]],
  ['jam', 'Jam', 'Snacks & beleg', 250, 0.4, 61, 0.1, ['portie', 15]],
  ['honing', 'Honing', 'Snacks & beleg', 330, 0.4, 82, 0, ['theelepel', 7]],
  ['hummus', 'Hummus', 'Snacks & beleg', 280, 7, 11, 23, ['portie', 30]],
  ['amandelen', 'Amandelen', 'Snacks & beleg', 600, 21, 9, 50, ['handje', 25]],
  ['walnoten', 'Walnoten', 'Snacks & beleg', 690, 15, 7, 65, ['handje', 25]],
  ['notenmix', 'Notenmix (ongezouten)', 'Snacks & beleg', 620, 20, 12, 53, ['handje', 25]],
  ['chocolade-puur', 'Pure chocolade (70%)', 'Snacks & beleg', 580, 8, 34, 43, ['stukje', 10]],
  ['proteinereep', 'Proteïnereep', 'Snacks & beleg', 360, 32, 30, 11, ['stuk', 55]],
  ['chips', 'Chips (naturel)', 'Snacks & beleg', 540, 6, 50, 34, ['zakje', 40]],
  ['ontbijtkoek', 'Ontbijtkoek', 'Snacks & beleg', 315, 4, 68, 1.5, ['plak', 25]],
  ['stroopwafel', 'Stroopwafel', 'Snacks & beleg', 460, 4, 65, 19, ['stuk', 30]],
  ['pizza', 'Pizza margherita', 'Snacks & beleg', 250, 11, 30, 9, ['punt', 100]],

  // Dranken & overig
  ['whey', 'Whey proteïne (poeder)', 'Dranken & overig', 380, 75, 8, 6, ['schep', 30]],
  ['jus', 'Sinaasappelsap', 'Dranken & overig', 45, 0.7, 10, 0.1, ['glas', 200]],
  ['cola', 'Cola', 'Dranken & overig', 42, 0, 10.6, 0, ['blikje', 330]],
  ['bier', 'Bier (pils)', 'Dranken & overig', 41, 0.4, 3, 0, ['flesje', 300]],
  ['wijn-rood', 'Rode wijn', 'Dranken & overig', 85, 0.1, 2.5, 0, ['glas', 125]],
  ['olijfolie', 'Olijfolie', 'Dranken & overig', 884, 0, 0, 100, ['eetlepel', 10]],
  ['mayonaise', 'Mayonaise', 'Dranken & overig', 700, 1, 2, 76, ['eetlepel', 15]],
  ['ketchup', 'Ketchup', 'Dranken & overig', 110, 1.2, 25, 0.2, ['eetlepel', 15]],
];

export const BUILT_IN_FOODS: Food[] = rows.map(
  ([id, name, category, kcal, protein, carbs, fat, unit]) => ({
    id,
    name,
    category,
    basis: '100g',
    kcal,
    protein,
    carbs,
    fat,
    unit: unit ? { label: unit[0], grams: unit[1] } : undefined,
  }),
);
