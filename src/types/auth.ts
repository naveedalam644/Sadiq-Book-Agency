export type UserRole = 'admin' | 'manager' | 'operator';

export interface AdminUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface AuthState {
  user: AdminUserProfile | null;
  firebaseUser: any | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}
