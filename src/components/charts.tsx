import { useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { num } from '@/lib/format';
import { useColors } from '@/lib/theme';

/** SVG text falls back to a serif font on the web unless told otherwise. */
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined;

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
              stroke={c.divider}
              strokeDasharray="4 4"
            />
          ))}
          <SvgText x={width - padRight + 6} y={yMax + 4} fontSize={11} fontFamily={FONT} fill={c.textDim}>
            {num(max, decimals)}
          </SvgText>
          {max !== min ? (
            <SvgText x={width - padRight + 6} y={yMin + 4} fontSize={11} fontFamily={FONT} fill={c.textDim}>
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
                    fontFamily={FONT}
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

/**
 * Bar chart with an optional target line. `values` are evenly spaced; a null
 * leaves a gap (a day without data). Bars that reach the target get `color`,
 * the others a softer tone.
 */
export function BarChart({
  values,
  labels,
  target,
  height = 130,
  color,
  format = (v) => num(v, 0),
}: {
  values: (number | null)[];
  labels?: string[];
  target?: number;
  height?: number;
  color: string;
  format?: (v: number) => string;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const padTop = 12;
  const padBottom = labels ? 20 : 4;
  const padRight = target != null ? 44 : 4;
  const present = values.filter((v): v is number => v != null);
  const max = Math.max(target ?? 0, ...present, 1) * 1.08;
  const innerW = Math.max(1, width - padRight);
  const innerH = height - padTop - padBottom;
  const slot = innerW / Math.max(1, values.length);
  const barW = Math.max(3, Math.min(22, slot * 0.62));
  const y = (v: number) => padTop + (1 - v / max) * innerH;

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {values.map((v, i) => {
            const x = i * slot + (slot - barW) / 2;
            if (v == null)
              return (
                <Rect
                  key={i}
                  x={x}
                  y={padTop + innerH - 3}
                  width={barW}
                  height={3}
                  rx={1.5}
                  fill={c.divider}
                />
              );
            const top = y(v);
            const reached = target == null || v >= target * 0.95;
            return (
              <Rect
                key={i}
                x={x}
                y={top}
                width={barW}
                height={Math.max(3, padTop + innerH - top)}
                rx={Math.min(5, barW / 2)}
                fill={color}
                opacity={reached ? 1 : 0.45}
              />
            );
          })}
          {target != null ? (
            <>
              <Line
                x1={0}
                x2={innerW}
                y1={y(target)}
                y2={y(target)}
                stroke={c.textDim}
                strokeDasharray="4 4"
              />
              <SvgText x={innerW + 6} y={y(target) + 4} fontSize={11} fontFamily={FONT} fill={c.textDim}>
                {format(target)}
              </SvgText>
            </>
          ) : null}
          {labels
            ? [0, labels.length - 1].map((i) =>
                labels[i] && (i === 0 || labels.length > 1) ? (
                  <SvgText
                    key={i}
                    x={i === 0 ? 0 : innerW}
                    y={height - 4}
                    fontSize={11}
                    fontFamily={FONT}
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
