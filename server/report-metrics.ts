import type { DatabaseSync } from 'node:sqlite';

export type SqlValue = string | number;
export interface MovementMetrics {
  kilos: number;
  units: number;
  netAmount: number;
  clients: number;
}

export const MOVEMENT_METRIC_SELECT = `
  COALESCE(SUM(kilos), 0) AS kilos,
  COALESCE(SUM(units), 0) AS units,
  COALESCE(SUM(net_amount), 0) AS netAmount,
  COUNT(DISTINCT client_id) AS clients
`;

export function readMovementMetrics(database: DatabaseSync, whereSql: string, parameters: SqlValue[] = []): MovementMetrics {
  const row = database.prepare(`SELECT ${MOVEMENT_METRIC_SELECT} FROM movements WHERE ${whereSql}`).get(...parameters) as Partial<MovementMetrics>;
  return {
    kilos: Number(row.kilos ?? 0),
    units: Number(row.units ?? 0),
    netAmount: Number(row.netAmount ?? 0),
    clients: Number(row.clients ?? 0),
  };
}

export function metricRatio(value: number, base: number) {
  return base ? value / base * 100 : null;
}

export function metricVariation(value: number, base: number) {
  return base ? (value - base) / base * 100 : null;
}

export function metricShare(value: number, total: number) {
  return total ? value / total * 100 : 0;
}
