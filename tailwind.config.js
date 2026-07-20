/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        essenza: {
          red: '#E50914',
          'red-dark': '#B00710',
          gold: '#FFD700',
          dark: '#0A0A0A',
          'dark-card': '#141414',
          'dark-border': '#262626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
