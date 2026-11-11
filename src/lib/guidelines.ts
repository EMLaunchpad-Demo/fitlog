import { hoursLabel } from './time';

/**
 * The numbers behind the app's defaults and advice, with their sources.
 * Evidence strength is stated per point: several widely repeated rules
 * (deload every N weeks, fixed rest times, a "10.000 steps" threshold) turn
 * out to be convention rather than evidence, and the texts say so.
 */

/** Hard sets per muscle group per week: the range where most of the growth happens. */
export const VOLUME_RANGE: [number, number] = [10, 20];

/** Hours before bedtime after which coffee still measurably shortens sleep (Gardiner 2023). */
export const CAFFEINE_CUTOFF_HOURS = 9;

/**
 * Recommended sleep per night in hours. 13–18 years: 8–10 hours (American
 * Academy of Sleep Medicine, Paruthi 2016); adults at least 7, with 7–9 as
 * the range for 18–25 year olds (National Sleep Foundation, Hirshkowitz 2015).
 */
export function sleepRange(age: number | null): [number, number] {
  return age != null && age < 18 ? [8, 10] : [7, 9];
}

export function sleepAdvice(age: number | null, targetMin: number): string {
  const [lo, hi] = sleepRange(age);
  const who = age != null && age < 18 ? 'Tieners' : 'Volwassenen';
  const base = `${who} hebben ${lo}-${hi} uur slaap per nacht nodig.`;
  if (targetMin < lo * 60)
    return `${base} Je schema geeft je ${hoursLabel(targetMin)}: ga vroeger naar bed als dat kan.`;
  return `${base} Je schema past daarin.`;
}

/** Still growing: official guidance is to not diet at a healthy weight (AAP, Carl 2017). */
export function isMinor(age: number | null): boolean {
  return age != null && age < 18;
}

export const MINOR_CUT_NOTE =
  'Je bent jonger dan 18. Zolang je groeit raden kinderartsen en sportartsen afvallen af als je een gezond gewicht hebt: je lichaam heeft de energie nodig. Kies liever onderhoud, hou een cut kort en mild (hooguit 0,5% per week) en bespreek hem met je huisarts of een sportdiëtist.';

export type Strength = 'sterk' | 'matig' | 'zwak' | 'consensus';

export const STRENGTH_LABEL: Record<Strength, string> = {
  sterk: 'sterk bewijs',
  matig: 'redelijk bewijs',
  zwak: 'zwak bewijs',
  consensus: 'richtlijn',
};

export interface GuidePoint {
  text: string;
  strength: Strength;
  sources: { label: string; url: string }[];
}

export interface GuideSection {
  key: string;
  title: string;
  points: GuidePoint[];
}

const pm = (id: string) => `https://pubmed.ncbi.nlm.nih.gov/${id}/`;

