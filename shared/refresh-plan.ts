export interface ManualRefreshStage {
  id: string;
  label: string;
  script: string;
  mutatesActiveData: boolean;
}

export const MANUAL_REFRESH_STAGES: ManualRefreshStage[] = [
  { id: 'capture', label: 'Captura GESI', script: 'scripts/capture-gesi.ts', mutatesActiveData: false },
  { id: 'capture-audit', label: 'Auditoría de captura', script: 'scripts/audit-gesi-capture.ts', mutatesActiveData: false },
  { id: 'sales-build', label: 'Base analítica comercial candidata', script: 'scripts/build-spt-gesi.ts', mutatesActiveData: false },
  { id: 'sales-audit', label: 'Auditoría comercial', script: 'scripts/audit-spt-gesi.ts', mutatesActiveData: false },
  { id: 'activation', label: 'Normalización del paquete candidato', script: 'scripts/sync-gesi.ts', mutatesActiveData: false },
  { id: 'snapshot-audit', label: 'Auditoría integral del snapshot', script: 'scripts/audit-data.ts', mutatesActiveData: false },
  { id: 'vector-audit', label: 'Auditoría del catálogo vectorial', script: 'scripts/audit-product-vectors.ts', mutatesActiveData: false },
  { id: 'platform-audit', label: 'Auditoría cruzada de fuentes y métricas', script: 'scripts/audit-platform.ts', mutatesActiveData: false },
];
