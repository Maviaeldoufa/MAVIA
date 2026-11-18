import type { User } from '../types';

const TOKEN_KEY = 'mafia_auth_token';
const CACHED_USER_KEY = 'mvia_cached_user';

export const SESSION_PERSISTENCE_CONFIG = {
  persistSession: true,
  autoRefreshToken: true,
  storageKey: TOKEN_KEY,
  cachedUserKey: CACHED_USER_KEY,
} as const;

export class ApiError extends Error {
  public readonly status: number;
  public readonly suspended?: boolean;
  public readonly maintenance?: boolean;

  constructor(
    message: string,
    status: number,
    options?: { suspended?: boolean; maintenance?: boolean }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.suspended = options?.suspended;
    this.maintenance = options?.maintenance;
  }
}

export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  return raw.replace(/\/+$/, '');
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getApiBaseUrl();
  if (!base) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${normalizedPath}`;
}

export function resolveWsUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (base) {
    const parsed = new URL(base);
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${parsed.host}${normalizedPath}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${normalizedPath}`;
}

export function getStoredToken(): string | null {
  try {
    if (!SESSION_PERSISTENCE_CONFIG.persistSession) return null;
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (!SESSION_PERSISTENCE_CONFIG.persistSession) return;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage quota / restricted mode errors
  }
}

export function getCachedUser(): User | null {
  try {
    if (!SESSION_PERSISTENCE_CONFIG.persistSession) return null;
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (!parsed || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedUser(user: User | null): void {
  try {
    if (!SESSION_PERSISTENCE_CONFIG.persistSession) return;
    if (user) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CACHED_USER_KEY);
    }
  } catch {
    // Ignore storage quota / restricted mode errors
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(resolveApiUrl(url), {
      ...options,
      credentials: options.credentials || 'include',
      cache: options.cache || 'no-store',
      headers,
    });
  } catch {
    throw new ApiError(
      'تعذر الاتصال بالخادم. تأكد من أن الخادم (Backend) يعمل وأن رابط API مهيأ بشكل صحيح.',
      0
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  const data = (isJson ? await response.json().catch(() => ({})) : {}) as T & {
    error?: string;
    suspended?: boolean;
    maintenance?: boolean;
  };

  if (!response.ok) {
    if (response.status === 503 && data.maintenance) {
      window.dispatchEvent(
        new CustomEvent('mvia:maintenance', {
          detail:
            data.error ||
            'المنصة في وضع الصيانة حالياً لإجراء تحديثات. سنعود قريباً.',
        })
      );
    }
    if (
      response.status === 401 &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/register') &&
      !url.includes('/auth/me')
    ) {
      setStoredToken(null);
      setCachedUser(null);
      window.dispatchEvent(new CustomEvent('mvia:unauthorized'));
    }
    if (response.status === 403 && data.suspended && !url.includes('/auth/login')) {
      setStoredToken(null);
      setCachedUser(null);
      window.dispatchEvent(
        new CustomEvent('mvia:suspended', {
          detail:
            data.error ||
            'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام، ولا يمكن الدخول إلا بإذن الأدمن.',
        })
      );
    }
    if (!isJson && (response.status === 404 || response.status === 405)) {
      throw new ApiError(
        'خادم الـ API غير متاح على هذا الرابط (Backend غير منشور أو VITE_API_URL غير مضبوط).',
        response.status
      );
    }
    throw new ApiError(
      data.error || 'حدث خطأ في الاتصال بالخادم.',
      response.status,
      {
        suspended: Boolean(data.suspended),
        maintenance: Boolean(data.maintenance),
      }
    );
  }

  return data;
}

export function hasRegisteredBefore() {
  return false;
}

export function clearAuthHistory(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('last_identifier');
    localStorage.removeItem('has_registered_before');
  }
}

export function getLastIdentifier(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('last_identifier') || '';
  }
  return '';
}

