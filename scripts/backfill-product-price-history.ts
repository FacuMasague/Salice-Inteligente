import { initializeProductPriceHistory } from '../server/product-price-history.js';
import { loadSnapshot } from '../server/store.js';

const result = await initializeProductPriceHistory(await loadSnapshot());
console.log(JSON.stringify(result, null, 2));
