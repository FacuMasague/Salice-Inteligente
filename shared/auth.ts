export type UserRole = 'developer' | 'admin' | 'office';
export type UserStatus = 'pending' | 'active' | 'rejected' | 'disabled';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  lastLoginAt: string | null;
}

export interface UserAccessRecord {
  id: string;
  userId: string;
  occurredAt: string;
  ipAddress: string;
  userAgent: string;
}

export interface UserChangeRecord {
  id: string;
  userId: string;
  method: string;
  path: string;
  action: string;
  occurredAt: string;
}

export interface UserActivitySummary {
  user: AuthUser;
  accessCount: number;
  activeSeconds: number;
  activeSecondsToday: number;
  lastActiveAt: string | null;
  changeCount: number;
}

export interface DeveloperActivityPayload {
  generatedAt: string;
  antiAfkMinutes: number;
  users: UserActivitySummary[];
  accesses: UserAccessRecord[];
  changes: UserChangeRecord[];
}

export interface AuthSessionPayload {
  authenticated: boolean;
  user: AuthUser | null;
  csrfToken?: string;
}
