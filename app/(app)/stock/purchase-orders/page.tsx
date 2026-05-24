import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function buildQuery(searchParams: SearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value != null) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function StockPurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  redirect(`/inventory/purchase-orders${buildQuery(await searchParams)}`);
}
