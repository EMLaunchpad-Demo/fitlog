import { ClaudeError, costOf, createMessage } from '@/ai/api';
import { useCoach } from '@/ai/coach';
import { getApiKey } from '@/ai/key';
import { renderProfile } from '@/ai/prompt';
import { overviewSnapshot } from '@/ai/tools';
import { dateKey } from '@/lib/format';
import { useStore } from '@/store/store';

/** The cheapest model is plenty for three sentences from a ready-made data snapshot. */
const BRIEFING_MODEL = 'claude-haiku-5-5';

const BRIEFING_PROMPT = `Je bent de fitnesscoach in Fitlog en schrijft de ochtendbriefing voor de gebruiker. Je krijgt zijn gegevens van vandaag als JSON.

Schrijf twee tot vier korte zinnen in informeel Nederlands. Zeg wat vandaag telt: is het een trainings- of rustdag, hoe hij ervoor staat (slaap, herstel) en waar hij vandaag op moet letten. Noem minstens één concreet cijfer uit de gegevens en geef hooguit één advies. Staat er een plan met focuspunten in, sluit daar dan bij aan.

Alleen platte tekst: geen begroeting, geen opsomming, geen Markdown. Gebruik alleen wat in de gegevens staat; ontbreekt iets (geen slaap gelogd, geen check-in), dan mag je er in een halve zin om vragen. Volg de taal- en stijlvoorkeuren uit het profiel als dat erbij staat.`;

let running = false;

export type BriefingResult = 'ok' | 'off' | 'fresh' | 'no-key' | 'busy' | 'error';

/**
 * Asks for today's briefing once a day, when the user has switched it on.
 * One small request without tools; the cost is added to the coach's usage.
 */
export async function refreshBriefing(force = false): Promise<BriefingResult> {
  const store = useStore.getState();
  const today = dateKey();
  if (!store.settings.briefing) return 'off';
  if (!force && store.briefing?.date === today) return 'fresh';
  if (running) return 'busy';
  const apiKey = await getApiKey();
  if (!apiKey) return 'no-key';

  running = true;
  try {
    const profile = renderProfile(store.profile);
    const now = new Date();
    const response = await createMessage(
      apiKey,
      {
        model: BRIEFING_MODEL,
        max_tokens: 4000,
        system: profile
          ? [
              { type: 'text', text: BRIEFING_PROMPT },
              { type: 'text', text: profile },
            ]
          : BRIEFING_PROMPT,
        output_config: { effort: 'low' },
        messages: [
          {
            role: 'user',
            content: `Het is ${now.toLocaleDateString('nl-BE', { weekday: 'long' })} ${today}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}.\n\n${JSON.stringify(overviewSnapshot())}`,
          },
        ],
      },
      { maxRetries: 1 },
    );
    const cost = costOf(response.model, response.usage);
    useCoach.setState((s) => ({ totalCost: s.totalCost + cost }));
    if (response.stop_reason === 'refusal') return 'error';
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    if (!text) return 'error';
    useStore.getState().setBriefing({ date: today, text });
    return 'ok';
  } catch (e) {
    // A missing connection or an API hiccup just means no briefing today.
    if (!(e instanceof ClaudeError)) throw e;
    return 'error';
  } finally {
    running = false;
  }
}
