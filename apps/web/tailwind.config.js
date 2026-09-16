/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: '#EEF2FF',
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
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        webloom: {
          bg:       'hsl(var(--background))',
          surface:  'hsl(var(--card))',
          raised:   'hsl(var(--secondary))',
          border:   'hsl(var(--border))',
          hover:    'hsl(210 40% 93%)',
          accent:   'hsl(var(--primary))',
          'accent-hover': 'hsl(221 83% 58%)',
          text:     'hsl(var(--foreground))',
          muted:    'hsl(var(--muted-foreground))',
          dim:      'hsl(215 16% 55%)',
          success:  '#22C55E',
          danger:   '#EF4444',
          warning:  '#F59E0B',
        },
        /* Semantic intelligence palette (light + dark aware) */
        ai: {
          DEFAULT: "hsl(var(--ai))",
          foreground: "hsl(var(--ai-foreground))",
        },
        opportunity: {
          DEFAULT: "hsl(var(--opportunity))",
          foreground: "hsl(var(--opportunity-foreground))",
        },
        verified: {
          DEFAULT: "hsl(var(--verified))",
          foreground: "hsl(var(--verified-foreground))",
        },
        creative: {
          DEFAULT: "hsl(var(--creative))",
          foreground: "hsl(var(--creative-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        pop: 'var(--shadow-pop)',
        'glow-blue': 'var(--shadow-glow-blue)',
        'glow-violet': 'var(--shadow-glow-violet)',
        'glow-orange': 'var(--shadow-glow-orange)',
        'glow-green': 'var(--shadow-glow-green)',
        'glow-pink': 'var(--shadow-glow-pink)',
      },
      fontFamily: {
        sans: ['Inter', "'SF Pro Display'", '-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'sans-serif'],
        display: ['Sora', 'Inter', "'SF Pro Display'", '-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'sans-serif'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
