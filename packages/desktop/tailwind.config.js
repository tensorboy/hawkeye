/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
    './src/renderer/index.html',
  ],
  theme: {
    extend: {
      colors: {
        // Hawkeye 品牌色
        primary: {
          DEFAULT: '#e94560',
          hover: '#ff6b6b',
          50: '#fef2f3',
          100: '#fee2e5',
          200: '#fecacd',
          300: '#fda4aa',
          400: '#fa7178',
          500: '#e94560',
          600: '#d62d4a',
          700: '#b4213c',
          800: '#951f38',
          900: '#7d1f35',
        },
        // 背景色
        bg: {
          primary: '#1a1a2e',
          secondary: '#16213e',
          card: '#0f3460',
          hover: '#1e2a4a',
        },
        // 文字颜色
        text: {
          primary: '#eaeaea',
          secondary: '#a0a0a0',
          muted: '#6a6a8a',
        },
        // 强调色
        accent: '#e94560',
        success: '#00d9a5',
        warning: '#ffc107',
        error: '#ff4757',
        border: '#2a2a4a',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.3)',
        'modal': '0 20px 60px rgba(0, 0, 0, 0.5)',
      },
      borderRadius: {
        'card': '12px',
        'modal': '16px',
      },
      animation: {
        'pulse-smooth': 'pulse-smooth 1.4s ease-in-out infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
      },
      keyframes: {
        'pulse-smooth': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.4 },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'slide-up': {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: 0, transform: 'translateY(-10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        hawkeye: {
          'primary': '#e94560',
          'primary-content': '#ffffff',
          'secondary': '#16213e',
          'secondary-content': '#eaeaea',
          'accent': '#00d9a5',
          'accent-content': '#000000',
          'neutral': '#1a1a2e',
          'neutral-content': '#eaeaea',
          'base-100': '#1a1a2e',
          'base-200': '#16213e',
          'base-300': '#0f3460',
          'base-content': '#eaeaea',
          'info': '#3abff8',
          'info-content': '#002b3d',
          'success': '#00d9a5',
          'success-content': '#001a12',
          'warning': '#ffc107',
          'warning-content': '#1a1500',
          'error': '#ff4757',
          'error-content': '#1a0406',
          '--rounded-box': '1rem',
          '--rounded-btn': '0.5rem',
          '--rounded-badge': '1.9rem',
          '--animation-btn': '0.25s',
          '--animation-input': '0.2s',
          '--btn-focus-scale': '0.95',
          '--border-btn': '1px',
          '--tab-border': '1px',
          '--tab-radius': '0.5rem',
        },
      },
    ],
    darkTheme: 'hawkeye',
    base: true,
    styled: true,
    utils: true,
    prefix: '',
    logs: false,
  },
};
