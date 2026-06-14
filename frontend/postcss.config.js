module.exports = {
  plugins: {
    // Tailwind v4 ships its PostCSS plugin as a separate package and handles
    // vendor prefixing internally (no standalone autoprefixer needed).
    "@tailwindcss/postcss": {},
  },
};
