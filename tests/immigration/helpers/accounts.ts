import { APIRequestContext, Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const AUTH_DIR = path.join(__dirname, '..', '..', '..', 'playwright', '.auth');
export const ACCOUNTS_FILE = path.join(AUTH_DIR, 'it-accounts.json');
export const USER_STATE = path.join(AUTH_DIR, 'it-user.json');
export const ADMIN_STATE = path.join(AUTH_DIR, 'it-admin.json');

export interface Account {
  email: string;
  password: string;
  token: string;
  id: number;
  role: string;
}

export interface Accounts {
  /** The first account registered against the fresh database, so it is admin. */
  admin: Account;
  /** The account the browser projects sign in as. */
  user: Account;
  /** A second applicant, used to prove one user cannot touch another's data. */
  other: Account;
}

export function readAccounts(): Accounts {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    throw new Error(
      `${ACCOUNTS_FILE} is missing. The it-setup project writes it; run the ` +
      `suite through playwright.immigration.config.ts rather than on its own.`
    );
  }
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
}

export const PASSWORD = 'e2e-passw0rd';

/** Email addresses are unique per run so a reused database cannot collide. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.invalid`;
}

export async function register(
  request: APIRequestContext,
  email: string,
  password = PASSWORD
): Promise<Account> {
  const res = await request.post('/api/auth/register', { data: { email, password } });
  expect(res.status(), `register ${email}`).toBe(201);
  const body = await res.json();
  return { email, password, token: body.token, id: body.user.id, role: body.user.role };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * The browser keeps its session in localStorage, not a cookie, so a storage
 * state file has to carry the same two keys main.js reads on load.
 */
export function writeStorageState(file: string, baseURL: string, account: Account): void {
  const state = {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [
          { name: 'token', value: account.token },
          {
            name: 'user',
            value: JSON.stringify({
              id: account.id,
              email: account.email,
              role: account.role,
            }),
          },
        ],
      },
    ],
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

/** An ISO date `days` away from today; negative values are in the past. */
export function dateFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export interface ApplicationInput {
  program_type?: string;
  stream?: string;
  noc_code?: string;
  submission_date?: string;
  work_permit_expiry?: string;
  status?: string;
  status_note?: string;
  ns_graduate?: boolean;
  has_case_number?: boolean;
  case_number_date?: string | null;
  nominated_date?: string | null;
}

export function applicationPayload(overrides: ApplicationInput = {}) {
  return {
    program_type: 'NS PNP',
    stream: 'Skilled Worker',
    noc_code: '21231',
    submission_date: dateFromToday(-120),
    work_permit_expiry: dateFromToday(400),
    status: 'Submitted',
    status_note: '',
    ns_graduate: false,
    has_case_number: false,
    case_number_date: null,
    nominated_date: null,
    ...overrides,
  };
}

export async function createApplication(
  request: APIRequestContext,
  token: string,
  overrides: ApplicationInput = {}
) {
  const res = await request.post('/api/applications', {
    headers: auth(token),
    data: applicationPayload(overrides),
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

/**
 * Put an account's session into the page.
 *
 * Several specs need an applicant whose applications nothing else touches, so
 * they register one mid-test rather than reuse the shared storage state.
 */
export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([token, user]) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', user);
    },
    [
      account.token,
      JSON.stringify({ id: account.id, email: account.email, role: account.role }),
    ]
  );
  await page.reload();
}

/** Registers a brand new applicant and signs the page in as them. */
export async function freshApplicant(
  page: Page,
  request: APIRequestContext,
  prefix = 'applicant'
): Promise<Account> {
  const account = await register(request, uniqueEmail(prefix));
  await signIn(page, account);
  return account;
}
