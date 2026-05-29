/**
 * Standard journal entry templates.
 *
 * Each template defines the canonical double-entry pattern for a common
 * business transaction.  Lines carry `nameHints` (keywords to match against
 * the organisation's chart-of-accounts names) and `accountTypes` (Prisma
 * AccountType values, tried in priority order) so the UI can attempt an
 * automatic account lookup and pre-select the most likely match.
 */

export type TemplateLine = {
  /** Human label shown in the debit/credit column header and pre-filled as the line memo. */
  role: string;
  /** Whether this line is a debit or credit. */
  side: "DR" | "CR";
  /** Prisma AccountType values to match, in priority order. */
  accountTypes: string[];
  /** Lowercase keywords checked against the account name (first match wins). */
  nameHints: string[];
};

export type JournalTemplate = {
  id: string;
  title: string;
  /** Standard narration pre-filled into the entry description. */
  narration: string;
  icon: string;
  category: string;
  lines: TemplateLine[];
};

export const JOURNAL_TEMPLATES: JournalTemplate[] = [
  // ── 1. Capital Introduction ──────────────────────────────────────────────
  {
    id: "capital-intro",
    title: "Capital Introduction",
    narration: "Being capital introduced into the business.",
    icon: "💰",
    category: "Equity",
    lines: [
      {
        role: "Cash / Bank",
        side: "DR",
        accountTypes: ["ASSET"],
        nameHints: ["cash", "bank", "petty cash"],
      },
      {
        role: "Capital",
        side: "CR",
        accountTypes: ["EQUITY"],
        nameHints: ["capital", "owner", "equity", "share capital"],
      },
    ],
  },

  // ── 2. Purchase of Goods ─────────────────────────────────────────────────
  {
    id: "purchase-goods",
    title: "Purchase of Goods",
    narration: "Being goods bought for business operations.",
    icon: "🛒",
    category: "Trading",
    lines: [
      {
        role: "Purchases / Inventory",
        side: "DR",
        accountTypes: ["ASSET", "EXPENSE"],
        nameHints: ["purchases", "inventory", "stock", "goods"],
      },
      {
        role: "Cash / Bank or Accounts Payable",
        side: "CR",
        accountTypes: ["ASSET", "LIABILITY"],
        nameHints: ["cash", "bank", "accounts payable", "creditors", "payable"],
      },
    ],
  },

  // ── 3. Sale of Goods / Services ──────────────────────────────────────────
  {
    id: "sale-goods",
    title: "Sale of Goods / Services",
    narration: "Being sales made by the company.",
    icon: "🧾",
    category: "Trading",
    lines: [
      {
        role: "Cash / Bank or Accounts Receivable",
        side: "DR",
        accountTypes: ["ASSET"],
        nameHints: ["cash", "bank", "accounts receivable", "debtors", "receivable"],
      },
      {
        role: "Sales Revenue",
        side: "CR",
        accountTypes: ["REVENUE"],
        nameHints: ["sales", "revenue", "income", "turnover"],
      },
    ],
  },

  // ── 4. Rent Payment ──────────────────────────────────────────────────────
  {
    id: "rent-payment",
    title: "Rent Payment",
    narration: "Being rent paid for company premises.",
    icon: "🏠",
    category: "Expenses",
    lines: [
      {
        role: "Rent Expense",
        side: "DR",
        accountTypes: ["EXPENSE"],
        nameHints: ["rent", "lease", "premises"],
      },
      {
        role: "Cash / Bank",
        side: "CR",
        accountTypes: ["ASSET"],
        nameHints: ["cash", "bank"],
      },
    ],
  },

  // ── 5. Salaries / Wages ──────────────────────────────────────────────────
  {
    id: "salaries",
    title: "Salaries / Wages",
    narration: "Being salaries paid to staff.",
    icon: "👷",
    category: "Expenses",
    lines: [
      {
        role: "Salaries / Wages Expense",
        side: "DR",
        accountTypes: ["EXPENSE"],
        nameHints: ["salaries", "wages", "salary", "payroll", "staff costs"],
      },
      {
        role: "Cash / Bank",
        side: "CR",
        accountTypes: ["ASSET"],
        nameHints: ["cash", "bank"],
      },
    ],
  },

  // ── 6. Equipment Purchase ────────────────────────────────────────────────
  {
    id: "equipment-purchase",
    title: "Equipment Purchase",
    narration: "Being purchase of company equipment.",
    icon: "🖥️",
    category: "Assets",
    lines: [
      {
        role: "Equipment / Fixed Assets",
        side: "DR",
        accountTypes: ["ASSET"],
        nameHints: ["equipment", "fixed assets", "machinery", "property", "furniture", "computer"],
      },
      {
        role: "Cash / Bank or Accounts Payable",
        side: "CR",
        accountTypes: ["ASSET", "LIABILITY"],
        nameHints: ["cash", "bank", "accounts payable", "creditors"],
      },
    ],
  },

  // ── 7. Utilities Payment ─────────────────────────────────────────────────
  {
    id: "utilities",
    title: "Utilities Payment",
    narration: "Being payment for electricity, water, internet, etc.",
    icon: "⚡",
    category: "Expenses",
    lines: [
      {
        role: "Utilities Expense",
        side: "DR",
        accountTypes: ["EXPENSE"],
        nameHints: ["utilities", "electricity", "water", "internet", "power"],
      },
      {
        role: "Cash / Bank",
        side: "CR",
        accountTypes: ["ASSET"],
        nameHints: ["cash", "bank"],
      },
    ],
  },

  // ── 8. Customer Pays Invoice ─────────────────────────────────────────────
  {
    id: "customer-payment",
    title: "Customer Pays Invoice",
    narration: "Being payment received from customer.",
    icon: "📥",
    category: "Receivables",
    lines: [
      {
        role: "Cash / Bank",
        side: "DR",
        accountTypes: ["ASSET"],
        nameHints: ["cash", "bank"],
      },
      {
        role: "Accounts Receivable",
        side: "CR",
        accountTypes: ["ASSET"],
        nameHints: ["accounts receivable", "debtors", "receivable", "trade debtors"],
      },
    ],
  },

  // ── 9. Pay Supplier ──────────────────────────────────────────────────────
  {
    id: "pay-supplier",
    title: "Pay Supplier",
    narration: "Being payment made to supplier.",
    icon: "📤",
    category: "Payables",
    lines: [
      {
        role: "Accounts Payable",
        side: "DR",
        accountTypes: ["LIABILITY"],
        nameHints: ["accounts payable", "creditors", "trade creditors", "payable"],
      },
      {
        role: "Cash / Bank",
        side: "CR",
        accountTypes: ["ASSET"],
        nameHints: ["cash", "bank"],
      },
    ],
  },

  // ── 10. Loan Received ────────────────────────────────────────────────────
  {
    id: "loan-received",
    title: "Loan Received",
    narration: "Being loan received by the company.",
    icon: "🏦",
    category: "Financing",
    lines: [
      {
        role: "Cash / Bank",
        side: "DR",
        accountTypes: ["ASSET"],
        nameHints: ["cash", "bank"],
      },
      {
        role: "Loan Payable",
        side: "CR",
        accountTypes: ["LIABILITY"],
        nameHints: ["loan", "borrowings", "long-term loan", "bank loan"],
      },
    ],
  },

  // ── 11. Loan Repayment ───────────────────────────────────────────────────
  {
    id: "loan-repayment",
    title: "Loan Repayment",
    narration: "Being repayment of loan plus interest.",
    icon: "💸",
    category: "Financing",
    lines: [
      {
        role: "Loan Payable",
        side: "DR",
        accountTypes: ["LIABILITY"],
        nameHints: ["loan", "borrowings", "bank loan"],
      },
      {
        role: "Interest Expense",
        side: "DR",
        accountTypes: ["EXPENSE"],
        nameHints: ["interest", "finance charge", "bank charges"],
      },
      {
        role: "Cash / Bank",
        side: "CR",
        accountTypes: ["ASSET"],
        nameHints: ["cash", "bank"],
      },
    ],
  },

  // ── 12. Depreciation ────────────────────────────────────────────────────
  {
    id: "depreciation",
    title: "Depreciation",
    narration: "Being depreciation charged on company assets.",
    icon: "📉",
    category: "Adjustments",
    lines: [
      {
        role: "Depreciation Expense",
        side: "DR",
        accountTypes: ["EXPENSE"],
        nameHints: ["depreciation", "amortisation", "amortization"],
      },
      {
        role: "Accumulated Depreciation",
        side: "CR",
        accountTypes: ["ASSET"],
        nameHints: ["accumulated depreciation", "acc dep", "acc. dep", "provision for dep"],
      },
    ],
  },
];
