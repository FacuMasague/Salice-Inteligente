import { describe, expect, it } from 'vitest';
import type { CommercialActivity } from '../../shared/models';
import { partitionClientActivities } from './commercial-activities';

const activity = (id: string, productIds: string[]): CommercialActivity => ({
  id,
  clientId: 123,
  seller: 'Vendedor prueba',
  type: 'note',
  outcome: 'noted',
  occurredAt: '2026-07-23T15:00:00.000Z',
  note: `Nota ${id}`,
  amount: null,
  productIds,
  nextActionAt: null,
  createdAt: '2026-07-23T15:00:00.000Z',
});

describe('secciones de gestiones del cliente', () => {
  it('separa las notas vinculadas a productos sin duplicarlas entre oportunidades y notas generales', () => {
    const linked = activity('vinculada', ['producto-123']);
    const general = activity('general', []);
    const result = partitionClientActivities([linked, general]);
    expect(result.opportunities).toEqual([linked]);
    expect(result.general).toEqual([general]);
  });
});
