/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Preflight aus, solange die alte styles.css noch mitläuft (Phase 3 an).
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        royal: { DEFAULT: '#2947c9', soft: '#aeb9ee' },
        ink: '#161a24',
        paper: '#ffffff',
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
