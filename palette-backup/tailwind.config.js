/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#F5A623',
          dark: '#c4841c',
          light: '#f7b84e',
        },
        field: {
          950: '#08090f',
          900: '#0e1117',
          800: '#161b27',
          700: '#1e2535',
          600: '#273044',
          500: '#3a4560',
          400: '#5a6a8a',
          300: '#8a9ab8',
        },
        cfb: '#e8a020',
        nfl: '#4a9fe8',
        ir: '#d04888',
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
