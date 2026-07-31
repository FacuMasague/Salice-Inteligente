import { gunzipSync } from 'node:zlib';

export interface StatusClientTargetRow {
  month: string;
  product: string;
  seller: string;
  accounts: number;
}

// Objetivos de clientes por producto y vendedor extraídos de las columnas F
// (“Objetivo”) de las hojas Junio 26 y Julio 26 de Objetivos Julio.xlsx.
// Los resultados reales de la columna G no se incorporan: siempre se calculan
// nuevamente desde los movimientos GESI del mes correspondiente.
const compressedTargets = 'H4sIAAAAAAAAE52XQW/UMBCF/0qUA6cgbbfdV3pEUCiFdlcVgkPVg2msrcXGKU6ywP40rvwxVNFsWtvjmeS6em8zYz97/F1f5/PZHC9nx3mRv96YStu2zs7+/ql0WT/8ZFW2bFu1NcrWeXFwMLspWEvpdJO9rStj153e5cXBjHedlmvlyjr7pJzTSuZ5X9ud2tTZVdc0Rtm8OOI9593G6FZlp87pW+XavMCCNV3prbatavJi/lz75sXncJH8KnqRvyyLqM5fCL+8/6qg9XlUFnYb19EN1tW9sr+z39nSmbW2xP6ypnB7WUvQol+5M6qsH0o5M+u7bOWI8Elsfnlzv7yYKSgwaGrvulDGttoqe6vDvJAF+i6/tUPh9/zuDoVfnNxg5JDJjGQO36mfVkUXwQ90rwyansV1XMw+qKoRBetRGCQ9LuM+e95ttTUqu+xaZ1pTEydP4OIKinnYnf9Y23VkPviX1SDzKz8ilNxJ7HXiCsMs+knolWT4LtSvlW5FG7CXcqu+F7KNLDdltnLG3urs9EdnNuabM10lmiik1a9usRAaudg+MV7WW73R8bNzIrH5RZ4cC0zhYKTXZOV0RS3lK4mNm9VRU7jhXtyW962piLL8GA1a7uAMyqAA73Jeqeo+ftf60eyV3HTvdVx6Vro0a6cjM9LfjmdKv0zQ4mDHaCmbpCfa8JLx77cnYvKeuVI7FXlz+y/hvSw4/ouo0O/ZL+1Rxvb7qAt7Jb5L9vmldmoXNurfy4OMe/j0Sm7m97rwCC7iwsj7mfhLstmvd6b5rpqw3ZMZLeQSPWi5m3xQssgwSPktHrTRxjGeJklLkiYJV5ImCU+SJglPmiYJE7liLE1CSJMQ0SRkNAkhTSJNk5hCk4QpNW8IS2r0YBpNkrbUKCZNyXcgJtFk2pW6VFPOFE2mfJMbTNJkykjmUEaTENIkhDQJKU1CRpOQ0SQm0STl4goaTZOQ0STENAkhTUJKkxDTJDiahJwmIaVJiGkS02kyaU29QZJGLrYTaJK0pWiSNCXfxJhGk6SNm9XjaRIjaBJimoSYJiGmSQhpEkKahJgmA2Xq7Q05TWIETWIMTUJAk5DRJKQ0CRlNQkiTkNIkGJqEjCYhpkkIaRJSmoSYJsHRJKQ06Qu5RMtoEnKaxAiaBEmTN/8AC1ejxZ0cAAA=';

