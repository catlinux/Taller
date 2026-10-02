/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta principal - Gris antracita con detalles en azul y naranja
        antracita: {
          950: '#0F1215',  // Fondo más profundo
          900: '#14171B',  // Fondo principal
          800: '#1B1F24',  // Fondo tarjetas / sidebar
          700: '#262B32',  // Bordes
          600: '#363D46',  // Bordes hover
          500: '#6B7482',  // Texto suave
        },
        // Acento del tema: canales RGB en variables CSS para poder cambiar la
        // paleta (data-acento) y que sigan funcionando las opacidades (p. ej. /10).
        azul: {
          300: 'rgb(var(--acento-300) / <alpha-value>)',  // Texto de acento
          400: 'rgb(var(--acento-400) / <alpha-value>)',  // Enlaces, foco
          500: 'rgb(var(--acento-500) / <alpha-value>)',  // Acciones, elemento activo
          600: 'rgb(var(--acento-600) / <alpha-value>)',  // Acciones hover
        },
        naranja: {
          300: '#FFC08A',  // Avisos suaves
          400: '#FF9A55',  // Estados que requieren atención
          500: '#FF7A2F',  // Totales
          600: '#E8621A',  // Avisos hover
        },
        // Estados semánticos
        ok: '#34D399',      // Correcto / entregado
        peligro: '#F87171', // Error / eliminar
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        suave: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        'brillo-azul': '0 0 0 1px rgb(var(--acento-500) / 0.35), 0 8px 24px -8px rgb(var(--acento-500) / 0.35)',
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.15)',
        'glow-orange': '0 0 20px rgba(249, 115, 22, 0.15)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
