import type { User, TokenScope } from 'zur-shared';

export interface ConnectionTokenItem {
  id: string;
  tokenIdentifier: string;
  label: string;
  scopes: TokenScope[];
  courseRestrictions: string[] | null;
  expiresAt: string;
  isRevoked: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
  status: 'never_used' | 'active' | 'expired' | 'revoked';
}

export interface AuthorCourseOption {
  id: string;
  title: string;
}

export interface RevealedTokenData {
  id: string;
  rawToken: string;
  label: string;
  scopes: TokenScope[];
  courseRestrictions: string[] | null;
  expiresAt: string;
}

export interface AiConnectionsPageOptions {
  user: User;
  tokens?: ConnectionTokenItem[];
  courses?: AuthorCourseOption[];
  activeFilter?: 'all' | 'active' | 'expired' | 'revoked';
  showCreateModal?: boolean;
  replacingToken?: ConnectionTokenItem;
  revealedToken?: RevealedTokenData;
  revokingToken?: ConnectionTokenItem;
  error?: string;
  successMessage?: string;
  isLoading?: boolean;
}
