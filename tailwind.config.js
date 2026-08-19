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
