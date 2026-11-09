import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { num } from '@/lib/format';
import { useColors } from '@/lib/theme';

function buildPath(points: { x: number; y: number }[]) {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

/** Line chart with min/max gridlines. `values` are plotted evenly spaced. */
export function LineChart({
  values,
  labels,
  height = 160,
  color,
  decimals = 1,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  color: string;
  decimals?: number;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const padTop = 14;
  const padBottom = labels ? 22 : 8;
  const padLeft = 4;
  const padRight = 40;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(1, max * 0.1);
  const lo = min - range * 0.15;
  const hi = max + range * 0.15;

  const innerW = Math.max(1, width - padLeft - padRight);
  const innerH = height - padTop - padBottom;
  const pts = values.map((v, i) => ({
    x: padLeft + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW),
    y: padTop + (1 - (v - lo) / (hi - lo)) * innerH,
  }));
  const yMax = padTop + (1 - (max - lo) / (hi - lo)) * innerH;
  const yMin = padTop + (1 - (min - lo) / (hi - lo)) * innerH;

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[yMax, yMin].map((y, i) => (
            <Line
              key={i}
              x1={padLeft}
              x2={padLeft + innerW}
              y1={y}
              y2={y}
              stroke={c.border}
              strokeDasharray="4 4"
            />
          ))}
          <SvgText x={width - padRight + 6} y={yMax + 4} fontSize={11} fill={c.textDim}>
            {num(max, decimals)}
          </SvgText>
          {max !== min ? (
            <SvgText x={width - padRight + 6} y={yMin + 4} fontSize={11} fill={c.textDim}>
              {num(min, decimals)}
            </SvgText>
          ) : null}
          <Path
            d={buildPath(pts)}
            stroke={color}
            strokeWidth={2.5}
            fill="none"
            strokeLinejoin="round"
          />
          {pts.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === pts.length - 1 ? 4.5 : 3}
              fill={i === pts.length - 1 ? color : c.card}
              stroke={color}
              strokeWidth={2}
            />
          ))}
          {labels
            ? [0, labels.length - 1].map((i) =>
                labels[i] && (i === 0 || labels.length > 1) ? (
                  <SvgText
                    key={i}
                    x={pts[i]?.x ?? 0}
                    y={height - 4}
                    fontSize={11}
                    fill={c.textDim}
                    textAnchor={i === 0 ? 'start' : 'end'}>
                    {labels[i]}
                  </SvgText>
                ) : null,
              )
            : null}
        </Svg>
      ) : null}
    </View>
  );
}

export function Sparkline({
  values,
  color,
  width = 96,
  height = 36,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: 3 + (i / (values.length - 1)) * (width - 6),
    y: 3 + (1 - (v - min) / range) * (height - 6),
  }));
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={buildPath(pts)} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Circle cx={last.x} cy={last.y} r={3} fill={color} />
    </Svg>
  );
}
