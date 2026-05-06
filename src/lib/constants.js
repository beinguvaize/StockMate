// Application constants and defaults
// Moved here to resolve Vite/React Fast Refresh compatibility issues in Context files.

export const INITIAL_PRODUCTS = [];
export const INITIAL_USERS = [];
export const INITIAL_CLIENTS = [];
export const INITIAL_EXPENSES = [];
export const INITIAL_VEHICLES = [];
export const INITIAL_SHOPS = [];
export const INITIAL_EMPLOYEES = [];

export const INITIAL_BUSINESS = {
  name: 'Ledgr ERP',
  country: 'India',
  currency: 'INR',
  currencySymbol: '₹',
  lowStockThreshold: 10,
  pan_no: '',
  gst_no: '',
  bank_name: '',
  account_no: '',
  ifsc_code: '',
  upi_id: '',
  email: '',
  website: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  logo_url: ''
};

export const INITIAL_EXPENSE_CATEGORIES = ['General', 'Inventory', 'Logistics', 'Payroll', 'Utilities', 'Marketing', 'Rent', 'Other'];

export const AVAILABLE_ROLES = ['OWNER', 'SALES', 'INVENTORY', 'STAFF', 'GLOBAL_ADMIN'];

export const MODULES_CONFIG = [
  { key: 'inventory', label: 'Inventory' },
  { key: 'sales', label: 'Sales' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'clients', label: 'Clients' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'reports', label: 'Reports' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'users', label: 'Users' },
  { key: 'settings', label: 'Settings' },
  { key: 'daybook', label: 'Day Book' }
];

export const DEFAULT_PERMISSIONS = {
  dashboard: { view: false, edit: false },
  inventory: { view: false, edit: false },
  sales: { view: false, edit: false },
  purchases: { view: false, edit: false },
  expenses: { view: false, edit: false },
  clients: { view: false, edit: false },
  suppliers: { view: false, edit: false },
  vehicles: { view: false, edit: false },
  reports: { view: false, edit: false },
  payroll: { view: false, edit: false },
  users: { view: false, edit: false },
  settings: { view: false, edit: false },
  daybook: { view: false, edit: false }
};

export const GST_RATES = [0, 5, 12, 18, 28];
export const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' }
];

export const TAX_SLABS = [
  { label: '0%', value: 0 },
  { label: '5%', value: 5 },
  { label: '12%', value: 12 },
  { label: '18%', value: 18 },
  { label: '28%', value: 28 }
];

export const UNITS = ['PCS', 'KG', 'LITRE', 'BOX', 'PACK', 'DOZEN', 'SET', 'BAG', 'SQFT', 'MSTR'];
