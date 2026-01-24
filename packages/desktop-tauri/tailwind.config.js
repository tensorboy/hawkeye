/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hawkeye: {
          bg: {
            primary: '#1a1a2e',
            secondary: '#16213e',
            tertiary: '#0f3460',
          },
          accent: {
            primary: '#e94560',
            secondary: '#ff6b6b',
          },
          text: {
            primary: '#eee',
            secondary: '#aaa',
            muted: '#666',
          },
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        hawkeye: {
          primary: '#e94560',
          secondary: '#ff6b6b',
          accent: '#0f3460',
          neutral: '#16213e',
          'base-100': '#1a1a2e',
          'base-200': '#16213e',
          'base-300': '#0f3460',
          info: '#3abff8',
          success: '#4ade80',
          warning: '#fbbd23',
          error: '#f87272',
        },
      },
    ],
    darkTheme: 'hawkeye',
  },
};
