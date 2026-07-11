// Tailwind v4 hooks into the build through PostCSS. This is the only wiring
// it needs — the rest of Tailwind's config lives in app/globals.css.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
