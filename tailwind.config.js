/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        essenza: {
          // Cor de ação/identidade: vermelho. Verde só como positivo/lucro,
          // fundo creme quente.
          bg: '#FBF6EF',
          card: '#FFFFFF',
          text: '#26211E',
          'text-secondary': '#8A8A8A',
          border: '#EFE9E0',
          red: '#DC2626',
          'red-dark': '#B91C1C',
          'red-light': '#FEE2E2',
          green: '#22C55E',
          'green-light': '#DCFCE7',
          amber: '#F59E0B',
          danger: '#EF4444',
          terracotta: '#DC2626',
          olive: '#DC2626',
          'olive-light': '#FEE2E2',
          'italia-green': '#DC2626',
          'italia-green-dark': '#B91C1C',
          'italia-red': '#DC2626',
          cream: '#FBF6EF',
          gold: '#F59E0B',
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
