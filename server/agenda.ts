import type {
  AgendaEntry,
  AgendaPayload,
  Client,
  CommercialActivity,
  CommercialActivityType,
  DashboardData,
  NotificationItem,
  PaymentPromise,
} from '../shared/models.js';
import type { StoredAgendaItem } from './operational-store.js';

const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const operationalDate = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
export const MIN_ACTIONABLE_COLLECTION = 1000;

function hasActionableDebt(client: Client) {
  return client.overdueOutstanding >= MIN_ACTIONABLE_COLLECTION || (client.balance >= MIN_ACTIONABLE_COLLECTION && client.collectionRisk >= 45);
}

function clientEntry(
  client: Client,
  values: Pick<AgendaEntry, 'id' | 'scheduledFor' | 'actionType' | 'reason' | 'source' | 'status' | 'priority'>,
): AgendaEntry {
  return {
    ...values,
    clientId: client.id,
    clientName: client.tradeName,
    seller: client.seller,
    locality: client.locality,
    address: client.address,
    coordinates: client.coordinates,
    collectionRisk: client.collectionRisk,
    commercialOpportunity: client.commercialOpportunity,
    overdueOutstanding: client.overdueOutstanding,
    portfolioStatus: client.portfolioStatus,
    salesBlocked: client.salesBlocked,
  };
}

function suggestedAction(client: Client): CommercialActivityType {
  if (hasActionableDebt(client)) return 'collection';
  if (!client.coordinates) return 'call';
  return 'visit';
}

function suggestedReason(client: Client, date: string) {
  if (client.overdueOutstanding >= MIN_ACTIONABLE_COLLECTION) {
    return `Cobranza: ${currency.format(client.overdueOutstanding)} vencidos; comprobante más antiguo de ${client.oldestOverdueDays} días.`;
  }
  if (client.salesBlocked) return 'Validar con administración el bloqueo de ventas informado por GESI antes de ofrecer.';
  if (client.salesDelta <= -20) return `Recuperación comercial: las ventas cayeron ${Math.abs(client.salesDelta)}% frente al período anterior.`;
  if (client.nextVisitAt <= date) return `Seguimiento previsto: oportunidad O${client.commercialOpportunity} y prioridad P${client.visitPriority}.`;
  return `Desarrollo comercial: oportunidad O${client.commercialOpportunity} con productos complementarios disponibles.`;
}

function suggestedPriority(client: Client, date: string) {
  const overdueBoost = client.overdueOutstanding >= MIN_ACTIONABLE_COLLECTION ? 16 : 0;
  const visitBoost = client.nextVisitAt <= date ? 8 : 0;
  const blockedBoost = client.salesBlocked ? 5 : 0;
  return Math.min(100, client.visitPriority + overdueBoost + visitBoost + blockedBoost);
}

function sourceWeight(source: AgendaEntry['source']) {
  return source === 'promise' ? 3 : source === 'manual' ? 2 : 1;
}

