import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const brandGreen = { background: '#2f6b3a' };

// Generates the PNG app icons (Android, iOS home screen, favicon) from one SVG.
// iOS and Android round/crop icons themselves, so the source is a full-bleed square.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { sizes: [180], padding: 0, resizeOptions: brandGreen },
    maskable: { sizes: [512], padding: 0.2, resizeOptions: brandGreen },
  },
  images: ['public/icon.svg'],
});
