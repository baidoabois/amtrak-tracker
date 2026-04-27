/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        amtrak: {
          blue: '#003876',
          red: '#c0392b',
        },
      },
    },
  },
  plugins: [],
};