const compressedHistoricalTargets = 'H4sIAAAAAAAAE52YT2/TQBDFv4rlAycjpWnzSo8ICqW0JKoQHKoetskqXRHbxbEDzUfjyhdDFXHczO7sjH2N3nN23u7sn9/tbToejfF6dJpm6duVy21Rl8nF3z+5XZTPPxUmmda12ThTlGl2dDS6y0TLorLr5H2Zu2LZ2G2aHY1k1/liaapFmVyZqrJG5/lYFluzKpObZr12pkizE9lz2aycrU1yXlV2bqo6zTARTVfN/Ln+ZGae7k2ancmOG7uxRW3WaTY+1L579dWPlY67FdEgJ0EdjY4W9F/lhTUOyvx8wjoSyUlQxKdQ5o+meEqekmnllrZglo1o8leNaPFyoCP3LaRWaqicWZTPY79wy4dkVjFNoLHResa0npDJq8hLIeQiRfHDuzauqG1hirn1V67aReM4Zsd46KSJHCv/sUcoh8bABqEzkkC9tmFsbI98ML8KE8yOfrpVelmNwjqpBVodXSLkc59MvlYt9Z3Qa9awTBrdThZvystmYwtnki9NXbnalcwOo3BJow55xMUXMglpfy6LZeBEppt9J6PF0i26VUp7TqsTi2qFfgfRhdgqacswMrZFrs3vma1VU7uXSvO5F4r17pXCzE1Xi2RWuWJuk/OfjVu5+8o1ueqAZ620islEaZS6izUK58UL35dyY1c2vDXQq1PQRos7O1WY/PsNn2XnotcY3jOrbM5N2xuNTbqmBU3+IhwrXEJfTR9rlzOlePO610r7RKf0Bg1OKQx0ZvLH8BFIe6xVShfCVie1QauLnzIzu3DLygbuRXRFHChpMeDF3qLhpWIDvND6WzQ9HV6IaQb8Z9mN+sZsTeA1Sd94e5m3L06CQpoOLWInE5PZ6fxUmP8lidDjbadi0/hWVmbrx0E/08mky3OrlC6Arc7fVSZhYeA1yHxSiKSVsZl8f3DrH2btp3I24oVSI3Va6bzslOI7uZPK66XTknz4kQYTQn86w1qidIZxRekM44nSGcYTpzOMKUJnGAebsUhnoKQzUNEZ6OgMlHQGGjqDOJ3BEDrDmGKHMWOJncuMhT+iMYzOsLbYDYg1RZ8RrCty28YgOhN3xQ6YmDNGZ2K+HqH0oDMxY4TOxGxsj+joDJR0Bko6Ax2dgZbOQEdnoKMz0NAZDKIznEsadW86w5mEtBV0Bmo6AyWdgZbOQE1noKMzkOgM9HQGWjoDNZ2Bks5gOJ2JWmO3zahR6q4hdAbD6Axri9EZ1hR9grGuCJ3BMDrD2qRrWn86w7qEvtLSGajpDNR0Blo6AzWdgZLOQElnoKIzUNMZTxl7VEJPZ9CDzqAPnYGazkBBZ6CjM9DSGejoDJR0Blo6AxWdgUBnoKMzUNMZKOkMtHQGajoDHZ2BRGegpTNUKDWSjs5AT2fQg85AS2fA0pm7f1wBkz49IwAA';

type EncodedTarget = [string, string, string, number];

export const STATUS_CLIENT_TARGETS: StatusClientTargetRow[] = (JSON.parse(
  gunzipSync(Buffer.from(compressedTargets, 'base64')).toString('utf8'),
) as EncodedTarget[]).map(([month, product, seller, accounts]) => ({ month, product, seller, accounts }));

export const STATUS_CLIENT_TARGET_HISTORY: StatusClientTargetRow[] = (JSON.parse(
  gunzipSync(Buffer.from(compressedHistoricalTargets, 'base64')).toString('utf8'),
) as EncodedTarget[]).map(([month, product, seller, accounts]) => ({ month, product, seller, accounts }));

export const STATUS_CLIENT_TARGET_SOURCE = {
  label: 'Objetivos de clientes · Objetivos Julio.xlsx',
  file: 'Objetivos Julio.xlsx',
  sheets: { '2026-06': 'Junio 26', '2026-07': 'Julio 26' } as Record<string, string>,
  coverageFrom: '2026-06',
  coverageThrough: '2026-07',
};
