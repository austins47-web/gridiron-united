/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#F5C518',
          dark: '#b8941a',
          light: '#f7d154',
        },
        field: {
          950: '#080f08',
          900: '#0f1f0f',
          800: '#162916',
          700: '#1c3320',
          600: '#213d21',
          500: '#2a5230',
        },
        cfb: '#e8a020',
        nfl: '#3d8bcd',
        ir: '#c04080',
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
