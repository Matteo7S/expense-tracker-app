export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseReport {
  id: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  userId: string;
  expenses: Expense[];
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
  isGeneric?: boolean; // Flag per identificare la nota spese generica
}

export interface Expense {
  id: string;
  reportId: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  subcategory?: string;
  numberOfPeople?: number;
  receiptImages: string[];
  date?: string; // Data prioritaria (AI o database)
  createdAt: Date;
  updatedAt: Date;
  // Nuovi campi dall'analisi AI
  merchant?: string;
  location?: string;
  vat?: string;
  aiConfidence?: number;
  currency?: string;
  note?: string;
  receipts?: ReceiptInfo[];
  _aiAnalysis?: any; // Dati completi dell'analisi AI per debug
}

export interface ReceiptInfo {
  id: string;
  imageUrl: string;
  fileName: string;
  uploadedAt: Date;
}

export enum ExpenseCategory {
  FOOD = 'food',
  TRANSPORT = 'transport',
  ACCOMMODATION = 'accommodation',
  ENTERTAINMENT = 'entertainment',
  SHOPPING = 'shopping',
  HEALTH = 'health',
  BUSINESS = 'business',
  OTHER = 'other'
}

export enum FoodSubcategory {
  BREAKFAST = 'breakfast',
  LUNCH = 'lunch',
  DINNER = 'dinner',
  SNACK = 'snack',
  DRINKS = 'drinks'
}

export interface CreateExpenseReportData {
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
}

export interface CreateExpenseData {
  reportId: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  subcategory?: string;
  numberOfPeople?: number;
  receiptImages?: string[];
}

export interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  loading: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FilterOptions {
  startDate?: Date;
  endDate?: Date;
  name?: string;
  category?: ExpenseCategory;
}

export interface SortOptions {
  field: 'name' | 'startDate' | 'endDate' | 'totalAmount' | 'createdAt';
  direction: 'asc' | 'desc';
}