export const GUIDE: GuideSection[] = [
  {
    key: 'training',
    title: 'Training',
    points: [
      {
        text: 'Meer sets geven meer spiergroei, maar elke extra set levert minder op. Onder ongeveer 4 sets per spiergroep per week gebeurt er weinig, tussen 10 en 20 zit het meeste rendement, boven 30 komt er nauwelijks nog iets bij.',
        strength: 'matig',
        sources: [{ label: 'Pelland 2026', url: pm('41343037') }],
      },
      {
        text: 'Stoppen met 1-2 reps in reserve werkt even goed als tot falen gaan, en je herstelt sneller. Let op: de meeste mensen hebben ongeveer één rep meer over dan ze denken.',
        strength: 'matig',
        sources: [
          { label: 'Robinson 2024', url: pm('38970765') },
          { label: 'Refalo 2023', url: pm('36334240') },
          { label: 'Halperin 2022', url: pm('34542869') },
        ],
      },
      {
        text: 'Het aantal reps maakt weinig uit: van zwaar tot licht (vanaf ongeveer 30% van je max) groei je even goed, zolang de set zwaar aanvoelt. 6-12 reps is vooral praktisch.',
        strength: 'sterk',
        sources: [
          { label: 'Schoenfeld 2021', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7927075/' },
        ],
      },
      {
        text: 'Hoe vaak je een spiergroep per week traint doet er nauwelijks toe als het totaal aantal sets gelijk blijft. Minstens 2× per week is wel beter voor kracht.',
        strength: 'sterk',
        sources: [{ label: 'Schoenfeld 2019', url: pm('30558493') }],
      },
      {
        text: 'Langer dan een minuut rusten helpt een beetje; boven ongeveer 90 seconden is er voor spiergroei geen extra voordeel aangetoond. Langer rusten bij zware basisoefeningen is gewoonte (en prettig), geen bewezen regel.',
        strength: 'zwak',
        sources: [
          {
            label: 'Singer 2024',
            url: 'https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full',
          },
        ],
      },
      {
        text: 'Voor een vaste deloadweek om de zoveel weken is weinig bewijs. In de enige goede studie gaf een rustweek evenveel spiergroei en iets minder krachtwinst. Neem een lichte week als je vermoeidheid opstapelt, niet uit gewoonte.',
        strength: 'zwak',
        sources: [
          { label: 'Coleman 2024', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10809978/' },
          { label: 'Bell 2023', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/' },
        ],
      },
    ],
  },
  {
    key: 'voeding',
    title: 'Voeding',
    points: [
      {
        text: 'Val bij een cut 0,5 tot 1% van je lichaamsgewicht per week af. Ben je al slank, blijf dan op 0,5% of lager: sneller kost spiermassa.',
        strength: 'matig',
        sources: [
          { label: 'Helms 2014', url: pm('24864135') },
          { label: 'Garthe 2011', url: pm('21558571') },
          { label: 'Murphy 2022', url: pm('34623696') },
        ],
      },
      {
        text: 'Eiwit: op onderhoud is 1,6 g per kg lichaamsgewicht genoeg. In een cut helpt meer om spieren te houden: 1,8 tot 2,7 g per kg. De app rekent met 2 g per kg.',
        strength: 'matig',
        sources: [
          { label: 'Morton 2018', url: pm('28698222') },
          { label: 'Helms 2014', url: pm('24092765') },
        ],
      },
      {
        text: 'Hou vet op minstens 0,5 g per kg, of 15-30% van je calorieën. Diëten met heel weinig vet verlaagden in studies het testosteron.',
        strength: 'zwak',
        sources: [
          { label: 'Whittaker 2021', url: pm('33741447') },
          { label: 'Iraki 2019', url: pm('31247944') },
        ],
      },
      {
        text: '25 tot 29 gram vezels per dag hangt samen met de beste gezondheidsuitkomsten: groenten, fruit, volkoren en peulvruchten.',
        strength: 'matig',
        sources: [{ label: 'Reynolds 2019', url: pm('30638909') }],
      },
      {
        text: 'Een dieetpauze of refeed levert geen betere lichaamssamenstelling op, maar wel minder honger. Doe het als het je helpt volhouden.',
        strength: 'matig',
        sources: [{ label: 'Peos 2021', url: pm('33587549') }],
      },
      {
        text: 'Onder de 18: wie nog groeit wordt afgeraden om af te vallen bij een gezond gewicht. Tekenen dat je te weinig eet: lang moe blijven, zakkende prestaties, slechter slapen, snel kou hebben en minder zin in seks. Stop dan met het tekort en ga langs bij je huisarts.',
        strength: 'consensus',
        sources: [
          { label: 'AAP (Carl 2017)', url: 'https://doi.org/10.1542/peds.2017-1871' },
          { label: 'IOC (Mountjoy 2023)', url: pm('37752011') },
        ],
      },
    ],
  },
  {
    key: 'supplementen',
    title: 'Supplementen',
    points: [
      {
        text: 'Creatine monohydraat, 3-5 gram per dag, is bij volwassenen het best onderbouwde supplement. Voor onder de 18 zijn instanties het oneens: sportvoedingsonderzoekers vinden het aanvaardbaar onder begeleiding, kinderartsen zeggen dat het bij jongeren te weinig onderzocht is. Overleg dus eerst.',
        strength: 'sterk',
        sources: [
          { label: 'Kreider 2017', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5469049/' },
          { label: 'AAP (Carl 2017)', url: 'https://doi.org/10.1542/peds.2017-1871' },
        ],
      },
      {
        text: 'Cafeïne helpt je training bij 3-6 mg per kg, een uur vooraf. Veilig maximum: 400 mg per dag voor volwassenen, 3 mg per kg per dag voor jongeren. Koffie korter dan zo’n 9 uur voor bedtijd verkort je slaap nog meetbaar.',
        strength: 'sterk',
        sources: [
          { label: 'Guest 2021', url: pm('33388079') },
          { label: 'EFSA', url: 'https://www.efsa.europa.eu/en/topics/topic/caffeine' },
          { label: 'Gardiner 2023', url: pm('36870101') },
        ],
      },
    ],
  },
  {
    key: 'cardio',
    title: 'Cardio en stappen',
    points: [
      {
        text: 'Beweegrichtlijn: volwassenen 150-300 minuten matig of 75-150 minuten zwaar per week, plus 2× krachttraining. Voor 5-17 jaar: gemiddeld 60 minuten per dag matig tot zwaar, waarvan 3× per week zwaar en spierversterkend. Je krachttraining telt mee.',
        strength: 'sterk',
        sources: [{ label: 'WHO (Bull 2020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/' }],
      },
      {
        text: 'Het gezondheidsvoordeel van stappen vlakt af rond 8.000 tot 10.000 per dag; 7.000 doet al veel. 10.000 is geen magische grens.',
        strength: 'matig',
        sources: [
          { label: 'Paluch 2022', url: pm('35247352') },
          { label: 'Ding 2025', url: pm('40713949') },
        ],
      },
      {
        text: 'Cardio remt je spiergroei niet. Alleen explosieve kracht en beenkracht lijden eronder als cardio en kracht in dezelfde sessie zitten. Hou er 3 uur tussen, of doe cardio op een andere dag dan je beentraining.',
        strength: 'matig',
        sources: [
          { label: 'Schumann 2022', url: pm('34757594') },
          { label: 'Petre 2021', url: pm('33751469') },
        ],
      },
      {
        text: 'Matige inspanning (zone 2) herken je het best aan de praattest: praten lukt, zingen niet. Formules voor je maximale hartslag zitten er gemiddeld 11 slagen naast, dus gebruik hartslagzones als richting.',
        strength: 'matig',
        sources: [
          { label: 'Tanaka 2001', url: pm('11153730') },
          { label: 'Shookster 2020', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7523886/' },
        ],
      },
    ],
  },
  {
    key: 'slaap',
    title: 'Slaap',
    points: [
      {
        text: '13 tot 18 jaar: 8-10 uur per nacht. Volwassenen: minstens 7 uur; voor 18-25 jaar is 7-9 uur de aanbeveling.',
        strength: 'consensus',
        sources: [
          { label: 'Paruthi 2016', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4877308/' },
          { label: 'Watson 2015', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4434546/' },
          { label: 'Hirshkowitz 2015', url: pm('29073398') },
        ],
      },
      {
        text: 'Vaste bed- en opstaantijden zijn belangrijk voor je gezondheid en prestaties. Af en toe bijslapen in het weekend mag.',
        strength: 'consensus',
        sources: [{ label: 'Sletten 2023', url: pm('37684151') }],
      },
      {
        text: 'Slaap bepaalt wat je verliest in een cut: met 5,5 in plaats van 8,5 uur in bed verloren proefpersonen 55% minder vet en 60% meer vetvrije massa. Het was een kleine studie (10 mensen, 2 weken), maar het effect was groot.',
        strength: 'zwak',
        sources: [{ label: 'Nedeltcheva 2010', url: pm('20921542') }],
      },
      {
        text: 'Een korte nacht kost de dag erna gemiddeld zo’n 7,6% prestatie.',
        strength: 'matig',
        sources: [{ label: 'Craven 2022', url: pm('35708888') }],
      },
      {
        text: 'Schermen ’s avonds: bij jongeren zijn experts het eens dat ze de slaap verstoren; bij volwassenen is het bewijs voor strenge "blauw licht"-regels zwak. Een vaste schermen-uit-tijd is vooral een goede manier om op tijd in bed te liggen.',
        strength: 'zwak',
        sources: [
          { label: 'Chang 2015', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4313820/' },
          { label: 'Hartstein 2024', url: pm('38806392') },
        ],
      },
      {
        text: 'Een dutje helpt als je nacht te kort was: 20 tot 90 minuten, tussen 13 en 16 uur, en reken een half uur om weer wakker te worden.',
        strength: 'matig',
        sources: [{ label: 'Lastella 2021', url: pm('34194254') }],
      },
    ],
  },
  {
    key: 'herstel',
    title: 'Herstel',
    points: [
      {
        text: 'Wat je zelf invult (energie, spierpijn, stress, humeur) volgt je trainingsbelasting gevoeliger en betrouwbaarder dan de gangbare gemeten waarden.',
        strength: 'matig',
        sources: [{ label: 'Saw 2016', url: pm('26423706') }],
      },
      {
        text: 'Er bestaat geen bewezen grenswaarde voor zo’n score. Vergelijk daarom met je eigen gemiddelde: gaan meerdere scores twee of meer dagen achteruit, of stokken je gewichten, doe dan minder sets of hou meer reps in reserve.',
        strength: 'zwak',
        sources: [
          { label: 'Jeffries 2020', url: pm('32957081') },
          { label: 'Hickmott 2022', url: pm('35038063') },
        ],
      },
    ],
  },
  {
    key: 'gewicht',
    title: 'Gewicht',
    points: [
      {
        text: 'Je gewicht schommelt binnen een week vanzelf, door vocht, zout en eten. Vergelijk daarom weekgemiddelden, geen losse wegingen.',
        strength: 'matig',
        sources: [{ label: 'Turicchi 2020', url: pm('32353079') }],
      },
      {
        text: 'De vuistregel "7.700 kcal per kilo" klopt voor mensen met veel vetmassa. Bij slanke mensen is er minder tekort nodig per kilo. Daarom stelt de app alleen kleine stappen van 50 tot 200 kcal voor.',
        strength: 'sterk',
        sources: [{ label: 'Hall 2008', url: pm('17848938') }],
      },
      {
        text: 'Een slimme weegschaal meet herhaalbaar, maar het vetpercentage kan meerdere procentpunten naast de werkelijkheid zitten. Kijk naar de trend over weken, niet naar het getal van vandaag.',
        strength: 'matig',
        sources: [{ label: 'Siedler 2023', url: pm('36404739') }],
      },
    ],
  },
];
