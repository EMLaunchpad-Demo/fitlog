import * as Haptics from 'expo-haptics';
import { type ReactNode, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icon';
import { dutchDate, parseDutchDate, parseNum } from '@/lib/format';
import { formatTime, normalizeTime, parseTime } from '@/lib/time';
import { AppBackground } from '@/components/background';
import { glass, radius, space, useColors } from '@/lib/theme';

// ───────────────────────── Feedback helpers ─────────────────────────

export function tap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

export function success() {
  if (Platform.OS !== 'web')
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Cross-platform confirm dialog (Alert does nothing on web). */
export function confirm(
  title: string,
  message: string,
  confirmLabel = 'OK',
  destructive = false,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuleer', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** Cross-platform info message. */
export function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

// ───────────────────────── Text ─────────────────────────

type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'dim' | 'small' | 'label' | 'num';

export function Txt({
  variant = 'body',
  color,
  style,
  ...props
}: TextProps & { variant?: Variant; color?: string }) {
  const c = useColors();
  const base = textStyles[variant];
  const defaultColor =
    variant === 'dim' || variant === 'small' || variant === 'label' ? c.textDim : c.text;
  return <Text {...props} style={[base, { color: color ?? defaultColor }, style]} />;
}

const textStyles = StyleSheet.create({
  display: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  h2: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  dim: { fontSize: 14, lineHeight: 19 },
  small: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  num: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

// ───────────────────────── Layout ─────────────────────────

/** Scrollable tab screen with a large title header. */
export function TabScreen({
  title,
  subtitle,
  right,
  children,
  ...scrollProps
}: ScrollViewProps & { title: string; subtitle?: string; right?: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // iOS native tabs adjust the first ScrollView's insets automatically.
  const top = Platform.OS === 'ios' ? space.sm : insets.top + space.lg;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: top,
          paddingHorizontal: space.lg,
          paddingBottom: 120,
          gap: space.lg,
        }}
        {...scrollProps}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {subtitle ? <Txt variant="label">{subtitle}</Txt> : null}
            <Txt variant="title">{title}</Txt>
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

/** Scrollable body for stack screens (header provided by the Stack). */
export function StackScroll({
  children,
  contentContainerStyle,
  background = true,
  ...props
}: ScrollViewProps & {
  /** Draw the app background (off when the screen already draws it). */
  background?: boolean;
}) {
  const c = useColors();
  const scroll = (
    <ScrollView
      style={{ flex: 1 }}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        { padding: space.lg, paddingBottom: 80, gap: space.lg },
        contentContainerStyle,
      ]}
      {...props}>
      {children}
    </ScrollView>
  );
  if (!background) return scroll;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppBackground />
      {scroll}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  tone = 'card',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  tone?: 'card' | 'accent' | 'alt';
}) {
  const c = useColors();
  const surface: ViewStyle =
    tone === 'accent'
      ? {
          backgroundColor: c.accent,
          shadowColor: c.accent,
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }
      : tone === 'alt'
        ? {
            backgroundColor: c.cardAlt,
            borderColor: c.border,
            borderWidth: StyleSheet.hairlineWidth,
          }
        : {
            ...glass(c),
            shadowColor: c.shadow,
            shadowOpacity: 1,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
          };
  const content = (pressed: boolean) => (
    <View
      style={[styles.card, surface, { opacity: pressed ? 0.85 : 1 }, style]}>
      {children}
    </View>
  );
  if (!onPress) return content(false);
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

export function Row({
  children,
  gap = space.sm,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm, marginBottom: -space.xs }}>
      <Txt variant="label">{title}</Txt>
      {action}
    </Row>
  );
}

// ───────────────────────── Controls ─────────────────────────

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  size = 'md',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : variant === 'secondary' ? c.cardAlt : 'transparent';
  const fg =
    variant === 'primary'
      ? c.onAccent
      : variant === 'danger'
        ? c.danger
        : variant === 'ghost'
          ? c.accent
          : c.text;
  const height = size === 'lg' ? 56 : size === 'sm' ? 36 : 46;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          height,
          paddingHorizontal: size === 'sm' ? space.md : space.lg,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        variant === 'primary' && !disabled
          ? {
              shadowColor: c.accent,
              shadowOpacity: 0.35,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
            }
          : null,
        variant === 'secondary'
          ? { borderColor: c.border, borderWidth: StyleSheet.hairlineWidth * 2 }
          : null,
        style,
      ]}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 18} color={fg} /> : null}
      <Text
        style={{
          color: fg,
          fontSize: size === 'lg' ? 17 : size === 'sm' ? 14 : 16,
          fontWeight: '700',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  bg,
  size = 36,
  label,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  bg?: string;
  size?: number;
  label: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg ?? c.cardAlt,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Icon name={icon} size={size * 0.5} color={color ?? c.text} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[
        styles.chip,
        {
          ...(selected ? {} : glass(c)),
          backgroundColor: selected ? c.accent : c.card,
          borderColor: selected ? c.accent : c.border,
        },
      ]}>
      <Text style={{ color: selected ? c.onAccent : c.text, fontWeight: '600', fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View
      style={[
        styles.segmented,
        {
          backgroundColor: c.cardAlt,
          borderColor: c.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
        },
      ]}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              tap();
              onChange(o.key);
            }}
            style={[styles.segment, active && { backgroundColor: c.card }]}>
            <Text
              numberOfLines={1}
              style={{ color: active ? c.text : c.textDim, fontWeight: '600', fontSize: 14 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  const c = useColors();
  return (
    // Grow to fill a row, but never stretch vertically in a column (no flex-basis 0).
    <View style={{ gap: space.xs, flexGrow: 1, flexShrink: 1 }}>
      {label ? <Txt variant="small">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={c.textFaint}
        accessibilityLabel={label}
        {...props}
        style={[styles.field, { backgroundColor: c.input, color: c.text }, style]}
      />
    </View>
  );
}

/**
 * Numeric input that accepts a Dutch comma. Keeps its own text while typing
 * so "62," doesn't get normalised away mid-edit.
 */
export function NumberField({
  value,
  onChange,
  label,
  placeholder,
  decimals = true,
  style,
  align = 'left',
  accessibilityLabel,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  label?: string;
  placeholder?: string;
  decimals?: boolean;
  style?: StyleProp<ViewStyle>;
  align?: 'left' | 'center';
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','));
  const [lastValue, setLastValue] = useState(value);
  // Sync when the value is changed from outside (e.g. auto-filled).
  if (value !== lastValue) {
    setLastValue(value);
    if (parseNum(text) !== value) setText(value == null ? '' : String(value).replace('.', ','));
  }
  return (
    <View style={[{ gap: space.xs }, style]}>
      {label ? <Txt variant="small">{label}</Txt> : null}
      <TextInput
        value={text}
        accessibilityLabel={accessibilityLabel ?? label}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
        inputMode={decimals ? 'decimal' : 'numeric'}
        selectTextOnFocus
        onChangeText={(t) => {
          const cleaned = t.replace(decimals ? /[^0-9.,]/g : /[^0-9]/g, '');
          setText(cleaned);
          const n = parseNum(cleaned);
          setLastValue(n);
          onChange(n);
        }}
        style={[
          styles.field,
          {
            backgroundColor: c.input,
            color: c.text,
            textAlign: align,
            fontVariant: ['tabular-nums'],
            fontWeight: '600',
          },
        ]}
      />
    </View>
  );
}

/** Text button for Stack headers (native headers add their own insets; web doesn't). */
export function HeaderButton({
  label,
  onPress,
  strong,
  disabled,
}: {
  label: string;
  onPress: () => void;
  strong?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      style={{ marginHorizontal: Platform.OS === 'web' ? space.lg : 0 }}>
      <Txt
        variant="h3"
        color={disabled ? c.textFaint : c.accent}
        style={strong ? { fontWeight: '700' } : undefined}>
        {label}
      </Txt>
    </Pressable>
  );
}

// ───────────────────────── Data display ─────────────────────────

export function ProgressBar({
  value,
  max,
  color,
  height = 8,
  trackColor,
  cap,
}: {
  value: number;
  max: number;
  color: string;
  height?: number;
  trackColor?: string;
  /** Going over the maximum is fine (steps, sleep): never turn red. */
  cap?: boolean;
}) {
  const c = useColors();
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = !cap && max > 0 && value > max * 1.05;
  return (
    <View
      style={{
        height,
        borderRadius: height,
        backgroundColor: trackColor ?? c.cardAlt,
        overflow: 'hidden',
      }}>
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: over ? c.danger : color,
        }}
      />
    </View>
  );
}

