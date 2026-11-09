import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  cancelCoach,
  imageIdOf,
  isContextBlock,
  newConversation,
  retryCoach,
  sendToCoach,
  useCoach,
  useProfileOutdated,
  useCoachUpdated,
  canUndo,
  undoCoachAction,
} from '@/ai/coach';
import { deleteImages, type ImageSource, loadImage, pickImage } from '@/ai/images';
import { getApiKey } from '@/ai/key';
import { WRITE_TOOLS, type ToolAction } from '@/ai/tools';
import { Icon } from '@/components/icon';
import { Button, Card, IconButton, Row, Txt, confirm, notify, tap } from '@/components/ui';
import { radius, space, useColors } from '@/lib/theme';
import { useStore } from '@/store/store';

const SUGGESTIONS = [
  'Hoe gaat mijn training deze week?',
  'Ik had 2 boterhammen met pindakaas en een banaan als ontbijt',
  'Wat kan ik vanavond eten om mijn eiwitdoel te halen?',
  'Maak een schema voor 3 keer per week',
];

/** Suggestions once the coach knows who you are. */
const PROFILE_SUGGESTIONS = [
  'Zet mijn voedingsdoelen goed volgens mijn profiel',
  'Hoe verloopt mijn cut tot nu toe?',
  'Pas mijn schema aan: ik wil meer focus op mijn rug',
  'Wat kan ik vanavond eten om mijn eiwitdoel te halen?',
];

type Item =
  | { kind: 'user'; key: string; text: string; imageIds: string[] }
  | { kind: 'assistant'; key: string; text: string }
  | { kind: 'action'; key: string; action: ToolAction | null; write: boolean };

/** Turns the API history into chat bubbles and action chips. */
function useChatItems(): Item[] {
  const messages = useCoach((s) => s.messages);
  const actions = useCoach((s) => s.actions);
  const items: Item[] = [];
  messages.forEach((m, mi) => {
    const blocks: BetaContentBlockParam[] =
      typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (m.role === 'user') {
      if (blocks.every((b) => b.type === 'tool_result')) return;
      const text = blocks
        .filter((b) => b.type === 'text' && !isContextBlock(b))
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n');
      const imageIds = blocks.map(imageIdOf).filter((x): x is string => !!x);
      items.push({ kind: 'user', key: `u${mi}`, text, imageIds });
      return;
    }
    blocks.forEach((b, bi) => {
      if (b.type === 'text' && b.text.trim())
        items.push({
          kind: 'assistant',
          key: `a${mi}-${bi}`,
          text: b.text.trim(),
        });
      if (b.type === 'tool_use')
        items.push({
          kind: 'action',
          key: b.id,
          action: actions[b.id] ?? null,
          write: WRITE_TOOLS.has(b.name),
        });
    });
  });
  return items;
}

