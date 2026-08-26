import { describe, expect, it } from 'vitest';
import {
  automaticRefreshAttempt,
  automaticRefreshTrigger,
  isRefreshTimeoutMessage,
} from './refresh-retry.js';

describe('reintentos de actualización automática', () => {
  it('identifica timeouts sin confundir fallas funcionales', () => {
    expect(isRefreshTimeoutMessage('DOMException [TimeoutError]: The operation was aborted due to timeout')).toBe(true);
    expect(isRefreshTimeoutMessage('connect ETIMEDOUT 10.0.0.1')).toBe(true);
    expect(isRefreshTimeoutMessage('La auditoría comercial detectó una diferencia')).toBe(false);
  });

  it('representa hasta tres intentos sin perder el origen automático', () => {
    expect(automaticRefreshTrigger('scheduled', 1)).toBe('scheduled');
    expect(automaticRefreshTrigger('scheduled', 2)).toBe('scheduled-retry-2');
    expect(automaticRefreshTrigger('bootstrap', 3)).toBe('bootstrap-retry-3');
    expect(automaticRefreshAttempt('scheduled-retry-2')).toEqual({ base: 'scheduled', attempt: 2 });
    expect(automaticRefreshAttempt('manual')).toBeNull();
  });
});
