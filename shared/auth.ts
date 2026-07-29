export type UserRole = 'admin' | 'office';
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

export interface AuthSessionPayload {
  authenticated: boolean;
  user: AuthUser | null;
  csrfToken?: string;
}
