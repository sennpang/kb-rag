import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dae6ff',
          500: '#3b6cf6',
          600: '#2f5ad8',
          700: '#2748ad',
        },
      },
    },
  },
  plugins: [],
};

export default config;
