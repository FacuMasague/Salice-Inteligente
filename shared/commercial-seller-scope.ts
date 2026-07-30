/**
 * Vendedores que forman la cartera comercial conocida al definir la v1.2.3.
 * Esta lista documenta el alcance esperado, pero no funciona como lista blanca:
 * un vendedor nuevo de GESI debe aparecer automáticamente.
 */
export const CURRENT_COMMERCIAL_SELLERS = [
  'Andres Dominguez',
  'Edgardo Larrea',
  'Ignacio Carea',
  'Ana Ottaviano',
  'Julieta Errecart',
  'Gonzalo Russian',
  'Reventas',
] as const;

/**
 * Carteras históricas o administrativas observadas hasta la v1.2.2.
 * La exclusión deliberadamente es por nombre conocido. Así, los vendedores
 * creados en el futuro no requieren una modificación del programa para verse.
 */
export const EXCLUDED_HISTORICAL_SELLERS = [
  '',
  'AS',
  'Agustin Cusumano',
  'Agustina Pizarro',
  'Alejandro Alegretti',
  'Alejandro Crespo',
  'Alejandro Lurbe',
  'Alexis Abba',
  'Andrea Poblete',
  'Antonio Alemany',
  'Antonio Segovia',
  'Brenda',
  'Candelaria Stefani',
  'Carolina',
  'Cesar Campbell',
  'Cinthia Rubio',
  'Claudio Ravie',
  'Debora Crespo',
  'Delfina',
  'Diego Imbroglia',
  'Diego Liuni',
  'Diego Rodriguez',
  'Diego Sequier',
  'Eugenia',
  'Ezequiel Castellano',
  'Ezequiel Dolce',
  'Estefania',
  'Facundo Luquez',
  'Flavia Barrella',
  'Gabriel Pinto',
  'Gaston Giampaolo',
  'Giselle Urquiza',
  'Gonzalo Borrione',
  'Gestion Cobranza',
  'Juan Granel',
  'Juan Pablo Greno',
  'Juan Romanelli',
  'Juan Torres',
  'Kevin Alonso',
  'Legales',
  'LM',
  'Luciano Rebagliati',
  'Luciano Rebagliatti',
  'Lucas Morales',
  'Luján',
  'MP',
  'Male',
  'Marcela',
  'María de los Angeles',
  'Maria Luz Ramirez',
  'Maria Marta Gomez',
  'Mariana',
  'Mariana Pereyra',
  'Mariano Villalba',
  'Matias Carricart',
  'Matias Sema',
  'Maximiliano Galleguillo',
  'Maximiliano Kramer',
  'Micaela Melucci',
  'Monica Raña',
  'Narianella Taboada',
  'Nicolas Gorosito',
  'Pablo Remotti',
  'Paola Conti',
  'Perrotti Matias',
  'Reparto',
  'Ricardo Toledo',
  'Rodrigo Batallan',
  'Rodrigo Carranza',
  'Rodrigo Garcia',
  'Rodrigo Neri',
  'Ruta 11 (AS)',
  'Ruta 2',
  'Rutas',
  'Santiago Cordero',
  'Sebastian Cosentino',
  'Silvio Bernabe',
  'Sin vendedor',
  'Tania Almonti',
  'Telemarketing',
  'Uriel Bruno',
  'Valeria',
  'Vanesa Gonard',
  'Vendedor 1',
  'Vendedor 2',
  'Vendedor 3',
  'Vendedor 4',
  'Vendedor 5',
  'Vendedor 6',
  'Vendedor 7',
  'Vendedor 8',
  'Vendedor Uno',
  'Veronica',
  'Virginia Fernandez',
  'Zona Norte',
  'Zona Sur',
  'Administracion AS',
  'Administración',
] as const;

const sellerIdentity = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es')
  .replace(/[^a-z0-9]+/g, '');

const excludedSellerIdentities = new Set(EXCLUDED_HISTORICAL_SELLERS.map(sellerIdentity));

export function isExcludedHistoricalSeller(value: unknown) {
  return excludedSellerIdentities.has(sellerIdentity(value));
}

export function isCommercialSellerIncluded(value: unknown) {
  return !isExcludedHistoricalSeller(value);
}
