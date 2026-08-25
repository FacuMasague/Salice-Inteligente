import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../../server/data/demo-snapshot';
import type { NotificationItem } from '../../shared/models';
import { buildHomeSummary, parseRecentHomeViews, rememberRecentHomeView } from './home-summary';

describe('resumen de Inicio', () => {
  it('usa la política común de cobranzas y separa promesas de riesgos', () => {
    const data = createDemoSnapshot();
    const eligible = data.clients.find((client) => client.invoices.some((invoice) => invoice.status === 'overdue'))!;
    const excluded = data.clients.find((client) => client.id !== eligible.id && client.invoices.some((invoice) => invoice.outstanding > 0))!;
    data.clients = [
      { ...eligible, seller: 'Andres Dominguez', invoices: eligible.invoices.map((invoice) => ({ ...invoice, seller: 'Andres Dominguez' })) },
      { ...excluded, name: 'Consumidor Final', tradeName: 'Consumidor Final', seller: 'Andres Dominguez', invoices: excluded.invoices.map((invoice) => ({ ...invoice, status: invoice.outstanding > 0 ? 'overdue' : invoice.status, seller: 'Andres Dominguez' })) },
    ];
    const notifications: NotificationItem[] = [
      { id: 'promise', type: 'promise_due', severity: 'attention', clientId: eligible.id, title: 'Promesa', detail: 'Hoy', date: '2026-07-15', amount: 10_000 },
      { id: 'risk', type: 'collection_risk', severity: 'critical', clientId: eligible.id, title: 'Riesgo', detail: 'Revisar', date: '2026-07-15', amount: null },
    ];

    const summary = buildHomeSummary(data, notifications);

    expect(summary.promiseItems.map((item) => item.id)).toEqual(['promise']);
    expect(summary.collectionItems.map((item) => item.id)).toEqual(['risk']);
    expect(summary.overdueInvoices.length).toBeGreaterThan(0);
    expect(summary.overdueAmount).toBe(eligible.invoices.filter((invoice) => invoice.status === 'overdue').reduce((sum, invoice) => sum + invoice.outstanding, 0));
  });

  it('limita la lista prioritaria sin modificar el orden recibido', () => {
    const data = createDemoSnapshot();
    const notifications = Array.from({ length: 8 }, (_, index): NotificationItem => ({
      id: `item-${index}`,
      type: 'collection_risk',
      severity: 'attention',
      clientId: data.clients[0].id,
      title: `Alerta ${index}`,
      detail: 'Revisar',
      date: '2026-07-15',
      amount: null,
    }));

    expect(buildHomeSummary(data, notifications).priorityItems.map((item) => item.id)).toEqual([
      'item-0', 'item-1', 'item-2', 'item-3', 'item-4', 'item-5',
    ]);
  });

  it('traslada al Inicio las métricas determinísticas antes visibles en el mapa', () => {
    const data = createDemoSnapshot();
    const activeClients = data.clients.filter((client) => client.active);

    const summary = buildHomeSummary(data, []);

    expect(summary.activeClients).toHaveLength(activeClients.length);
    expect(summary.portfolio90d).toBe(activeClients.reduce((sum, client) => sum + client.sales90d, 0));
    expect(summary.accountBalance).toBe(activeClients.reduce((sum, client) => sum + client.balance, 0));
    expect(summary.highRiskClients).toHaveLength(activeClients.filter((client) => client.health === 'critical').length);
    expect(Number.isFinite(summary.portfolioKilos90d)).toBe(true);
  });

  it('conserva como máximo las últimas cuatro vistas distintas y descarta valores inválidos', () => {
    let recent = parseRecentHomeViews(JSON.stringify(['clients', 'clients', 'unknown', 'products', 'finance']));
    expect(recent).toEqual(['clients', 'products', 'finance']);

    recent = rememberRecentHomeView(recent, 'map');
    recent = rememberRecentHomeView(recent, 'routes');
    expect(recent).toEqual(['routes', 'map', 'clients', 'products']);
    expect(rememberRecentHomeView(recent, 'home')).toBe(recent);
    expect(parseRecentHomeViews('{')).toEqual([]);
  });
});
