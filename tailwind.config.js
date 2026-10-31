/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#F2F7FF',
          100: '#E6EFFF',
          200: '#C8DCFF',
          300: '#9ABFFF',
          400: '#6497F5',
          500: '#356FE3',
          600: '#1D53C2',
          700: '#153F99',
          800: '#0E2E70',
          850: '#0A255B',
          900: '#071F49', // Deep Navy Blue
          950: '#04122C',
        },
        gold: {
          50: '#FFFDF5',
          100: '#FEF9E1',
          200: '#FDF1B8',
          300: '#FCE788',
          400: '#F8CE4E',
          500: '#F5B51B', // Premium Gold
          600: '#D99B0E',
          700: '#AC7507',
          800: '#885A09',
          900: '#6E480C',
        },
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          500: '#15803d',
          600: '#166534',
          700: '#14532d',
          800: '#166534',
          900: '#14532d',
        },
        surface: {
          canvas: '#F4F7FB',
          card: '#FFFFFF',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
