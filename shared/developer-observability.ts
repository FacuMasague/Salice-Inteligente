export type DeveloperAlertSeverity = 'warning' | 'error' | 'critical';
export type DeveloperAlertDelivery = 'sent' | 'failed' | 'not_configured' | 'deduplicated';

export interface DeveloperAlertRecord {
  id: string;
  kind: string;
  severity: DeveloperAlertSeverity;
  title: string;
  detail: string;
  source: string;
  delivery: DeveloperAlertDelivery;
  occurredAt: string;
  sentAt: string | null;
  deliveryError: string | null;
}

export interface DeveloperAlertStatus {
  configured: boolean;
  recipient: string;
  recent: DeveloperAlertRecord[];
}
