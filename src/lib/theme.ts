import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F3EF',
  card: '#FFFFFF',
  cardAlt: '#ECEAE4',
  input: '#F1EFEA',
  border: '#E2E0D9',
  text: '#16150F',
  textDim: '#6B6A63',
  textFaint: '#A3A199',
  accent: '#EE4B1A',
  accentSoft: '#FDE4DA',
  onAccent: '#FFFFFF',
  success: '#1E8E4F',
  successSoft: '#DCF1E4',
  danger: '#D33A2C',
  protein: '#2F6FEB',
  carbs: '#D9960F',
  fat: '#8A5CE6',
  water: '#1993C9',
};

const dark: typeof light = {
  bg: '#0E0E0C',
  card: '#1A1A17',
  cardAlt: '#25251F',
  input: '#25251F',
  border: '#2E2E28',
  text: '#F4F3EE',
  textDim: '#A2A197',
  textFaint: '#66655D',
  accent: '#FF6B3D',
  accentSoft: '#3A1D12',
  onAccent: '#170903',
  success: '#3CC97A',
  successSoft: '#13301F',
  danger: '#FF5D4F',
  protein: '#5B93FF',
  carbs: '#F2B33D',
  fat: '#B08CFF',
  water: '#3DB5E6',
};

export const palettes = { light, dark };
export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
