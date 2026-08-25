/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#CE7B45',
          dark: '#c4841c',
          light: '#DE9163',
        },
        field: {
          950: '#0A0A0A',
          900: '#141414',
          800: '#1C1C1C',
          700: '#262626',
          600: '#303030',
          500: '#4A4A4A',
          400: '#666666',
          300: '#A3A3A3',
        },
        cfb: '#F0C846',
        nfl: '#5AA9FF',
        ir: '#E0567F',
      },
      fontFamily: {
        condensed: ['Barlow Condensed', 'sans-serif'],
        sans: ['Barlow', 'sans-serif'],
      },
      // Moderate global bump to the small/body end of the type scale.
      // Micro-text (badges, timestamps, labels like "AWAY"/"HOME",
      // team names under an abbreviation) was consistently sized at
      // the stock Tailwind minimum or smaller via arbitrary values,
      // which reads as genuinely hard to read on most screens.
      // Only xs-xl move — 2xl and up are already display/headline
      // sizes tuned for specific hero layouts and aren't what was
      // reported as too small.
      fontSize: {
        xs:   ['0.8125rem', { lineHeight: '1.125rem' }],  // 13px, was 12px
        sm:   ['0.9375rem', { lineHeight: '1.375rem' }],  // 15px, was 14px
        base: ['1.0625rem', { lineHeight: '1.625rem' }],  // 17px, was 16px
        lg:   ['1.1875rem', { lineHeight: '1.75rem'  }],  // 19px, was 18px
        xl:   ['1.3125rem', { lineHeight: '1.75rem'  }],  // 21px, was 20px
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blink': 'blink 1s ease-in-out infinite',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
    },
  },
  plugins: [],
}
