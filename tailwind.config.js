/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        essenza: {
          // Redesign "soft-UI restaurante" — laranja-coral como cor de ação/
          // identidade, verde só como positivo/lucro, fundo creme quente.
          bg: '#FBF6EF',
          card: '#FFFFFF',
          text: '#26211E',
          'text-secondary': '#8A8A8A',
          border: '#EFE9E0',
          orange: '#F26522',
          'orange-dark': '#D2551A',
          'orange-light': '#FDECE3',
          green: '#22C55E',
          'green-light': '#DCFCE7',
          amber: '#F59E0B',
          danger: '#EF4444',
          // Aliases mantidos por compatibilidade com o restante do app (que
          // referencia essenza.red como cor de ação principal).
          red: '#F26522',
          'red-dark': '#D2551A',
          terracotta: '#F26522',
          olive: '#F26522',
          'olive-light': '#FDECE3',
          'italia-green': '#F26522',
          'italia-green-dark': '#D2551A',
          'italia-red': '#F26522',
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
