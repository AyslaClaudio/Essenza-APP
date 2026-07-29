/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        essenza: {
          red: '#E50914',
          'red-dark': '#B00710',
          terracotta: '#C1440E',
          olive: '#5B6B3F',
          'olive-light': '#8CA366',
          // Verde e vermelho oficiais da bandeira italiana — usados como acentos de marca
          // (faixa tricolor, badges, botões secundários), não como paleta de fundo.
          'italia-green': '#008C45',
          'italia-green-dark': '#046A34',
          'italia-red': '#CD212A',
          cream: '#FAF7F1',
          gold: '#FFD700',
          dark: '#0A0A0A',
          'dark-card': '#141414',
          'dark-border': '#262626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
