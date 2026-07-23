import type { Client, Product, VectorKey } from './models';

export interface ProductCommercialPeriod {
  from: string;
  to: string;
  label: string;
  sales: number;
  units: number;
  buyers: number;
}

export interface ProductBuyerInsight {
  client: Client;
  sales: number;
  units: number;
  lastPurchaseAt: string;
  purchaseDays: number;
}

export interface ProductCommercialTrend {
  value: number | null;
  direction: 'up' | 'down' | 'stable' | 'new' | 'none';
  label: string;
}

export interface ProductCommercialInsight {
  periods: ProductCommercialPeriod[];
  buyers: ProductBuyerInsight[];
  trend: ProductCommercialTrend;
}

const DAY_MS = 86_400_000;

function isoDay(value: string) {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setTime(date.getTime() + amount * DAY_MS);
  return date.toISOString().slice(0, 10);
}

function shortDay(day: string) {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00.000Z`))
    .replace('.', '');
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function commercialTrend(current: number, previous: number): ProductCommercialTrend {
  if (previous <= 0 && current <= 0) return { value: 0, direction: 'none', label: 'Sin ventas en ambos períodos' };
  if (previous <= 0) return { value: null, direction: 'new', label: 'Sin base comparable anterior' };
  const value = Math.round((current - previous) / previous * 1000) / 10;
  if (value >= 10) return { value, direction: 'up', label: `${value.toLocaleString('es-AR')}% vs. 30 días anteriores` };
  if (value <= -10) return { value, direction: 'down', label: `${value.toLocaleString('es-AR')}% vs. 30 días anteriores` };
  return { value, direction: 'stable', label: `${value.toLocaleString('es-AR')}% vs. 30 días anteriores` };
}

export function buildProductCommercialInsight(productId: string, clients: Client[], snapshotDate: string): ProductCommercialInsight {
  const snapshotDay = isoDay(snapshotDate) || new Date().toISOString().slice(0, 10);
  const periods = [2, 1, 0].map((distance): ProductCommercialPeriod => {
    const to = shiftDay(snapshotDay, -(distance * 30));
    const from = shiftDay(to, -29);
    const buyerIds = new Set<number>();
    let sales = 0;
    let units = 0;
    for (const client of clients) {
      for (const purchase of client.purchases) {
        const purchaseDay = isoDay(purchase.date);
        if (purchase.productId !== productId || !purchaseDay || purchaseDay < from || purchaseDay > to) continue;
        sales += purchase.total;
        units += purchase.quantity;
        buyerIds.add(client.id);
      }
    }
    return { from, to, label: `${shortDay(from)}–${shortDay(to)}`, sales: round(sales), units: round(units), buyers: buyerIds.size };
  });

  const buyers = clients.flatMap((client): ProductBuyerInsight[] => {
    const purchases = client.purchases.filter((purchase) => purchase.productId === productId);
    if (!purchases.length) return [];
    return [{
      client,
      sales: round(purchases.reduce((sum, purchase) => sum + purchase.total, 0)),
      units: round(purchases.reduce((sum, purchase) => sum + purchase.quantity, 0)),
      lastPurchaseAt: purchases.reduce((latest, purchase) => purchase.date > latest ? purchase.date : latest, ''),
      purchaseDays: new Set(purchases.map((purchase) => purchase.date)).size,
    }];
  }).sort((left, right) => right.sales - left.sales || right.units - left.units || left.client.name.localeCompare(right.client.name, 'es'));

  return {
    periods,
    buyers,
    trend: commercialTrend(periods[2]?.sales ?? 0, periods[1]?.sales ?? 0),
  };
}

const typeLabels: Array<[VectorKey, string]> = [
  ['alimento_seco', 'alimento seco'],
  ['alimento_humedo', 'alimento húmedo'],
  ['snacks', 'snack'],
  ['farmacia', 'producto de farmacia'],
  ['antiparasitario', 'antiparasitario'],
  ['higiene', 'producto de higiene'],
  ['accesorios', 'accesorio'],
  ['consumo_humano', 'producto de consumo humano'],
];

function activeLabels(product: Product, definitions: Array<[VectorKey, string]>) {
  return definitions
    .filter(([key]) => product.vector[key] > 0)
    .sort(([left], [right]) => product.vector[right] - product.vector[left])
    .map(([, label]) => label);
}

function joinNatural(values: string[]) {
  if (values.length <= 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} y ${values.at(-1)}`;
}

export function summarizeProductForOffice(product: Product) {
  const type = activeLabels(product, typeLabels)[0];
  const species = activeLabels(product, [['perros', 'perros'], ['gatos', 'gatos'], ['otras_especies', 'otras especies']]);
  const stages = activeLabels(product, [['cachorros', 'cachorros'], ['adultos', 'adultos'], ['senior', 'senior']]);
  const positions = activeLabels(product, [['premium', 'premium'], ['economico', 'económico']]);
  const base = type ?? (product.family && !product.family.toLocaleLowerCase('es').startsWith('sin ')
    ? `producto de ${product.family.toLocaleLowerCase('es')}`
    : 'producto sin tipo verificable');
  const audience = species.length ? ` para ${joinNatural(species)}` : '';
  const stage = stages.length ? ` ${joinNatural(stages)}` : '';
  const position = positions.length ? `, segmento ${positions[0]}` : '';
  const text = `${base}${audience}${stage}${position}`;
  return `${text.charAt(0).toLocaleUpperCase('es')}${text.slice(1)}.`;
}

export function productPresentationLabel(product: Product) {
  const pack = product.pack.trim();
  const unit = product.unit.trim();
  if (pack && !pack.toLocaleLowerCase('es').startsWith('sin ') && pack.toLocaleLowerCase('es') !== unit.toLocaleLowerCase('es')) return pack;
  if (product.inventory.unit2 && product.inventory.unit2PerUnit1 && product.inventory.unit2PerUnit1 > 0) {
    return `${product.inventory.unit2PerUnit1.toLocaleString('es-AR')} ${product.inventory.unit2} por ${unit || 'U1'}`;
  }
  if (product.contentKg && product.contentKg > 0) return `${product.contentKg.toLocaleString('es-AR')} kg por ${unit || 'U1'}`;
  return unit || 'Presentación no informada';
}
