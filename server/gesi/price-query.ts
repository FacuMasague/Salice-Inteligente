export const GESI_PRICE_BATCH_SIZE = 40;

export function priceProductIdBatches(productIDs: string[], batchSize = GESI_PRICE_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('El tamaño del lote de precios debe ser un entero positivo.');
  const batches: string[][] = [];
  for (let index = 0; index < productIDs.length; index += batchSize) {
    batches.push(productIDs.slice(index, index + batchSize));
  }
  return batches;
}
