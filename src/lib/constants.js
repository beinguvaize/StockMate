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

export const DEFAULT_PERMISSIONS = {
  inventory: { view: true, edit: false },
  sales: { view: true, edit: true },
  purchases: { view: true, edit: false },
  expenses: { view: true, edit: false },
  clients: { view: true, edit: true },
  suppliers: { view: true, edit: false },
  vehicles: { view: true, edit: false },
  reports: { view: false, edit: false },
  payroll: { view: false, edit: false },
  users: { view: false, edit: false },
  settings: { view: false, edit: false },
  daybook: { view: true, edit: true }
};

export const MODULES_CONFIG = [
  { key: 'inventory', label: 'Inventory Management', icon: 'Package' },
  { key: 'sales', label: 'Sales & Invoicing', icon: 'ShoppingCart' },
  { key: 'purchases', label: 'Purchases (Stock-In)', icon: 'ShoppingBag' },
  { key: 'expenses', label: 'Expense Tracking', icon: 'Wallet' },
  { key: 'clients', label: 'Client Directory', icon: 'Users' },
  { key: 'suppliers', label: 'Supplier Network', icon: 'Truck' },
  { key: 'vehicles', label: 'Fleet Management', icon: 'Truck' },
  { key: 'reports', label: 'Business Intelligence', icon: 'BarChart3' },
  { key: 'payroll', label: 'HR & Payroll', icon: 'Banknote' },
  { key: 'users', label: 'Personnel & Permissions', icon: 'UserPlus' },
  { key: 'settings', label: 'Global Settings', icon: 'Settings' },
  { key: 'daybook', label: 'Day Book', icon: 'BookOpen' }
];

export const AVAILABLE_ROLES = [
  { id: 'GLOBAL_ADMIN', label: 'Global Admin', color: 'bg-purple-100 text-purple-700' },
  { id: 'OWNER', label: 'Owner/Manager', color: 'bg-blue-100 text-blue-700' },
  { id: 'STAFF', label: 'Staff/Operator', color: 'bg-gray-100 text-gray-700' }
];
