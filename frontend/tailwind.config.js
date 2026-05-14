/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'cs-bg':       '#0A0A0F',
        'cs-surface':  '#12121A',
        'cs-border':   '#1E1E2E',
        'cs-amber':    '#EF9F27',
        'cs-amber-dim':'#7A5014',
        'cs-red':      '#E24B4A',
        'cs-red-dim':  '#6B2222',
        'cs-green':    '#1D9E75',
        'cs-green-dim':'#0D4D38',
        'cs-blue':     '#3B82F6',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-in':   'slideIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0', transform: 'translateY(-4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateX(12px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
}
