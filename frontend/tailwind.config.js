/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        royal: { DEFAULT: '#2947c9', soft: '#aeb9ee' },
        ink: '#161a24',
        paper: '#ffffff',
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        wordmark: '-0.045em', // VRWB CI: Wortmarke Roboto 900, Laufweite −4,5 %
        toolname: '-0.01em',  // VRWB CI: Toolname in Roboto Mono, Laufweite −1 %
      },
    },
  },
  plugins: [],
};
