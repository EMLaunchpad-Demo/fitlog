import { router } from 'expo-router';

/** Ready-made requests that screens send to the coach with one tap. */
export const COACH_REQUESTS = {
  analyse:
    'Analyseer mijn lichaam en mijn gegevens en maak mijn plan. Kies zelf mijn fase en mijn voedingsdoelen, en pas mijn training, cardio en slaapdoelen aan waar dat nodig is.',
  review:
    'Herzie mijn plan: kijk wat er sinds je vorige analyse veranderd is en stuur bij waar dat nodig is.',
  weekMenu:
    'Maak een weekmenu voor mij dat op mijn voedingsdoelen uitkomt, met een boodschappenlijst.',
} as const;

/** Opens the coach and sends the request straight away. */
export function askCoach(text: string) {
  router.push({ pathname: '/coach', params: { text, send: '1' } });
}
