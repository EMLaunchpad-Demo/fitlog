import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Field,
  HeaderButton,
  Note,
  Row,
  SectionTitle,
  StackScroll,
  TimeField,
  Txt,
  confirm,
  notify,
  success,
  tap,
} from '@/components/ui';
import {
  CLOUD_SUPPORTED,
  applyDownload,
  cloudAvailable,
  disableCloud,
  downloadBackup,
  enableCloud,
  isValidCode,
  uploadBackup,
  useCloud,
} from '@/lib/cloud';
import { useNow } from '@/lib/hooks';
import {
  REMINDERS,
  disableReminders,
  enableReminders,
  pushSupport,
  reminderChoice,
  sendTestReminder,
  setReminderChoice,
  useReminders,
} from '@/lib/reminders';
import { space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

function ago(ms: number, now: number): string {
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} uur geleden` : `${Math.round(h / 24)} dagen geleden`;
}

/** Automatic encrypted backup and reminder notifications: the two things that need the app's server. */
export default function CloudScreen() {
  const c = useColors();
  const cloud = useCloud();
  const reminders = useReminders();
  const sleep = useStore((s) => s.settings.sleep);
  const now = useNow(30_000);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [restoreCode, setRestoreCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const support = pushSupport();

  useEffect(() => {
    let alive = true;
    cloudAvailable().then((ok) => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const turnOn = () =>
    run('aan', async () => {
      await enableCloud();
      setShowCode(true);
      success();
    });

  const restore = (code: string) =>
    run('terug', async () => {
      const download = await downloadBackup(code);
      if (!download.ok) return notify('Back-up', download.error);
      const ok = await confirm(
        'Back-up terugzetten?',
        `Dit vervangt alles op dit toestel door: ${download.summary}.`,
        'Terugzetten',
        true,
      );
      if (!ok) return;
      if (applyDownload(code, download)) {
        success();
        setRestoreCode('');
        notify('Back-up', 'Je gegevens zijn teruggezet. Dit toestel maakt vanaf nu automatisch een back-up.');
      } else notify('Back-up', 'De back-up kon niet worden teruggezet.');
    });

  const turnOff = async () => {
    const ok = await confirm(
      'Automatische back-up uitzetten?',
      'De versleutelde kopie op de server wordt gewist. Je gegevens op dit toestel blijven staan.',
      'Uitzetten',
      true,
    );
    if (ok) run('uit', () => disableCloud(true));
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(cloud.code ?? '');
      success();
      notify('Herstelcode', 'Gekopieerd. Bewaar hem ergens buiten deze telefoon.');
    } catch {
      setShowCode(true);
    }
  };

  const status =
    busy === 'aan' || cloud.status === 'syncing'
      ? 'Back-up maken…'
      : cloud.status === 'conflict'
        ? 'Er staat een nieuwere back-up van een ander toestel op de server.'
        : cloud.status === 'error'
          ? (cloud.error ?? 'De laatste back-up is mislukt.')
          : cloud.lastUploadAt
            ? `Laatste back-up ${ago(cloud.lastUploadAt, now)}${cloud.dirty ? ' · wijzigingen volgen binnen een paar minuten' : ''}`
            : 'Nog geen back-up gemaakt.';

  return (
    <StackScroll>
      <Stack.Screen
        options={{ headerLeft: () => <HeaderButton label="Sluit" onPress={close} /> }}
      />

      {available === false ? (
        <Card tone="alt">
          <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <Icon name="info" size={16} color={c.textDim} />
            <Txt variant="dim" style={{ flex: 1 }}>
              {CLOUD_SUPPORTED
                ? 'Automatische back-up en herinneringen werken alleen in de web-app op je eigen adres, niet in deze versie.'
                : 'Automatische back-up en herinneringen werken alleen in de web-app (op je beginscherm), niet in deze versie.'}
            </Txt>
          </Row>
        </Card>
      ) : null}

      <SectionTitle title="Automatische back-up" />
      {cloud.code ? (
        <Card>
          <Row gap={space.sm}>
            <Icon
              name={cloud.status === 'error' || cloud.status === 'conflict' ? 'warning' : 'cloud'}
              size={18}
              color={cloud.status === 'error' || cloud.status === 'conflict' ? c.danger : c.success}
            />
            <Txt variant="h3" style={{ flex: 1 }}>
              {cloud.status === 'conflict' ? 'Kies welke versie telt' : 'Staat aan'}
            </Txt>
          </Row>
          <Txt variant="dim">{status}</Txt>

          {cloud.status === 'conflict' ? (
            <>
              <Button
                label="Dit toestel is leidend"
                onPress={() => run('force', async () => void (await uploadBackup(true)))}
              />
              <Button
                label="Haal de nieuwere back-up op"
                variant="secondary"
                onPress={() => restore(cloud.code!)}
              />
            </>
          ) : (
            <Button
              label="Nu back-up maken"
              icon="cloud"
              variant="secondary"
              disabled={!!busy || available === false}
              onPress={() => run('nu', async () => void (await uploadBackup()))}
            />
          )}

          <View style={{ gap: space.xs }}>
            <Txt variant="small">Je herstelcode</Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Herstelcode tonen of verbergen"
              onPress={() => setShowCode(!showCode)}
              style={{ padding: space.md, borderRadius: 10, backgroundColor: c.input }}>
              <Txt
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ fontSize: 15, fontWeight: '700', letterSpacing: 0.4, fontVariant: ['tabular-nums'] }}
                selectable={showCode}>
                {showCode ? cloud.code : '•••••-•••••-•••••-•••••'}
              </Txt>
            </Pressable>
            <Row gap={space.sm}>
              <Button
                label={showCode ? 'Verberg' : 'Toon'}
                size="sm"
                variant="secondary"
                onPress={() => setShowCode(!showCode)}
                style={{ flex: 1 }}
              />
              <Button label="Kopieer" size="sm" variant="secondary" onPress={copyCode} style={{ flex: 1 }} />
            </Row>
          </View>
          <Note>
            Bewaar deze code buiten je telefoon, bijvoorbeeld in je wachtwoordbeheerder of op papier.
            Met de code zet je alles terug op een nieuw toestel. Zonder code kan niemand de back-up
            openen, ook de server niet.
          </Note>
          <Button label="Automatische back-up uitzetten" variant="ghost" onPress={turnOff} />
        </Card>
      ) : (
        <Card>
          <Txt variant="dim">
            Je gegevens staan alleen op dit toestel. Met de automatische back-up bewaart de app na
            elke wijziging een versleutelde kopie op je eigen server. De sleutel is een herstelcode
            die alleen jij hebt.
          </Txt>
          <Button
            label="Zet automatische back-up aan"
            icon="cloud"
            size="lg"
            disabled={!!busy || available !== true}
            onPress={turnOn}
          />
          <View style={{ gap: space.sm }}>
            <Field
              label="Heb je al een herstelcode? Zet je back-up terug"
              value={restoreCode}
              onChangeText={setRestoreCode}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Button
              label="Back-up terugzetten"
              variant="secondary"
              disabled={!!busy || available !== true || !isValidCode(restoreCode)}
              onPress={() => restore(restoreCode)}
            />
          </View>
        </Card>
      )}

      <SectionTitle title="Herinneringen" />
      <Card>
        {support === 'install-first' ? (
          <Txt variant="dim">
            Op iPhone werken meldingen alleen als Fitlog op je beginscherm staat. Open deze pagina in
            Safari, tik op Deel en kies &quot;Zet op beginscherm&quot;, en open de app daarna vanaf
            je beginscherm.
          </Txt>
        ) : support === 'unsupported' ? (
          <Txt variant="dim">Deze browser of versie ondersteunt geen meldingen.</Txt>
        ) : (
          <>
            {REMINDERS.map((r) => {
              const choice = reminderChoice(r.id, reminders.choices, sleep);
              return (
                <Row key={r.id} gap={space.md}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: choice.enabled }}
                    accessibilityLabel={`Herinnering ${r.label}`}
                    onPress={() => {
                      tap();
                      setReminderChoice(r.id, { enabled: !choice.enabled });
                    }}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: choice.enabled ? c.accent : c.cardAlt,
                        borderWidth: choice.enabled ? 0 : 1.5,
                        borderColor: c.textFaint,
                      }}>
                      {choice.enabled ? <Icon name="check" size={14} color={c.onAccent} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt>{r.label}</Txt>
                      <Txt variant="small">
                        {r.hint}
                        {choice.custom || r.id === 'food' ? '' : ' · volgt je slaapschema'}
                      </Txt>
                    </View>
                  </Pressable>
                  <TimeField
                    compact
                    label={`Tijd ${r.label}`}
                    value={choice.time}
                    onChange={(time) => setReminderChoice(r.id, { time })}
                  />
                </Row>
              );
            })}
            {reminders.endpoint ? (
              <>
                <Row gap={space.sm}>
                  <Icon name="bell" size={16} color={c.success} />
                  <Txt variant="dim" style={{ flex: 1 }}>
                    Herinneringen staan aan op dit toestel. Wijzigingen worden vanzelf bewaard.
                  </Txt>
                </Row>
                <Button
                  label="Stuur een testmelding"
                  icon="bell"
                  variant="secondary"
                  disabled={!!busy}
                  onPress={() =>
                    run('test', async () => {
                      const ok = await sendTestReminder();
                      notify(
                        'Testmelding',
                        ok
                          ? 'Verstuurd. Hij komt binnen een paar seconden binnen; sluit de app om hem te zien.'
                          : 'Versturen lukte niet. Zet de herinneringen uit en weer aan.',
                      );
                    })
                  }
                />
                <Button
                  label="Herinneringen uitzetten"
                  variant="ghost"
                  onPress={() => run('push-uit', disableReminders)}
                />
              </>
            ) : (
              <Button
                label="Zet herinneringen aan"
                icon="bell"
                size="lg"
                disabled={!!busy || available !== true}
                onPress={() =>
                  run('push', async () => {
                    const error = await enableReminders();
                    if (error) notify('Herinneringen', error);
                    else success();
                  })
                }
              />
            )}
          </>
        )}
      </Card>
      <Note>
        Meldingen komen binnen de vijf minuten na het ingestelde tijdstip. Op iPhone werkt dit alleen
        voor de app op je beginscherm (iOS 16.4 of nieuwer). De server kent alleen de tijdstippen en
        de tekst van de herinneringen, niet je gegevens.
      </Note>
    </StackScroll>
  );
}
