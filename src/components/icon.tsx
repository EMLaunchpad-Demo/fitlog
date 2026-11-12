import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

type SymbolName = Exclude<ComponentProps<typeof SymbolView>['name'], string>;

/** One name per icon, mapped to SF Symbols (iOS) and Material Symbols (Android/web). */
const ICONS = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  dumbbell: { ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' },
  plans: { ios: 'list.bullet.clipboard.fill', android: 'assignment', web: 'assignment' },
  food: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  chevronDown: { ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' },
  chevronUp: { ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' },
  timer: { ios: 'timer', android: 'timer', web: 'timer' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  flame: { ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' },
  trophy: { ios: 'trophy.fill', android: 'emoji_events', web: 'emoji_events' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  scale: { ios: 'scalemass.fill', android: 'monitor_weight', web: 'monitor_weight' },
  water: { ios: 'drop.fill', android: 'water_drop', web: 'water_drop' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  star: { ios: 'star.fill', android: 'star', web: 'star' },
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  chart: { ios: 'chart.line.uptrend.xyaxis', android: 'show_chart', web: 'show_chart' },
  settings: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  bolt: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  target: { ios: 'target', android: 'track_changes', web: 'track_changes' },
  list: { ios: 'list.bullet', android: 'list', web: 'list' },
  repeat: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  camera: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
  image: { ios: 'photo.on.rectangle', android: 'image', web: 'image' },
  send: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
  stop: { ios: 'stop.fill', android: 'stop', web: 'stop' },
  key: { ios: 'key.fill', android: 'key', web: 'key' },
  newChat: { ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  moon: { ios: 'moon.fill', android: 'bedtime', web: 'bedtime' },
  sun: { ios: 'sun.max.fill', android: 'wb_sunny', web: 'wb_sunny' },
  heart: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  run: { ios: 'figure.run', android: 'directions_run', web: 'directions_run' },
  walk: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
  bike: { ios: 'bicycle', android: 'directions_bike', web: 'directions_bike' },
  progress: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  book: { ios: 'book.fill', android: 'menu_book', web: 'menu_book' },
  rest: { ios: 'figure.mind.and.body', android: 'self_improvement', web: 'self_improvement' },
  download: { ios: 'square.and.arrow.down', android: 'download', web: 'download' },
  barcode: { ios: 'barcode.viewfinder', android: 'barcode_scanner', web: 'barcode_scanner' },
  bell: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  cloud: { ios: 'icloud.fill', android: 'cloud', web: 'cloud' },
  weights: { ios: 'scalemass', android: 'weight', web: 'weight' },
} satisfies Record<string, SymbolName>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
}) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}