export default function CoachScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ attach?: ImageSource }>();
  const items = useChatItems();
  const busy = useCoach((s) => s.busy);
  const activity = useCoach((s) => s.activity);
  const error = useCoach((s) => s.error);
  const notice = useCoach((s) => s.notice);
  const conversationCost = useCoach((s) => s.conversationCost);
  const contextTokens = useCoach((s) => s.lastContextTokens);
  const messageCount = useCoach((s) => s.messages.length);
  const profile = useStore((s) => s.profile);
  const hasProfile = !!(profile.name || profile.about);
  const profileOutdated = useProfileOutdated();
  const coachUpdated = useCoachUpdated();

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const autoAttachDone = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getApiKey().then((k) => alive && setHasKey(!!k));
      return () => {
        alive = false;
      };
    }, []),
  );

  const attach = useCallback(async (source: ImageSource) => {
    tap();
    setPicking(true);
    try {
      const id = await pickImage(source);
      if (id) setPending((p) => [...p, id]);
    } catch (e) {
      notify('Foto', e instanceof Error ? e.message : 'Er ging iets mis met de foto.');
    } finally {
      setPicking(false);
    }
  }, []);

  // Opened with ?attach=camera from "Maaltijd fotograferen".
  useEffect(() => {
    if (hasKey && params.attach && !autoAttachDone.current) {
      autoAttachDone.current = true;
      attach(params.attach);
    }
  }, [hasKey, params.attach, attach]);

  const send = (value = text) => {
    if (busy || (!value.trim() && !pending.length)) return;
    const imageIds = pending;
    setText('');
    setPending([]);
    sendToCoach(value || 'Log deze maaltijd.', imageIds);
  };

  const startNew = async () => {
    if (!messageCount) return;
    if (
      await confirm(
        'Nieuw gesprek?',
        'Het huidige gesprek wordt gewist. Wat de coach heeft gelogd blijft gewoon staan.',
        'Nieuw gesprek',
      )
    )
      newConversation();
  };

  const longChat = contextTokens > 60000;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: 'Coach',
          headerRight: () => (
            <Row gap={space.sm} style={{ marginRight: Platform.OS === 'web' ? space.md : 0 }}>
              <IconButton icon="newChat" label="Nieuw gesprek" onPress={startNew} size={34} />
              <IconButton
                icon="settings"
                label="Coach-instellingen"
                onPress={() => router.push('/coach-settings')}
                size={34}
              />
            </Row>
          ),
        }}
      />
      <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: space.lg,
            gap: space.md,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {hasKey === false ? (
            <Card>
              <Row gap={space.sm}>
                <Icon name="key" size={18} color={c.accent} />
                <Txt variant="h3">Koppel je Anthropic API-key</Txt>
              </Row>
              <Txt variant="dim">
                De coach draait op Claude en gebruikt je eigen API-key. Die wordt versleuteld op dit
                toestel bewaard en alleen naar Anthropic gestuurd.
              </Txt>
              <Button
                label="API-key instellen"
                icon="key"
                onPress={() => router.push('/coach-settings')}
              />
            </Card>
          ) : null}

          {items.length === 0 && hasKey ? (
            <View style={{ gap: space.md, paddingTop: space.lg }}>
              <View style={[styles.avatar, { backgroundColor: c.accentSoft, alignSelf: 'center' }]}>
                <Icon name="sparkles" size={28} color={c.accent} />
              </View>
              <Txt variant="h2" style={{ textAlign: 'center' }}>
                {profile.name
                  ? `Hoi ${profile.name}! Waar kan ik mee helpen?`
                  : 'Hoi! Waar kan ik mee helpen?'}
              </Txt>
              <Txt variant="dim" style={{ textAlign: 'center' }}>
                Ik kan je trainingen en voeding bekijken, eten loggen (ook vanaf een foto) en alles
                in de app voor je aanpassen: schema&apos;s, voeding, trainingen, gewicht en doelen.
                Elke wijziging kun je met één tik ongedaan maken.
              </Txt>
              {!hasProfile ? (
                <Card
                  onPress={() => router.push('/coach-settings')}
                  style={{ marginTop: space.sm }}>
                  <Row gap={space.sm}>
                    <Icon name="edit" size={16} color={c.accent} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="h3">Vertel de coach wie je bent</Txt>
                      <Txt variant="small">
                        Je doelen, schema, voeding en hoe je aangesproken wilt worden. Dan wordt het
                        advies echt persoonlijk.
                      </Txt>
                    </View>
                    <Icon name="chevronRight" size={12} color={c.textFaint} />
                  </Row>
                </Card>
              ) : null}
              <View style={{ gap: space.sm, marginTop: space.sm }}>
                {(hasProfile ? PROFILE_SUGGESTIONS : SUGGESTIONS).map((s) => (
                  <Pressable
                    key={s}
                    accessibilityRole="button"
                    onPress={() => send(s)}
                    style={({ pressed }) => [
                      styles.suggestion,
                      {
                        backgroundColor: c.card,
                        borderColor: c.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <Txt>{s}</Txt>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {items.map((item) => {
            if (item.kind === 'user')
              return <UserBubble key={item.key} text={item.text} imageIds={item.imageIds} />;
            if (item.kind === 'assistant')
              return <AssistantBubble key={item.key} text={item.text} />;
            return (
              <ActionChip key={item.key} id={item.key} action={item.action} write={item.write} />
            );
          })}

          {busy ? (
            <Row gap={space.sm} style={{ paddingVertical: space.xs }}>
              <View style={[styles.dot, { backgroundColor: c.accent }]} />
              <Txt variant="dim" style={{ flex: 1 }}>
                {activity ?? 'Denkt na…'}
              </Txt>
              <Pressable onPress={cancelCoach} accessibilityRole="button" hitSlop={8}>
                <Txt variant="small" color={c.accent} style={{ fontWeight: '700' }}>
                  Stop
                </Txt>
              </Pressable>
            </Row>
          ) : null}

          {error ? (
            <Card tone="alt" style={{ borderColor: c.danger, borderWidth: 1 }}>
              <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
                <Icon name="warning" size={16} color={c.danger} />
                <Txt style={{ flex: 1 }}>{error}</Txt>
              </Row>
              {hasKey ? (
                <Button
                  label="Opnieuw proberen"
                  size="sm"
                  variant="secondary"
                  onPress={retryCoach}
                />
              ) : null}
            </Card>
          ) : null}
          {notice ? (
            <Txt variant="small" style={{ textAlign: 'center' }}>
              {notice}
            </Txt>
          ) : null}
          {coachUpdated && !busy ? (
            <Card tone="alt">
              <Txt variant="small">
                De coach heeft sinds dit gesprek nieuwe mogelijkheden gekregen. Je volgende bericht
                start automatisch een nieuw gesprek.
              </Txt>
            </Card>
          ) : null}
          {profileOutdated && !coachUpdated && !busy ? (
            <Card tone="alt">
              <Txt variant="small">
                Je profiel is aangepast sinds dit gesprek begon. Start een nieuw gesprek zodat de
                coach de nieuwe versie gebruikt.
              </Txt>
              <Button
                label="Nieuw gesprek"
                size="sm"
                variant="secondary"
                onPress={newConversation}
              />
            </Card>
          ) : null}
          {longChat && !busy ? (
            <Txt variant="small" style={{ textAlign: 'center' }}>
              Dit gesprek wordt lang. Start een nieuw gesprek (pennetje rechtsboven) om kosten te
              besparen.
            </Txt>
          ) : null}
        </ScrollView>

        {pending.length ? (
          <ScrollView
            horizontal
            contentContainerStyle={{
              gap: space.sm,
              paddingHorizontal: space.lg,
              paddingTop: space.sm,
            }}>
            {pending.map((id) => (
              <View key={id}>
                <StoredImage id={id} size={64} />
                <Pressable
                  accessibilityLabel="Foto verwijderen"
                  onPress={() => {
                    setPending((p) => p.filter((x) => x !== id));
                    deleteImages([id]);
                  }}
                  style={[styles.removeImage, { backgroundColor: c.text }]}>
                  <Icon name="close" size={10} color={c.bg} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View
          style={[
            styles.inputBar,
            {
              borderTopColor: c.border,
              backgroundColor: c.bg,
              paddingBottom: Math.max(insets.bottom, space.sm),
            },
          ]}>
          <IconButton icon="camera" label="Foto maken" onPress={() => attach('camera')} size={40} />
          <IconButton
            icon="image"
            label="Foto kiezen"
            onPress={() => attach('library')}
            size={40}
          />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={pending.length ? 'Zeg iets over de foto (optioneel)' : 'Vraag je coach…'}
            placeholderTextColor={c.textFaint}
            multiline
            editable={hasKey !== false}
            accessibilityLabel="Bericht aan de coach"
            style={[styles.input, { backgroundColor: c.input, color: c.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Versturen"
            disabled={busy || picking || (!text.trim() && !pending.length)}
            onPress={() => send()}
            style={[
              styles.send,
              {
                backgroundColor: busy || (!text.trim() && !pending.length) ? c.cardAlt : c.accent,
              },
            ]}>
            <Icon
              name="send"
              size={18}
              color={busy || (!text.trim() && !pending.length) ? c.textFaint : c.onAccent}
            />
          </Pressable>
        </View>
        {conversationCost > 0 ? (
          <Txt
            variant="small"
            style={{
              textAlign: 'center',
              paddingBottom: 4,
              backgroundColor: c.bg,
            }}>
            Dit gesprek ≈ $
            {conversationCost.toFixed(conversationCost < 0.1 ? 3 : 2).replace('.', ',')}
          </Txt>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

function UserBubble({ text, imageIds }: { text: string; imageIds: string[] }) {
  const c = useColors();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '85%',
        gap: 6,
        alignItems: 'flex-end',
      }}>
      {imageIds.length ? (
        <Row gap={6} style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {imageIds.map((id) => (
            <StoredImage key={id} id={id} size={150} />
          ))}
        </Row>
      ) : null}
      {text ? (
        <View style={[styles.bubble, { backgroundColor: c.accent, borderBottomRightRadius: 6 }]}>
          <Txt color={c.onAccent}>{text}</Txt>
        </View>
      ) : null}
    </View>
  );
}

function AssistantBubble({ text }: { text: string }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.bubble,
        {
          alignSelf: 'flex-start',
          maxWidth: '92%',
          backgroundColor: c.card,
          borderBottomLeftRadius: 6,
        },
      ]}>
      <Txt selectable>{text}</Txt>
    </View>
  );
}

function ActionChip({
  id,
  action,
  write,
}: {
  id: string;
  action: ToolAction | null;
  write: boolean;
}) {
  const c = useColors();
  const record = useCoach((s) => s.undoable[id]);
  const undone = useCoach((s) => !!s.undone[id]);
  // Re-evaluates whenever app data changes, so the button disappears once later edits happened.
  const undoAvailable = useStore(() => canUndo(record));
  if (!write) {
    return (
      <Row gap={6} style={{ paddingLeft: space.xs }}>
        <Icon name={action?.ok === false ? 'warning' : 'search'} size={12} color={c.textFaint} />
        <Txt variant="small" style={{ flex: 1 }}>
          {action?.label ?? 'Gegevens bekijken…'}
        </Txt>
      </Row>
    );
  }
  const ok = action?.ok !== false;
  const undo = async () => {
    if (await confirm('Ongedaan maken?', action?.label ?? '', 'Ongedaan maken', true)) {
      undoCoachAction(id);
    }
  };
  return (
    <View
      style={[
        styles.action,
        { backgroundColor: undone ? c.cardAlt : ok ? c.successSoft : c.cardAlt },
      ]}>
      <Pressable
        disabled={!action?.link || undone}
        onPress={() => action?.link && router.push(action.link)}
        accessibilityRole={action?.link && !undone ? 'link' : undefined}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          opacity: pressed ? 0.7 : 1,
        })}>
        <Icon
          name={undone ? 'repeat' : !action ? 'timer' : ok ? 'check' : 'warning'}
          size={16}
          color={undone ? c.textFaint : ok ? c.success : c.danger}
        />
        <Txt
          style={{
            flex: 1,
            fontWeight: '600',
            color: undone ? c.textDim : c.text,
            textDecorationLine: undone ? 'line-through' : 'none',
          }}>
          {action?.label ?? 'Bezig…'}
        </Txt>
      </Pressable>
      {undone ? (
        <Txt variant="small">Ongedaan</Txt>
      ) : undoAvailable ? (
        <Pressable
          onPress={undo}
          accessibilityRole="button"
          accessibilityLabel={`Ongedaan maken: ${action?.label ?? ''}`}
          hitSlop={8}>
          <Txt variant="small" color={c.accent} style={{ fontWeight: '700' }}>
            Ongedaan maken
          </Txt>
        </Pressable>
      ) : action?.link ? (
        <Icon name="chevronRight" size={12} color={c.textDim} />
      ) : null}
    </View>
  );
}

function StoredImage({ id, size }: { id: string; size: number }) {
  const c = useColors();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadImage(id).then((b64) => alive && setUri(b64 ? `data:image/jpeg;base64,${b64}` : null));
    return () => {
      alive = false;
    };
  }, [id]);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: c.cardAlt,
      }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} accessibilityLabel="Foto" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestion: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  bubble: { borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImage: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
