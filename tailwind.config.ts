import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        heading: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg: {
          primary: '#0a0a0a',
          secondary: '#111111',
          tertiary: '#1a1a1a',
          elevated: '#222222',
        },
        border: {
          DEFAULT: '#2a2a2a',
          secondary: '#333333',
          active: '#444444',
        },
        text: {
          primary: '#f0f0f0',
          secondary: '#a0a0a0',
          muted: '#666666',
        },
        brand: {
          DEFAULT: '#ffffff',
          dim: '#e0e0e0',
        },
        success: {
          DEFAULT: '#22c55e',
          bg: '#0d2117',
          border: '#16532d',
        },
        warning: {
          DEFAULT: '#f59e0b',
          bg: '#1c1509',
          border: '#713f12',
        },
        danger: {
          DEFAULT: '#ef4444',
          bg: '#1c0808',
          border: '#7f1d1d',
        },
        info: {
          DEFAULT: '#3b82f6',
          bg: '#0a1628',
          border: '#1e3a5f',
        },
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '10px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