export function Ring({
  value,
  max,
  size = 132,
  stroke = 12,
  color,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color: string;
  children?: ReactNode;
}) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max * 1.05;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.cardAlt}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? c.danger : color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="small">{label}</Txt>
      <Row gap={3} style={{ alignItems: 'baseline' }}>
        <Txt variant="h2" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Txt>
        {unit ? <Txt variant="small">{unit}</Txt> : null}
      </Row>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.sm }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: c.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name={icon} size={26} color={c.accent} />
      </View>
      <Txt variant="h3">{title}</Txt>
      <Txt variant="dim" style={{ textAlign: 'center', maxWidth: 280 }}>
        {text}
      </Txt>
      {action}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  left,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  left?: ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.6 : 1 }]}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="h3" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="dim" numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevronRight" size={14} color={c.textFaint} /> : null)}
    </Pressable>
  );
}

/**
 * Clock time ("22:15") with −/+ 15 minute buttons. Typing accepts "2215",
 * "22.15" or "22u15"; anything invalid falls back to the last valid time.
 */
export function TimeField({
  label,
  value,
  onChange,
  step = 15,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
  step?: number;
}) {
  const c = useColors();
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  const commit = (raw: string) => {
    const t = normalizeTime(raw);
    if (t) {
      setLastValue(t);
      setText(t);
      if (t !== value) onChange(t);
    } else setText(value);
  };
  const nudge = (delta: number) => {
    const base = parseTime(text) ?? parseTime(value) ?? 0;
    // Snap to the step first, so 22:07 + 15 becomes 22:15 rather than 22:22.
    const snapped = delta > 0 ? Math.floor(base / step) * step : Math.ceil(base / step) * step;
    commit(formatTime(snapped + delta));
  };
  return (
    <View style={{ gap: space.xs, flexGrow: 1, flexShrink: 1 }}>
      <Txt variant="small">{label}</Txt>
      <Row gap={space.xs}>
        <IconButton icon="minus" label={`${label} eerder`} size={34} onPress={() => nudge(-step)} />
        <TextInput
          value={text}
          accessibilityLabel={label}
          inputMode="numeric"
          keyboardType="numbers-and-punctuation"
          selectTextOnFocus
          maxLength={5}
          onChangeText={setText}
          onBlur={() => commit(text)}
          onSubmitEditing={() => commit(text)}
          style={[
            styles.field,
            {
              flex: 1,
              minWidth: 66,
              paddingHorizontal: 2,
              backgroundColor: c.input,
              color: c.text,
              textAlign: 'center',
              fontVariant: ['tabular-nums'],
              fontWeight: '700',
              fontSize: 18,
            },
          ]}
        />
        <IconButton icon="plus" label={`${label} later`} size={34} onPress={() => nudge(step)} />
      </Row>
    </View>
  );
}

