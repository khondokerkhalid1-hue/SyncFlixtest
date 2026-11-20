import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#141414',
        card: '#1C1C1C',
        surface: '#252525',
        primary: '#7C3AED',
        secondary: '#2563EB',
        foreground: '#EDEDED',
        muted: '#A3A3A3',
        line: '#333333',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'float-up': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-220px)', opacity: '0' },
        },
        playhead: {
          '0%': { transform: 'scaleX(0.32)' },
          '100%': { transform: 'scaleX(0.7)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        playhead: 'playhead 40s linear infinite alternate',
        'float-up': 'float-up 2.4s ease-out both',
      },
    },
  },
  plugins: [],
}

export default config
