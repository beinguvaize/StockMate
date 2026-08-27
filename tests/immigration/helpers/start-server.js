/**
 * Boots the ImmigrationTracker Express app for the e2e suite.
 *
 * Playwright's `webServer` runs this instead of `node server.js` directly,
 * because the app must never come up pointed at the Turso database that
 * serves real applicants. The app's own .env holds live Turso credentials
 * and db.js calls dotenv.config(), so the only reliable way to keep them
 * out is to set every one of those variables here first -- dotenv does not
 * overwrite variables that are already defined.
 *
 * The suite writes, deletes and rewrites rows, so it gets a database file of
 * its own that is thrown away and recreated on every run.
 */
const fs = require('fs');
const path = require('path');

const appDir = process.env.IT_APP_DIR;
if (!appDir) {
    console.error('[e2e] IT_APP_DIR is not set. Point it at the immigrationtracker checkout.');
    process.exit(1);
}
if (!fs.existsSync(path.join(appDir, 'server.js'))) {
    console.error(`[e2e] No server.js in IT_APP_DIR (${appDir}).`);
    process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || '';

// Refuse to start against anything but a local file whose name says it is
// disposable. A stray env var must not be able to point a writing test suite
// at the production database.
if (!dbUrl.startsWith('file:')) {
    console.error(
        `[e2e] Refusing to start: DATABASE_URL is "${dbUrl}". ` +
        `The e2e suite creates, edits and deletes applications, so it only ` +
        `runs against a local file: database.`
    );
    process.exit(1);
}

const dbRelPath = dbUrl.slice('file:'.length);
const dbAbsPath = path.resolve(appDir, dbRelPath);
if (!path.basename(dbAbsPath).includes('e2e')) {
    console.error(
        `[e2e] Refusing to start: "${dbAbsPath}" is not an e2e database. ` +
        `Its filename must contain "e2e" so a real one can never be wiped here.`
    );
    process.exit(1);
}

// Fresh database every run, so tests never inherit rows from the last one.
fs.mkdirSync(path.dirname(dbAbsPath), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbAbsPath + suffix, { force: true });
}
console.log(`[e2e] Fresh database at ${dbAbsPath}`);

// db.js resolves a relative file: URL against the process working directory.
process.chdir(appDir);

// Defined, therefore untouched by the app's dotenv call. An empty auth token
// keeps the real Turso credentials out; an empty Resend key makes the email
// service log the reset token instead of mailing a live address.
process.env.TURSO_AUTH_TOKEN = '';
process.env.RESEND_API_KEY = '';
process.env.RESEND_FROM_EMAIL = 'e2e@example.invalid';
process.env.APP_URL = process.env.IT_BASE_URL || 'http://127.0.0.1:3399';
process.env.JWT_SECRET = process.env.IT_JWT_SECRET || 'immigration-tracker-e2e-secret';
process.env.FORCE_PRODUCTION = '';
process.env.ALLOW_DB_WRITES = '';

require(path.join(appDir, 'server.js'));