/** Date as "12-10-2026". Empty is allowed when `optional`; invalid input falls back to the last value. */
export function DateField({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: string | null;
  onChange: (date: string | null) => void;
  optional?: boolean;
}) {
  const c = useColors();
  const shown = value ? dutchDate(value) : '';
  const [text, setText] = useState(shown);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(shown);
  }
  const commit = () => {
    if (!text.trim() && optional) {
      setLastValue(null);
      if (value !== null) onChange(null);
      return;
    }
    const parsed = parseDutchDate(text);
    if (!parsed) return setText(shown);
    setLastValue(parsed);
    setText(dutchDate(parsed));
    if (parsed !== value) onChange(parsed);
  };
  return (
    <View style={{ gap: space.xs, flexGrow: 1, flexShrink: 1 }}>
      <Txt variant="small">{label}</Txt>
      <TextInput
        value={text}
        accessibilityLabel={label}
        placeholder={optional ? 'geen' : 'dd-mm-jjjj'}
        placeholderTextColor={c.textFaint}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        style={[
          styles.field,
          { backgroundColor: c.input, color: c.text, fontVariant: ['tabular-nums'] },
        ]}
      />
    </View>
  );
}

/** A 1–5 score picker; 1 is always the worst and 5 the best. */
export function Rating({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  /** What 1 and 5 mean, e.g. "leeg" and "vol energie" */
  low: string;
  high: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="h3" style={{ fontSize: 15 }}>
          {label}
        </Txt>
        <Txt variant="small">
          {low} → {high}
        </Txt>
      </Row>
      <Row gap={space.sm}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${n}`}
              accessibilityState={{ selected }}
              onPress={() => {
                tap();
                onChange(n);
              }}
              style={{
                flex: 1,
                height: 42,
                borderRadius: radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? c.accent : c.input,
              }}>
              <Text
                style={{
                  color: selected ? c.onAccent : c.text,
                  fontWeight: '700',
                  fontSize: 16,
                  fontVariant: ['tabular-nums'],
                }}>
                {n}
              </Text>
            </Pressable>
          );
        })}
      </Row>
    </View>
  );
}

/** Small tappable metric tile for dashboards (two per row). */
export function Tile({
  icon,
  label,
  value,
  unit,
  detail,
  color,
  progress,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  color?: string;
  /** 0–1; draws a bar under the value */
  progress?: number;
  onPress?: () => void;
}) {
  const c = useColors();
  const tint = color ?? c.accent;
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Card onPress={onPress} style={{ gap: space.sm, padding: space.md }}>
        <Row gap={6}>
          <Icon name={icon} size={14} color={tint} />
          <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>
            {label}
          </Txt>
        </Row>
        <Row gap={4} style={{ alignItems: 'baseline' }}>
          <Txt variant="h2" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
            {value}
          </Txt>
          {unit ? <Txt variant="small">{unit}</Txt> : null}
        </Row>
        {progress != null ? (
          <ProgressBar value={progress} max={1} color={tint} height={6} cap />
        ) : null}
        {detail ? (
          <Txt variant="small" numberOfLines={1}>
            {detail}
          </Txt>
        ) : null}
      </Card>
    </View>
  );
}

/** Short explanation with an info icon, for the "why" behind a number. */
export function Note({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
      <View style={{ marginTop: 1 }}>
        <Icon name="info" size={14} color={c.textFaint} />
      </View>
      <Txt variant="small" style={{ flex: 1 }}>
        {children}
      </Txt>
    </Row>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.divider }} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.xs },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  button: {
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  field: {
    height: 46,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
});
