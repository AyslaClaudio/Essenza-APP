/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        essenza: {
          // Paleta "Toscana rústica" — extraída do Instagram real da loja
          // (verde-oliva, terracota, creme), substitui o vermelho vivo genérico.
          red: '#B5652E',
          'red-dark': '#8F4F22',
          terracotta: '#B5652E',
          olive: '#6B6A2F',
          'olive-light': '#8CA366',
          // Mantidos por compatibilidade com paleta anterior — não usados como fundo.
          'italia-green': '#6B6A2F',
          'italia-green-dark': '#54531F',
          'italia-red': '#B5652E',
          cream: '#EFE6D0',
          gold: '#C9A227',
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
