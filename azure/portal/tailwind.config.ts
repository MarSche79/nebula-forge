import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'nf-bg': '#eef4fa',
        'nf-bg-mid': '#dfe9f2',
        'nf-card': 'rgba(255, 255, 255, 0.82)',
        'nf-glass': 'rgba(0, 0, 0, 0.03)',
        'nf-glass-hover': 'rgba(0, 0, 0, 0.06)',
        'nf-primary': '#0e8ab5',
        'nf-primary-dark': '#0a6f94',
        'nf-accent': '#6246d6',
        'nf-success': '#0ba677',
        'nf-warning': '#d08a08',
        'nf-danger': '#dc3545',
        'nf-text': '#1a2a3a',
        'nf-text-muted': '#4a6a82',
        'nf-text-dim': '#7a96ad',
        'nf-border': 'rgba(14, 138, 181, 0.15)',
        'nf-border-hover': 'rgba(14, 138, 181, 0.35)',
      },
      borderRadius: {
        'nf-sm': '8px',
        'nf-md': '14px',
        'nf-lg': '20px',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'nf-glow': '0 0 0 1px rgba(14, 138, 181, 0.2), 0 8px 24px rgba(14, 138, 181, 0.18)',
        'nf-card': '0 4px 24px rgba(14, 138, 181, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
