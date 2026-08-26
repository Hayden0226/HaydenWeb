import type { ThemeEffect } from './types';

const themeEffects: Record<string, ThemeEffect> = {
  // Warm, classical, mellow — triangle waves, soft filter, lush reverb
  'academic-minimal': {
    filter: { frequency: 2200, Q: 0.3 },
    reverbMix: 0.6,
    detune: 3,
    distortion: 0,
    transpose: 2,
    oscType: 'triangle',
    attackScale: 1.8,
    releaseScale: 1.5,
  },
};

export function getThemeEffect(theme: string): ThemeEffect {
  return themeEffects[theme] || themeEffects['academic-minimal'];
}
