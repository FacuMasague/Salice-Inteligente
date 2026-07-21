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

// Deliberately alternate realistic wins and misses so the demo tells a useful planning story.
// Totals are deterministic and remain independent from the generated actual-sales dataset.
const coreMonthlyKilos = [3840, 4096, 3360, 4000, 3520, 4160, 3840, 4320, 3424, 4096, 3296, 3904, 4480];
const strategicMonthlyKilos = [112, 176, 224, 144, 160, 192, 80, 128, 80, 160, 208, 160, 96];
const retailMonthlyRevenue = [9_000_000, 10_000_000, 8_000_000, 8_000_000, 7_500_000, 10_500_000, 8_500_000, 9_000_000, 8_200_000, 10_000_000, 9_000_000, 11_000_000, 10_000_000];

export const STATUS_TARGETS: StatusTargetRow[] = months.flatMap((month, monthIndex) => [
  ...sellers.flatMap((seller, sellerIndex) => products.map((product, productIndex) => ({
    month,
    product,
    seller,
    kilos: productIndex < 4
      ? coreMonthlyKilos[monthIndex] / 16 + [-9, -3, 3, 9][sellerIndex] + [-6, -2, 2, 6][productIndex]
      : strategicMonthlyKilos[monthIndex] / 16,
    accounts: 8 + (sellerIndex + productIndex) % 7,
    invoicing: null,
  }))),
  ...sellers.slice(0, 2).map((seller, sellerIndex) => ({
    month,
    product: 'Retail Revenue',
    seller,
    kilos: null,
    accounts: 20 + sellerIndex * 4,
    invoicing: retailMonthlyRevenue[monthIndex] / 2 + (sellerIndex ? 350_000 : -350_000),
  })),
]);

export const STATUS_TARGET_SOURCE = {
  label: 'Synthetic commercial plan · balanced demo v2',
  capturedAt: '2026-07-15',
  coverageFrom: '2025-07',
  coverageThrough: '2026-07',
};
