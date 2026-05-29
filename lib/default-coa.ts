/**
 * Default chart of accounts for a small business (Uganda / East Africa context).
 *
 * Codes follow the standard 4-digit grouping:
 *   1xxx  Assets
 *   2xxx  Liabilities
 *   3xxx  Equity
 *   4xxx  Revenue
 *   5xxx  Expenses
 *
 * All entries are marked isSystem = false so the user can edit/delete them
 * freely after seeding.  Only accounts that the user truly must not touch
 * should be isSystem = true — none are required here.
 */

type DefaultAccount = {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  description?: string;
};

export const DEFAULT_COA: DefaultAccount[] = [
  // ── ASSETS ───────────────────────────────────────────────────────────────
  { code: "1000", name: "Cash",                         type: "ASSET",   description: "Physical cash on hand" },
  { code: "1010", name: "Bank Account",                 type: "ASSET",   description: "Main operating bank account" },
  { code: "1020", name: "Petty Cash",                   type: "ASSET",   description: "Small cash fund for minor expenses" },
  { code: "1100", name: "Accounts Receivable",          type: "ASSET",   description: "Amounts owed by customers" },
  { code: "1110", name: "Other Receivables",            type: "ASSET",   description: "Deposits, advances, and other amounts receivable" },
  { code: "1200", name: "Inventory / Stock",            type: "ASSET",   description: "Goods held for sale or repair" },
  { code: "1300", name: "Prepaid Expenses",             type: "ASSET",   description: "Expenses paid in advance" },
  { code: "1400", name: "Equipment",                    type: "ASSET",   description: "Computers, tools, and other equipment" },
  { code: "1410", name: "Accumulated Depreciation — Equipment", type: "ASSET", description: "Contra asset: total depreciation on equipment" },
  { code: "1500", name: "Furniture & Fixtures",         type: "ASSET",   description: "Office furniture and fittings" },
  { code: "1510", name: "Accumulated Depreciation — Furniture", type: "ASSET", description: "Contra asset: total depreciation on furniture" },
  { code: "1600", name: "Motor Vehicles",               type: "ASSET",   description: "Company vehicles" },
  { code: "1610", name: "Accumulated Depreciation — Vehicles",  type: "ASSET", description: "Contra asset: total depreciation on vehicles" },

  // ── LIABILITIES ──────────────────────────────────────────────────────────
  { code: "2000", name: "Accounts Payable",             type: "LIABILITY", description: "Amounts owed to suppliers" },
  { code: "2100", name: "Accrued Expenses",             type: "LIABILITY", description: "Expenses incurred but not yet paid" },
  { code: "2200", name: "VAT Payable",                  type: "LIABILITY", description: "VAT collected and due to URA" },
  { code: "2210", name: "Withholding Tax Payable",      type: "LIABILITY", description: "WHT deducted and payable to URA" },
  { code: "2300", name: "Salaries Payable",             type: "LIABILITY", description: "Wages earned by staff but not yet paid" },
  { code: "2400", name: "Loan Payable",                 type: "LIABILITY", description: "Bank loans and borrowings" },
  { code: "2410", name: "Interest Payable",             type: "LIABILITY", description: "Accrued interest on loans" },
  { code: "2500", name: "Deferred Revenue",             type: "LIABILITY", description: "Payments received before service is delivered" },
  { code: "2600", name: "Other Current Liabilities",   type: "LIABILITY", description: "Other short-term obligations" },

  // ── EQUITY ───────────────────────────────────────────────────────────────
  { code: "3000", name: "Owner's Capital",              type: "EQUITY",  description: "Capital contributed by the owner(s)" },
  { code: "3100", name: "Retained Earnings",            type: "EQUITY",  description: "Accumulated profits kept in the business" },
  { code: "3200", name: "Owner's Drawings",             type: "EQUITY",  description: "Amounts withdrawn by the owner" },

  // ── REVENUE ──────────────────────────────────────────────────────────────
  { code: "4000", name: "Sales Revenue",                type: "REVENUE", description: "Income from sale of goods" },
  { code: "4100", name: "Service Revenue",              type: "REVENUE", description: "Income from services rendered (repairs, labour, etc.)" },
  { code: "4200", name: "Repair Revenue",               type: "REVENUE", description: "Income specifically from device repairs" },
  { code: "4300", name: "Interest Income",              type: "REVENUE", description: "Interest earned on deposits or loans given" },
  { code: "4900", name: "Other Income",                 type: "REVENUE", description: "Miscellaneous income not classified elsewhere" },

  // ── EXPENSES ─────────────────────────────────────────────────────────────
  { code: "5000", name: "Cost of Goods Sold",           type: "EXPENSE", description: "Direct cost of goods sold or used in repairs" },
  { code: "5100", name: "Purchases",                    type: "EXPENSE", description: "Goods and parts purchased for resale or use" },
  { code: "5200", name: "Salaries & Wages",             type: "EXPENSE", description: "Employee salaries, wages, and benefits" },
  { code: "5300", name: "Rent Expense",                 type: "EXPENSE", description: "Rent for office, shop, or warehouse" },
  { code: "5400", name: "Utilities Expense",            type: "EXPENSE", description: "Electricity, water, internet, and phone" },
  { code: "5500", name: "Depreciation Expense",         type: "EXPENSE", description: "Periodic write-down of fixed assets" },
  { code: "5600", name: "Interest Expense",             type: "EXPENSE", description: "Interest paid on loans and overdrafts" },
  { code: "5700", name: "Office Supplies",              type: "EXPENSE", description: "Stationery, printer ink, and small office items" },
  { code: "5800", name: "Marketing & Advertising",      type: "EXPENSE", description: "Promotional costs, social media, printing" },
  { code: "5900", name: "Bank Charges",                 type: "EXPENSE", description: "Bank transaction fees and service charges" },
  { code: "5950", name: "Professional Fees",            type: "EXPENSE", description: "Accounting, legal, and consultancy fees" },
  { code: "5990", name: "Miscellaneous Expenses",       type: "EXPENSE", description: "Other expenses not classified elsewhere" },
];
