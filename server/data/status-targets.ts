export interface StatusTargetRow {
  month: string;
  product: string;
  seller: string;
  kilos: number | null;
  accounts: number | null;
  invoicing: number | null;
}

const sellers = ['Alex Morgan', 'Jordan Lee', 'Casey Rivera', 'Taylor Brooks'];
const products = ['EverPaw', 'Northstar', 'WildTail', 'MeadowCat', 'Aster', 'Juniper', 'MaxTrail', 'Pampas Pet'];
const months = Array.from({ length: 13 }, (_, index) => {
  const value = new Date(Date.UTC(2025, 6 + index, 1));
  return value.toISOString().slice(0, 7);
});

export const STATUS_TARGETS: StatusTargetRow[] = months.flatMap((month, monthIndex) => [
  ...sellers.flatMap((seller, sellerIndex) => products.map((product, productIndex) => ({
    month,
    product,
    seller,
    kilos: 650 + monthIndex * 18 + sellerIndex * 75 + productIndex * 28,
    accounts: 8 + (sellerIndex + productIndex) % 7,
    invoicing: null,
  }))),
  ...sellers.slice(0, 2).map((seller, sellerIndex) => ({
    month,
    product: 'Retail Revenue',
    seller,
    kilos: null,
    accounts: 20 + sellerIndex * 4,
    invoicing: 8_500_000 + monthIndex * 160_000 + sellerIndex * 900_000,
  })),
]);

export const STATUS_TARGET_SOURCE = {
  label: 'Synthetic commercial plan',
  capturedAt: '2026-07-15',
  coverageFrom: '2025-07',
  coverageThrough: '2026-07',
};
