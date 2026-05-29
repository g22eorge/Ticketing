/**
 * Shared line-items table for react-pdf invoice templates.
 *
 * Designed to be imported into any invoice template. Colors are passed in so
 * each template can keep its own palette while sharing the same table logic.
 */
import { StyleSheet, Text, View } from "@react-pdf/renderer";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PdfLineItem = {
  description: string;
  quantity:    number;
  unitPrice:   string;   // pre-formatted, e.g. "UGX 48,000"
  discount?:   string;   // optional pre-formatted discount per line
  lineTotal:   string;   // pre-formatted
};

export type LineItemsColors = {
  headerBg:    string;   // table header background
  headerText:  string;   // table header text
  rowBorderBg: string;   // subtle row separator
  altRowBg:    string;   // alternate row tint
  totalAccent: string;   // grand total value color
  labelMuted:  string;   // subtotal/vat label color
};

// ── Shared table styles (created fresh so no collision with host template) ─────

function makeStyles(c: LineItemsColors) {
  return StyleSheet.create({
    wrap:       { marginBottom: 10 },
    table:      { borderRadius: 6, overflow: "hidden", border: `1 solid ${c.rowBorderBg}` },
    thead:      { flexDirection: "row", backgroundColor: c.headerBg },
    tr:         { flexDirection: "row", borderBottom: `1 solid ${c.rowBorderBg}` },
    trAlt:      { flexDirection: "row", borderBottom: `1 solid ${c.rowBorderBg}`, backgroundColor: c.altRowBg },
    th:         { paddingVertical: 6, paddingHorizontal: 8, fontSize: 7.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: c.headerText },
    td:         { paddingVertical: 5, paddingHorizontal: 8, fontSize: 8.6 },
    colDesc:    { flex: 1 },
    colQty:     { width: 40, textAlign: "right" },
    colPrice:   { width: 82, textAlign: "right" },
    colDisc:    { width: 60, textAlign: "right" },
    colTotal:   { width: 82, textAlign: "right" },
    totals:     { marginTop: 6, marginLeft: "auto", width: "42%", paddingRight: 8 },
    totalRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottom: `1 solid ${c.rowBorderBg}` },
    totalLbl:   { fontSize: 8.4, color: c.labelMuted },
    totalVal:   { fontSize: 8.8, fontWeight: 600 },
    grandRow:   { flexDirection: "row", justifyContent: "space-between", paddingTop: 6, marginTop: 4 },
    grandLbl:   { fontSize: 11, fontWeight: 700 },
    grandVal:   { fontSize: 13, fontWeight: 700, color: c.totalAccent },
    emptyRow:   { paddingVertical: 8, paddingHorizontal: 8, fontSize: 8.2 },
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LineItemsTable({
  items,
  colors,
  hasDiscount = false,
  subtotalLabel = "Subtotal",
  subtotalValue,
  vatLabel,
  vatValue,
  totalLabel = "Total Amount Payable",
  totalValue,
}: {
  items:         PdfLineItem[];
  colors:        LineItemsColors;
  hasDiscount?:  boolean;
  subtotalLabel?: string;
  subtotalValue?: string;
  vatLabel?:     string;
  vatValue?:     string;
  totalLabel?:   string;
  totalValue?:   string;
}) {
  const s = makeStyles(colors);

  return (
    <View style={s.wrap}>
      <View style={s.table}>
        {/* Header */}
        <View style={s.thead}>
          <Text style={[s.th, s.colDesc]}>Description</Text>
          <Text style={[s.th, s.colQty]}>Qty</Text>
          <Text style={[s.th, s.colPrice]}>Unit Price</Text>
          {hasDiscount ? <Text style={[s.th, s.colDisc]}>Disc.</Text> : null}
          <Text style={[s.th, s.colTotal]}>Total</Text>
        </View>

        {/* Rows */}
        {items.length === 0 ? (
          <View style={s.tr}><Text style={[s.td, s.emptyRow]}>No items</Text></View>
        ) : items.map((it, i) => (
          <View key={i} style={i % 2 === 0 ? s.tr : s.trAlt}>
            <Text style={[s.td, s.colDesc]}>{it.description}</Text>
            <Text style={[s.td, s.colQty]}>{String(it.quantity)}</Text>
            <Text style={[s.td, s.colPrice]}>{it.unitPrice}</Text>
            {hasDiscount ? <Text style={[s.td, s.colDisc]}>{it.discount ?? "—"}</Text> : null}
            <Text style={[s.td, s.colTotal]}>{it.lineTotal}</Text>
          </View>
        ))}
      </View>

      {/* Totals box */}
      <View style={s.totals}>
        {subtotalValue ? (
          <View style={s.totalRow}><Text style={s.totalLbl}>{subtotalLabel}</Text><Text style={s.totalVal}>{subtotalValue}</Text></View>
        ) : null}
        {vatLabel && vatValue ? (
          <View style={s.totalRow}><Text style={s.totalLbl}>{vatLabel}</Text><Text style={s.totalVal}>{vatValue}</Text></View>
        ) : null}
        {totalValue ? (
          <View style={s.grandRow}><Text style={s.grandLbl}>{totalLabel}</Text><Text style={s.grandVal}>{totalValue}</Text></View>
        ) : null}
      </View>
    </View>
  );
}
