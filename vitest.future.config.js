import { defineConfig } from 'vitest/config';

// Same suite, same timezone pin as vitest.config.js — only the clock moves.
// Kept as a second config rather than a flag because the setup file must not
// load during a normal run: freezing time by default would hide exactly the
// bugs this exists to find.
process.env.TZ = 'Asia/Kolkata';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
    passWithNoTests: false,
    setupFiles: ['./scripts/freeze-clock.js'],
  },
});
