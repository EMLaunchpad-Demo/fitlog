import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useColors } from '@/lib/theme';

/**
 * Soft green gradient with blurred colour blobs. Glass surfaces need something
 * behind them to blur, so every screen draws this behind its content.
 */
export function AppBackground() {
  const c = useColors();
  const [a, b, t] = c.blobs;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="base" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.bgTop} />
            <Stop offset="1" stopColor={c.bgBottom} />
          </LinearGradient>
          {[
            ['blobA', a],
            ['blobB', b],
            ['blobC', t],
          ].map(([id, color]) => (
            <RadialGradient key={id} id={id} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={color} stopOpacity={0.75} />
              <Stop offset="0.6" stopColor={color} stopOpacity={0.25} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x="0" y="0" width="400" height="800" fill="url(#base)" />
        <Circle cx="330" cy="90" r="230" fill="url(#blobA)" />
        <Circle cx="40" cy="420" r="250" fill="url(#blobB)" />
        <Circle cx="360" cy="720" r="260" fill="url(#blobC)" />
      </Svg>
    </View>
  );
}