export function buildAgendaPayload(
  data: DashboardData,
  date: string,
  seller: string,
  storedItems: StoredAgendaItem[],
  activities: CommercialActivity[],
  promises: PaymentPromise[],
): AgendaPayload {
  const clients = data.clients.filter((client) => client.active && (!seller || client.seller === seller));
  const byId = new Map(clients.map((client) => [client.id, client]));
  const sellerActivities = activities.filter((activity) => !seller || activity.seller === seller);
  const activitiesOnDate = sellerActivities.filter((activity) => operationalDate(activity.occurredAt) === date);
  const completedClients = new Set(activitiesOnDate.map((activity) => activity.clientId));
  const pendingPromises = promises.filter((promise) => (
    promise.status === 'pending' && promise.dueAt <= date && (!seller || promise.seller === seller)
  ));
  const entries = new Map<number, AgendaEntry>();

  const addEntry = (entry: AgendaEntry) => {
    const existing = entries.get(entry.clientId);
    if (!existing || sourceWeight(entry.source) > sourceWeight(existing.source)
      || (sourceWeight(entry.source) === sourceWeight(existing.source) && entry.priority > existing.priority)) {
      entries.set(entry.clientId, entry);
    }
  };

  storedItems
    .filter((item) => item.scheduledFor === date && (!seller || item.seller === seller))
    .forEach((item) => {
      const client = byId.get(item.clientId);
      if (!client) return;
      addEntry(clientEntry(client, {
        id: item.id,
        scheduledFor: date,
        actionType: item.actionType,
        reason: item.reason,
        source: item.source,
        status: item.status === 'pending' && completedClients.has(client.id) ? 'completed' : item.status,
        priority: Math.min(100, client.visitPriority + 6),
      }));
    });

  pendingPromises.forEach((promise) => {
    const client = byId.get(promise.clientId);
    if (!client) return;
    const overdue = promise.dueAt < date;
    addEntry(clientEntry(client, {
      id: `promise:${promise.id}`,
      scheduledFor: promise.dueAt,
      actionType: 'collection',
      reason: `${overdue ? 'Promesa vencida' : 'Promesa para hoy'}: ${currency.format(promise.amount)}${promise.note ? ` · ${promise.note}` : ''}`,
      source: 'promise',
      status: 'pending',
      priority: overdue ? 100 : 96,
    }));
  });

  const candidateClients = clients
    .filter((client) => (
      client.nextVisitAt <= date
      || client.overdueOutstanding >= MIN_ACTIONABLE_COLLECTION
      || (client.collectionRisk >= 45 && client.balance >= MIN_ACTIONABLE_COLLECTION)
      || client.commercialOpportunity >= 58
      || client.salesBlocked
    ))
    .sort((a, b) => suggestedPriority(b, date) - suggestedPriority(a, date) || b.sales90d - a.sales90d);
  const limit = seller ? 16 : 24;
  candidateClients.forEach((client) => {
    if (entries.size >= limit || entries.has(client.id)) return;
    addEntry(clientEntry(client, {
      id: `suggested:${date}:${client.id}`,
      scheduledFor: date,
      actionType: suggestedAction(client),
      reason: suggestedReason(client, date),
      source: 'algorithm',
      status: completedClients.has(client.id) ? 'completed' : 'pending',
      priority: suggestedPriority(client, date),
    }));
  });

  activitiesOnDate.forEach((activity) => {
    if (entries.has(activity.clientId)) return;
    const client = byId.get(activity.clientId);
    if (!client) return;
    addEntry(clientEntry(client, {
      id: `activity:${activity.id}`,
      scheduledFor: date,
      actionType: activity.type,
      reason: activity.note || 'Gestión registrada fuera de la agenda sugerida.',
      source: 'manual',
      status: 'completed',
      priority: client.visitPriority,
    }));
  });

  const ordered = [...entries.values()].sort((a, b) => (
    Number(a.status === 'completed') - Number(b.status === 'completed')
    || b.priority - a.priority
    || a.clientName.localeCompare(b.clientName, 'es')
  ));
  return {
    date,
    seller,
    entries: ordered,
    activities: sellerActivities.slice(0, 100),
    promises: promises.filter((promise) => !seller || promise.seller === seller).slice(0, 100),
    stats: {
      planned: ordered.length,
      pending: ordered.filter((entry) => entry.status === 'pending').length,
      completed: activitiesOnDate.length,
      overduePromises: pendingPromises.filter((promise) => promise.dueAt < date).length,
      promiseAmountDue: pendingPromises.reduce((sum, promise) => sum + promise.amount, 0),
    },
    definitions: {
      planned: `Clientes visibles combinando reglas, tareas manuales y promesas. El algoritmo completa una base de hasta ${seller ? 16 : 24}; tareas y promesas siempre se agregan aunque superen esa base.`,
      completed: 'Cantidad de gestiones guardadas localmente en la fecha seleccionada; no presume visitas no registradas.',
      promiseAmountDue: 'Suma de promesas pendientes con fecha igual o anterior a la fecha seleccionada.',
    },
  };
}

export function buildNotifications(data: DashboardData, date: string, promises: PaymentPromise[]): NotificationItem[] {
  const clientById = new Map(data.clients.map((client) => [client.id, client]));
  const promiseItems = promises
    .filter((promise) => promise.status === 'pending' && promise.dueAt <= date)
    .map((promise): NotificationItem | null => {
      const client = clientById.get(promise.clientId);
      if (!client || !client.active) return null;
      const overdue = promise.dueAt < date;
      return {
        id: `promise:${promise.id}`,
        type: overdue ? 'promise_overdue' : 'promise_due',
        severity: overdue ? 'critical' : 'attention',
        clientId: client.id,
        title: client.tradeName,
        detail: `${overdue ? 'Promesa vencida' : 'Promesa para hoy'} · ${currency.format(promise.amount)} · ${client.seller}`,
        date: promise.dueAt,
        amount: promise.amount,
      };
    })
    .filter((item): item is NotificationItem => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const promisedClients = new Set(promiseItems.map((item) => item.clientId));
  const riskItems = data.clients
    .filter((client) => client.active && client.collectionRisk >= 55 && hasActionableDebt(client) && !promisedClients.has(client.id))
    .sort((a, b) => b.collectionRisk - a.collectionRisk)
    .slice(0, Math.max(0, 10 - promiseItems.length))
    .map((client): NotificationItem => ({
      id: `risk:${client.id}`,
      type: 'collection_risk',
      severity: 'critical',
      clientId: client.id,
      title: client.tradeName,
      detail: `Riesgo C${client.collectionRisk} · ${client.oldestOverdueDays} días máx. · ${client.seller}`,
      date,
      amount: client.overdueOutstanding || null,
    }));
  return [...promiseItems, ...riskItems].slice(0, 12);
}
