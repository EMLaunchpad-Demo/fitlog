import { Platform, StyleSheet, useColorScheme, type ViewStyle } from 'react-native';

/**
 * Green theme with glass surfaces. Surfaces (`card`, `cardAlt`, `input`) are
 * translucent so the soft gradient background shows through; on the web they
 * also blur what is behind them (see `glass()`).
 */
const light = {
  /** Solid fallback behind everything */
  bg: '#E9F4EC',
  /** Background gradient (top to bottom) and its colour blobs */
  bgTop: '#F2F9F3',
  bgBottom: '#DCEEE1',
  blobs: ['#8EE0AE', '#C6EFA2', '#7FD6C4'],
  card: 'rgba(255,255,255,0.62)',
  /** Stronger glass for bars that float over content */
  cardStrong: 'rgba(255,255,255,0.78)',
  cardAlt: 'rgba(255,255,255,0.5)',
  input: 'rgba(255,255,255,0.72)',
  border: 'rgba(255,255,255,0.85)',
  /** Thin dark line where a light rim would disappear */
  divider: 'rgba(13,31,20,0.08)',
  text: '#0D1F14',
  textDim: '#4C6354',
  textFaint: '#8FA596',
  accent: '#138A43',
  accentSoft: 'rgba(19,138,67,0.13)',
  onAccent: '#FFFFFF',
  success: '#0F8F55',
  successSoft: 'rgba(16,185,129,0.17)',
  danger: '#D33A2C',
  protein: '#2F6FEB',
  carbs: '#C98A0B',
  fat: '#8A5CE6',
  water: '#1993C9',
  shadow: 'rgba(16,64,36,0.12)',
};

const dark: typeof light = {
  bg: '#06130C',
  bgTop: '#0A1D12',
  bgBottom: '#040E08',
  blobs: ['#166534', '#14532D', '#115E59'],
  card: 'rgba(24,54,37,0.5)',
  cardStrong: 'rgba(16,38,26,0.78)',
  cardAlt: 'rgba(255,255,255,0.07)',
  input: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.1)',
  divider: 'rgba(255,255,255,0.08)',
  text: '#ECF7EF',
  textDim: '#A3BDAD',
  textFaint: '#5F7A69',
  accent: '#4ADE80',
  accentSoft: 'rgba(74,222,128,0.15)',
  onAccent: '#052E16',
  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.16)',
  danger: '#FF6B5E',
  protein: '#5B93FF',
  carbs: '#F2B33D',
  fat: '#B08CFF',
  water: '#3DB5E6',
  shadow: 'rgba(0,0,0,0.35)',
};

export const palettes = { light, dark };
export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/**
 * Frosted glass surface. Web (the iPhone home-screen app) gets a real
 * backdrop blur; native gets the same translucent look without blur.
 */
export function glass(c: Colors, strength: 'normal' | 'strong' = 'normal'): ViewStyle {
  return {
    backgroundColor: strength === 'strong' ? c.cardStrong : c.card,
    borderColor: c.border,
    borderWidth: StyleSheet.hairlineWidth * 2,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: `blur(${strength === 'strong' ? 28 : 20}px) saturate(170%)`,
        } as ViewStyle)
      : null),
  };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 22, pill: 999 } as const;
