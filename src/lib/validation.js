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
  basePay: z.number().min(0, 'Base pay cannot be negative').or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number)).optional()
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
