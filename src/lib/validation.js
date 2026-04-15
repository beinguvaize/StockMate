import { z } from 'zod';

export const saleSchema = z.object({
  clientId: z.string().min(1, 'Client/Customer is required'),
  items: z.array(z.any()).min(1, 'At least one item is required to complete a sale'),
  totalAmount: z.number().min(0, 'Total amount cannot be negative'),
  paymentMethod: z.string().min(1, 'Payment method is required')
});

export const expenseSchema = z.object({
  category: z.string().min(1, 'Expense category is required'),
  title: z.string().optional(),
  amount: z.number().positive('Expense amount must be strictly positive'),
  date: z.string().min(1, 'Date is required')
});

export const purchaseSchema = z.object({
  quantity: z.number().positive('Purchase quantity must be positive').or(z.string().regex(/^\d+$/).transform(Number)),
  unitCost: z.number().min(0, 'Unit cost cannot be negative').or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number)),
  supplier_name: z.string().optional(),
  payment_type: z.string().min(1, 'Payment type is required')
});

export const employeeSchema = z.object({
  name: z.string().min(2, 'Employee name must be at least 2 characters'),
  department: z.string().min(1, 'Department is required'),
  basePay: z.number().min(0, 'Base pay cannot be negative').or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number)).optional(),
  dailyRate: z.number().min(0, 'Daily rate cannot be negative').or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number)).optional(),
  daysWorked: z.number().min(0).or(z.string().regex(/^\d+$/).transform(Number)).optional(),
  amountPaid: z.number().min(0).or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number)).optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional(),
  position: z.string().optional(),
  payType: z.string().optional(),
  bankAccount: z.string().optional(),
  notes: z.string().optional()
});

export const clientSchema = z.object({
  name: z.string().min(2, 'Client name must be at least 2 characters'),
  phone: z.string().optional()
});

export const dayBookSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  opening_balance: z.number().min(0, 'Opening balance cannot be negative').optional(),
  closing_balance: z.number().min(0, 'Closing balance cannot be negative').optional()
});

/** Common weak passwords that are trivially guessable — rejected regardless of length. */
const PASSWORD_DENYLIST = ['password', 'admin123', 'letmein', 'qwerty', '12345678', 'password1'];

/**
 * Strong-password schema.
 * Rules:
 *  - min 10 characters
 *  - at least one uppercase letter
 *  - at least one lowercase letter
 *  - at least one digit
 *  - at least one non-alphanumeric (special) character
 *  - not in the common-password denylist (case-insensitive)
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .refine((v) => /[A-Z]/.test(v), { message: 'Password must contain at least one uppercase letter' })
  .refine((v) => /[a-z]/.test(v), { message: 'Password must contain at least one lowercase letter' })
  .refine((v) => /[0-9]/.test(v), { message: 'Password must contain at least one digit' })
  .refine((v) => /[^A-Za-z0-9]/.test(v), { message: 'Password must contain at least one special character' })
  .refine((v) => !PASSWORD_DENYLIST.includes(v.toLowerCase()), { message: 'Password is too common — choose a stronger one' });

/**
 * Schema for creating a new staff member.
 * Combines identity fields with the strong-password requirement.
 */
export const staffCreateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  role: z.string().min(1, 'Role is required').optional(),
  roles: z.array(z.string()).min(1, 'At least one role is required').optional()
});

/**
 * Returns a strength score and label for a password string.
 * Score 0 = very weak, 4 = strong.
 *
 * @param {string} str
 * @returns {{ score: number, label: string }}
 */
export const passwordStrength = (str) => {
  if (!str) return { score: 0, label: 'empty' };
  let score = 0;
  if (str.length >= 10) score++;
  if (/[A-Z]/.test(str) && /[a-z]/.test(str)) score++;
  if (/[0-9]/.test(str)) score++;
  if (/[^A-Za-z0-9]/.test(str)) score++;
  const labels = ['very weak', 'weak', 'fair', 'good', 'strong'];
  return { score, label: labels[score] };
};
