/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        webloom: {
          bg:       '#09090B',       // near-black base
          surface:  '#131316',        // card / sidebar
          raised:   '#1C1C1F',        // elevated surface
          border:   '#27272A',        // default border
          hover:    '#2E2E33',        // hover state
          accent:   '#6366F1',        // indigo-500 accent
          'accent-hover': '#818CF8',  // indigo-400
          text:     '#FAFAFA',        // primary text
          muted:    '#A1A1AA',        // secondary text
          dim:      '#52525B',        // tertiary / disabled
          success:  '#22C55E',        // green-500
          danger:   '#EF4444',        // red-500
          warning:  '#F59E0B',        // amber-500
        },
        primary: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
      },
    },
  },
  plugins: [],
}
