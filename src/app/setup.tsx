import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  HeaderButton,
  Note,
  Row,
  StackScroll,
  Txt,
  notify,
  success,
} from '@/components/ui';
import { pickBackupFile } from '@/lib/backup';
import { applySetup, parseSetup } from '@/lib/setup';
import { radius, space, useColors } from '@/lib/theme';

/** Paste or open a personal setup: targets, schedule and plans in one go. */
export default function SetupScreen() {
  const c = useColors();
  const [text, setText] = useState('');
  const parsed = text.trim() ? parseSetup(text) : null;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const apply = () => {
    if (!parsed?.ok) return;
    applySetup(parsed.setup);
    success();
    notify('Setup geladen', 'Je persoonlijke instellingen staan erin.');
    close();
  };

  return (
    <StackScroll>
      <Stack.Screen
        options={{ headerLeft: () => <HeaderButton label="Sluit" onPress={close} /> }}
      />
      <Card>
        <Txt variant="label">Setup-code</Txt>
        <Txt variant="dim">
          Plak hier de setup-code die je kreeg. Ze stelt in één keer je doelen, slaapschema,
          rustdagen, fase en schema&apos;s in. Wat je al gelogd hebt, blijft staan.
        </Txt>
        <TextInput
          value={text}
          onChangeText={setText}
          accessibilityLabel="Setup-code"
          placeholder='{"app":"fitlog-setup", …}'
          placeholderTextColor={c.textFaint}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={{
            minHeight: 120,
            maxHeight: 220,
            borderRadius: radius.sm,
            padding: space.md,
            fontSize: 13,
            backgroundColor: c.input,
            color: c.text,
            textAlignVertical: 'top',
          }}
        />
        {Platform.OS === 'web' ? (
          <Button
            label="Of open een setup-bestand"
            icon="download"
            variant="ghost"
            onPress={async () => {
              const json = await pickBackupFile();
              if (json) setText(json);
            }}
          />
        ) : null}
      </Card>

      {parsed && !parsed.ok ? (
        <Card tone="alt">
          <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <Icon name="warning" size={16} color={c.danger} />
            <Txt variant="dim" style={{ flex: 1 }}>
              {parsed.error}
            </Txt>
          </Row>
        </Card>
      ) : null}

      {parsed?.ok ? (
        <Card>
          <Txt variant="label">Dit wordt ingesteld</Txt>
          <View style={{ gap: 6 }}>
            {parsed.summary.map((line) => (
              <Row key={line} gap={space.sm} style={{ alignItems: 'flex-start' }}>
                <View style={{ marginTop: 3 }}>
                  <Icon name="check" size={13} color={c.success} />
                </View>
                <Txt style={{ flex: 1 }}>{line}</Txt>
              </Row>
            ))}
          </View>
          <Button label="Setup toepassen" size="lg" onPress={apply} />
        </Card>
      ) : null}

      <Note>
        Alles uit een setup kun je daarna nog aanpassen bij Instellingen, of door het aan je coach te
        vragen.
      </Note>
    </StackScroll>
  );
}
