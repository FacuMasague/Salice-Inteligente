import type {
  Client,
  CommercialActivity,
  CommercialInboxEntry,
  CommercialInboxPayload,
  CommercialInboxSignal,
  DashboardData,
  NotificationItem,
  PaymentPromise,
  ReceivableCase,
} from '../shared/models.js';
import { decodeMultiFilter, matchesMultiFilter } from '../shared/multi-filter.js';
import { isCommercialOpportunityEligible } from '../shared/commercial-opportunities.js';
import type { StoredAgendaItem } from './operational-store.js';

const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const operationalDate = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
export const MIN_ACTIONABLE_COLLECTION = 1000;

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function addDays(value: string, days: number) {
  const result = dateAtNoon(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function commercialWeek(date: string) {
  const current = dateAtNoon(date);
  const day = current.getUTCDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = addDays(date, distanceToMonday);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

function hasActionableDebt(client: Client) {
  return client.overdueOutstanding >= MIN_ACTIONABLE_COLLECTION
    || (client.balance >= MIN_ACTIONABLE_COLLECTION && client.collectionRisk >= 45);
}

function signal(
  values: Omit<CommercialInboxSignal, 'amount'> & { amount?: number | null },
): CommercialInboxSignal {
  return { ...values, amount: values.amount ?? null };
}

function systemSignals(client: Client, weekEnd: string): CommercialInboxSignal[] {
  const values: CommercialInboxSignal[] = [];
  if (client.salesBlocked) {
    values.push(signal({
      id: `sales-blocked:${client.id}`,
      kind: 'sales_blocked',
      source: 'system',
      label: 'Bloqueo de ventas informado',
      detail: 'GESI informa bloqueo de ventas. La oficina debe validarlo antes de ofrecer.',
      date: null,
      severity: 'critical',
    }));
  }
  if (client.salesDelta <= -20) {
    values.push(signal({
      id: `sales-decline:${client.id}`,
      kind: 'sales_decline',
      source: 'system',
      label: 'Caída comercial',
      detail: `Las ventas de 90 días cayeron ${Math.abs(client.salesDelta)}% frente al período anterior.`,
      date: null,
      severity: client.salesDelta <= -40 ? 'critical' : 'attention',
    }));
  }
  if (client.collectionRisk >= 55 && hasActionableDebt(client)) {
    values.push(signal({
      id: `collection-risk:${client.id}`,
      kind: 'collection_risk',
      source: 'system',
      label: `Riesgo de cobranza ${client.collectionRisk}/100`,
      detail: `${currency.format(client.overdueOutstanding)} vencidos; comprobante más antiguo de ${client.oldestOverdueDays} días.`,
      date: null,
      severity: 'critical',
      amount: client.overdueOutstanding,
    }));
  }
  if (isCommercialOpportunityEligible(client) && client.commercialOpportunity >= 58) {
    values.push(signal({
      id: `commercial-opportunity:${client.id}`,
      kind: 'commercial_opportunity',
      source: 'system',
      label: `Oportunidad comercial ${client.commercialOpportunity}/100`,
      detail: 'La ficha reúne faltantes del mix, adopción entre comparables y sustitutos disponibles.',
      date: null,
      severity: 'information',
    }));
  }
  if (client.nextVisitAt <= weekEnd) {
    values.push(signal({
      id: `suggested-review:${client.id}:${client.nextVisitAt}`,
      kind: 'suggested_review',
      source: 'system',
      label: 'Revisión sugerida',
      detail: `Fecha calculada por prioridad ${client.visitPriority}/100; no representa una visita planificada.`,
      date: client.nextVisitAt,
      severity: client.visitPriority >= 80 ? 'attention' : 'information',
    }));
  }
  return values;
}

function promiseSignal(promise: PaymentPromise, weekStart: string): CommercialInboxSignal {
  const overdue = promise.dueAt < weekStart;
  return signal({
    id: `promise:${promise.id}`,
    kind: overdue ? 'promise_overdue' : 'promise_due',
    source: 'promise',
    label: overdue ? 'Promesa vencida' : 'Promesa de la semana',
    detail: `${currency.format(promise.amount)}${promise.note ? ` · ${promise.note}` : ''}`,
    date: promise.dueAt,
    severity: overdue ? 'critical' : 'attention',
    amount: promise.amount,
  });
}

function followUpSignal(workflow: ReceivableCase, weekStart: string): CommercialInboxSignal | null {
  if (!workflow.nextFollowUpAt || workflow.status === 'resolved') return null;
  const overdue = workflow.nextFollowUpAt < weekStart;
  return signal({
    id: `receivable-follow-up:${workflow.clientId}:${workflow.nextFollowUpAt}`,
    kind: overdue ? 'follow_up_overdue' : 'follow_up_due',
    source: 'reminder',
    label: overdue ? 'Seguimiento de cobranza vencido' : 'Seguimiento de cobranza',
    detail: workflow.lastComment || 'Recordatorio existente en Cuentas por cobrar.',
    date: workflow.nextFollowUpAt,
    severity: overdue ? 'critical' : 'attention',
  });
}

function legacyReminderSignal(item: StoredAgendaItem, weekStart: string): CommercialInboxSignal {
  const overdue = item.scheduledFor < weekStart;
  return signal({
    id: `legacy-reminder:${item.id}`,
    kind: 'legacy_reminder',
    source: 'reminder',
    label: overdue ? 'Recordatorio anterior pendiente' : 'Recordatorio existente',
    detail: item.reason,
    date: item.scheduledFor,
    severity: overdue ? 'attention' : 'information',
  });
}

function entryForClient(
  client: Client,
  signals: CommercialInboxSignal[],
  notes: CommercialActivity[],
): CommercialInboxEntry {
  const sources = new Set<CommercialInboxEntry['sources'][number]>();
  signals.forEach((item) => sources.add(item.source));
  if (notes.length) sources.add('note');
  return {
    clientId: client.id,
    clientName: client.name,
    seller: client.seller,
    locality: client.locality,
    address: client.address,
    coordinates: client.coordinates,
    collectionRisk: client.collectionRisk,
    commercialOpportunity: client.commercialOpportunity,
    visitPriority: client.visitPriority,
    overdueOutstanding: client.overdueOutstanding,
    sales90d: client.sales90d,
    salesDelta: client.salesDelta,
    salesBlocked: client.salesBlocked,
    portfolioStatus: client.portfolioStatus,
    sources: [...sources],
    signals,
    notes,
  };
}

export function buildCommercialInbox(
  data: DashboardData,
  date: string,
  seller: string,
  storedItems: StoredAgendaItem[],
  activities: CommercialActivity[],
  promises: PaymentPromise[],
  receivableCases: ReceivableCase[],
): CommercialInboxPayload {
  const { weekStart, weekEnd } = commercialWeek(date);
  const selectedSellers = decodeMultiFilter(seller);
  const clients = data.clients.filter((client) => client.active && matchesMultiFilter(client.seller, seller));
  const byId = new Map(clients.map((client) => [client.id, client]));
  const signalsByClient = new Map<number, CommercialInboxSignal[]>();
  const addSignal = (clientId: number, value: CommercialInboxSignal) => {
    if (!byId.has(clientId)) return;
    const values = signalsByClient.get(clientId) ?? [];
    if (!values.some((item) => item.id === value.id)) values.push(value);
    signalsByClient.set(clientId, values);
  };

  const candidateLimit = selectedSellers.length === 1 ? 24 : 36;
  const collectionCandidates = clients
    .filter(hasActionableDebt)
    .sort((left, right) => (
      Number(right.salesBlocked) - Number(left.salesBlocked)
      || right.collectionRisk - left.collectionRisk
      || right.overdueOutstanding - left.overdueOutstanding
    ));
  const commercialCandidates = clients
    .filter((client) => isCommercialOpportunityEligible(client) && (
      client.nextVisitAt <= weekEnd
      || client.commercialOpportunity >= 58
      || client.salesDelta <= -20
    ))
    .sort((left, right) => (
      right.visitPriority - left.visitPriority
      || right.commercialOpportunity - left.commercialOpportunity
      || right.sales90d - left.sales90d
    ));
  const selectedCandidates = new Map<number, Client>();
  const collectionLimit = Math.ceil(candidateLimit / 2);
  collectionCandidates.slice(0, collectionLimit).forEach((client) => selectedCandidates.set(client.id, client));
  commercialCandidates.forEach((client) => {
    if (selectedCandidates.size < candidateLimit) selectedCandidates.set(client.id, client);
  });
  for (const client of collectionCandidates) {
    if (selectedCandidates.size >= candidateLimit) break;
    selectedCandidates.set(client.id, client);
  }
  selectedCandidates.forEach((client) => systemSignals(client, weekEnd).forEach((value) => addSignal(client.id, value)));

  promises
    .filter((promise) => promise.status === 'pending' && promise.dueAt <= weekEnd && matchesMultiFilter(promise.seller, seller))
    .forEach((promise) => addSignal(promise.clientId, promiseSignal(promise, weekStart)));

  receivableCases
    .filter((workflow) => workflow.nextFollowUpAt != null && workflow.nextFollowUpAt <= weekEnd)
    .forEach((workflow) => {
      const value = followUpSignal(workflow, weekStart);
      if (value) addSignal(workflow.clientId, value);
    });

  storedItems
    .filter((item) => item.status === 'pending' && item.scheduledFor <= weekEnd && matchesMultiFilter(item.seller, seller))
    .forEach((item) => addSignal(item.clientId, legacyReminderSignal(item, weekStart)));

  const sellerActivities = activities.filter((activity) => byId.has(activity.clientId) && matchesMultiFilter(activity.seller, seller));
  const notesByClient = new Map<number, CommercialActivity[]>();
  sellerActivities.forEach((activity) => {
    if (!byId.has(activity.clientId)) return;
    const values = notesByClient.get(activity.clientId) ?? [];
    values.push(activity);
    notesByClient.set(activity.clientId, values);
  });
  const noteClientsInWeek = new Set(sellerActivities
    .filter((activity) => {
      const noteDate = operationalDate(activity.occurredAt);
      return noteDate >= weekStart && noteDate <= weekEnd;
    })
    .map((activity) => activity.clientId));

  const clientIds = new Set([...signalsByClient.keys(), ...noteClientsInWeek]);
  const entries = [...clientIds]
    .map((clientId) => {
      const client = byId.get(clientId);
      if (!client) return null;
      return entryForClient(
        client,
        (signalsByClient.get(clientId) ?? []).sort((left, right) => (
          Number(right.severity === 'critical') - Number(left.severity === 'critical')
          || (left.date ?? '').localeCompare(right.date ?? '')
        )),
        (notesByClient.get(clientId) ?? []).slice(0, 8),
      );
    })
    .filter((entry): entry is CommercialInboxEntry => entry !== null)
    .sort((left, right) => {
      return right.visitPriority - left.visitPriority
        || left.clientName.localeCompare(right.clientName, 'es');
    });

  const allSignals = entries.flatMap((entry) => entry.signals);
  const notesInWeek = sellerActivities.filter((activity) => {
    const noteDate = operationalDate(activity.occurredAt);
    return noteDate >= weekStart && noteDate <= weekEnd;
  });
  return {
    weekStart,
    weekEnd,
    seller,
    entries,
    stats: {
      clients: entries.length,
      systemSignals: allSignals.filter((item) => item.source === 'system').length,
      dueItems: allSignals.filter((item) => item.source === 'promise' || item.source === 'reminder').length,
      notes: notesInWeek.length,
    },
    definitions: {
      systemSignals: 'Señales calculadas desde GESI. Orientan la revisión y no representan trabajo planificado ni realizado.',
      dueItems: 'Promesas y recordatorios ya registrados. La bandeja sólo los reúne; se administran en su superficie de origen.',
      notes: 'Notas sobre hechos ocurridos fuera del sistema durante la semana. Guardarlas no completa ni modifica una sugerencia.',
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
        title: client.name,
        detail: `${overdue ? 'Promesa vencida' : 'Promesa para hoy'} · ${currency.format(promise.amount)} · ${client.seller}`,
        date: promise.dueAt,
        amount: promise.amount,
      };
    })
    .filter((item): item is NotificationItem => item !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
  const promisedClients = new Set(promiseItems.map((item) => item.clientId));
  const riskItems = data.clients
    .filter((client) => client.active && client.collectionRisk >= 55 && hasActionableDebt(client) && !promisedClients.has(client.id))
    .sort((left, right) => right.collectionRisk - left.collectionRisk)
    .slice(0, Math.max(0, 10 - promiseItems.length))
    .map((client): NotificationItem => ({
      id: `risk:${client.id}`,
      type: 'collection_risk',
      severity: 'critical',
      clientId: client.id,
      title: client.name,
      detail: `Riesgo de cobranza ${client.collectionRisk}/100 · ${client.oldestOverdueDays} días máx. · ${client.seller}`,
      date,
      amount: client.overdueOutstanding || null,
    }));
  return [...promiseItems, ...riskItems].slice(0, 12);
}
