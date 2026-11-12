import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { MODELS, verifyKey } from '@/ai/api';
import { setCoachModel, useCoach } from '@/ai/coach';
import { deleteApiKey, getApiKey, maskKey, setApiKey } from '@/ai/key';
import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Field,
  HeaderButton,
  Row,
  SectionTitle,
  Segmented,
  StackScroll,
  Txt,
  confirm,
  success,
  tap,
} from '@/components/ui';
import { space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

const price = (n: number) => `$${(n < 1 ? n.toFixed(2) : String(n)).replace('.', ',')}`;
const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2).replace('.', ',')}`;

export default function CoachSettings() {
  const c = useColors();
  const model = useCoach((s) => s.model);
  const totalCost = useCoach((s) => s.totalCost);
  const briefingOn = useStore((s) => s.settings.briefing);
  const setSettings = useStore((s) => s.setSettings);
  const conversationCost = useCoach((s) => s.conversationCost);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const [name, setName] = useState(profile.name);
  const [about, setAbout] = useState(profile.about);
  const profileDirty = name.trim() !== profile.name.trim() || about.trim() !== profile.about.trim();
  const hasConversation = useCoach((s) => s.messages.length > 0);

  const saveProfile = () => {
    setProfile({ name: name.trim(), about: about.trim() });
    success();
  };

  useEffect(() => {
    getApiKey().then((k) => {
      setSavedKey(k);
      setEditing(!k);
    });
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/coach'));

  const save = async () => {
    const key = input.trim();
    if (!key) return;
    setChecking(true);
    setMessage(null);
    try {
      await verifyKey(key);
      await setApiKey(key);
      setSavedKey(key);
      setInput('');
      setEditing(false);
      setMessage({
        ok: true,
        text: 'Key werkt en is veilig opgeslagen op dit toestel.',
      });
      success();
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : 'De key kon niet worden gecontroleerd.',
      });
    } finally {
      setChecking(false);
    }
  };

  const remove = async () => {
    if (
      !(await confirm(
        'API-key verwijderen?',
        'De coach werkt pas weer als je een nieuwe key invult.',
        'Verwijder',
        true,
      ))
    )
      return;
    await deleteApiKey();
    setSavedKey(null);
    setEditing(true);
    setMessage(null);
  };

  return (
    <StackScroll>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderButton label="Klaar" strong onPress={close} />,
        }}
      />

      <SectionTitle title="Anthropic API-key" />
      <Card>
        {savedKey && !editing ? (
          <>
            <Row gap={space.sm}>
              <Icon name="key" size={16} color={c.success} />
              <Txt variant="num" style={{ flex: 1 }}>
                {maskKey(savedKey)}
              </Txt>
            </Row>
            <Row>
              <Button
                label="Vervangen"
                size="sm"
                variant="secondary"
                onPress={() => setEditing(true)}
                style={{ flex: 1 }}
              />
              <Button
                label="Verwijderen"
                size="sm"
                variant="danger"
                onPress={remove}
                style={{ flex: 1 }}
              />
            </Row>
          </>
        ) : (
          <>
            <Field
              value={input}
              onChangeText={setInput}
              placeholder="sk-ant-..."
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              accessibilityLabel="API-key"
            />
            <Button
              label={checking ? 'Controleren…' : 'Opslaan en testen'}
              onPress={save}
              disabled={checking || !input.trim()}
            />
            {savedKey ? (
              <Button
                label="Annuleer"
                variant="ghost"
                size="sm"
                onPress={() => setEditing(false)}
              />
            ) : null}
          </>
        )}
        {message ? (
          <Txt variant="small" color={message.ok ? c.success : c.danger}>
            {message.text}
          </Txt>
        ) : null}
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            WebBrowser.openBrowserAsync('https://console.anthropic.com/settings/keys')
          }>
          <Txt variant="small" color={c.accent} style={{ fontWeight: '600' }}>
            Maak een key aan in de Anthropic Console →
          </Txt>
        </Pressable>
        <Txt variant="small">
          De key wordt versleuteld op dit toestel bewaard (iOS-sleutelhanger / Android Keystore) en
          alleen naar api.anthropic.com gestuurd. Je gegevens gaan alleen naar Anthropic als je de
          coach iets vraagt.
        </Txt>
      </Card>

      <SectionTitle title="Over mij" />
      <Card>
        <Txt variant="small">
          Wat de coach over je moet weten: doelen, schema, voeding, slaap, blessures en hoe je wilt
          dat hij met je praat. Dit gaat mee met elke vraag aan de coach.
        </Txt>
        <Field
          label="Naam"
          value={name}
          onChangeText={setName}
          placeholder="Hoe moet de coach je noemen?"
        />
        <Field
          label="Over mij"
          value={about}
          onChangeText={setAbout}
          multiline
          textAlignVertical="top"
          placeholder={
            'Bijv. 175 cm, 80 kg, wil sterker worden en wat vet verliezen.\nTraining: 4× per week, full body.\nVoeding: ±2.500 kcal, 150 g eiwit.'
          }
          accessibilityLabel="Over mij"
          style={{ height: 220, paddingTop: space.md }}
        />
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="small">{about.length} tekens</Txt>
          {!profileDirty && (profile.name || profile.about) ? (
            <Txt variant="small" color={c.success}>
              Opgeslagen
            </Txt>
          ) : null}
        </Row>
        <Button label="Profiel opslaan" onPress={saveProfile} disabled={!profileDirty} />
        {hasConversation && profileDirty ? (
          <Txt variant="small">
            Het lopende gesprek houdt het oude profiel. Start daarna een nieuw gesprek om het nieuwe
            te gebruiken.
          </Txt>
        ) : null}
      </Card>

      <SectionTitle title="Model" />
      <Card style={{ gap: space.sm }}>
        {MODELS.map((m) => {
          const on = m.id === model;
          return (
            <Pressable
              key={m.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => {
                tap();
                setCoachModel(m.id);
              }}
              style={{
                flexDirection: 'row',
                gap: space.md,
                alignItems: 'center',
                padding: space.md,
                borderRadius: 14,
                borderWidth: on ? 1.5 : 1,
                borderColor: on ? c.accent : c.border,
                backgroundColor: on ? c.accentSoft : 'transparent',
              }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="h3">{m.label}</Txt>
                <Txt variant="small">{m.note}</Txt>
                <Txt variant="small">
                  {price(m.price.input)} / {price(m.price.output)} per miljoen tokens (in/uit)
                </Txt>
              </View>
              {on ? <Icon name="check" size={18} color={c.accent} /> : null}
            </Pressable>
          );
        })}
        <Txt variant="small">
          Een gewone vraag kost met Opus 5.5 grofweg 1 tot 5 cent, een foto iets meer. Met €100
          tegoed kun je dus duizenden berichten sturen.
        </Txt>
      </Card>

      <SectionTitle title="Ochtendbriefing" />
      <Card>
        <Segmented
          options={[
            { key: 'aan', label: 'Aan' },
            { key: 'uit', label: 'Uit' },
          ]}
          value={briefingOn ? 'aan' : 'uit'}
          onChange={(v) => setSettings({ briefing: v === 'aan' })}
        />
        <Txt variant="small">
          Elke dag bij het openen van de app één korte briefing op Vandaag: trainings- of rustdag,
          hoe je ervoor staat en waar je op moet letten. Dat is één klein verzoek per dag met het
          goedkoopste model (minder dan een cent per week), waarbij je gegevens van die dag naar
          Claude gaan.
        </Txt>
      </Card>

      <SectionTitle title="Verbruik (schatting)" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="dim">Huidig gesprek</Txt>
          <Txt variant="num">{usd(conversationCost)}</Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="dim">Totaal op dit toestel</Txt>
          <Txt variant="num">{usd(totalCost)}</Txt>
        </Row>
        <Txt variant="small">
          Berekend uit de tokens die de API teruggeeft. Je exacte saldo zie je in de Anthropic
          Console.
        </Txt>
      </Card>
    </StackScroll>
  );
}
