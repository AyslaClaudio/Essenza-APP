/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        essenza: {
          // Redesign "SaaS profissional" — verde como cor de identidade/ação,
          // fundo neutro off-white, cards brancos, texto em duas camadas.
          bg: '#F7F7F5',
          card: '#FFFFFF',
          text: '#171717',
          'text-secondary': '#737373',
          border: '#E8E8E5',
          green: '#16A34A',
          'green-light': '#DCFCE7',
          amber: '#F59E0B',
          danger: '#EF4444',
          // Aliases mantidos por compatibilidade com o restante do app (que
          // referencia essenza.red como cor de ação principal).
          red: '#16A34A',
          'red-dark': '#128A3E',
          terracotta: '#16A34A',
          olive: '#16A34A',
          'olive-light': '#DCFCE7',
          'italia-green': '#16A34A',
          'italia-green-dark': '#128A3E',
          'italia-red': '#16A34A',
          cream: '#F7F7F5',
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
