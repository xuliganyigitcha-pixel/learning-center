export type User = {
  id: string;
  login: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER';
  phone?: string | null;
  mustChangePw: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
let refreshRequest: Promise<string | null> | null = null;
let accessToken: string | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { accessToken: string };
        if (typeof data.accessToken !== 'string' || !data.accessToken) {
          throw new Error('Refresh javobida access token yo‘q');
        }
        accessToken = data.accessToken;
        return data.accessToken;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (response.status === 401 && retry && path !== '/auth/login') {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed}`);
      response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
    } else if (typeof window !== 'undefined') {
      clearAuth();
      window.location.assign('/login');
    }
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message || `So‘rov bajarilmadi (${response.status})`);
  }
  return body as T;
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  localStorage.removeItem('accessToken');
  try {
    const value = localStorage.getItem('user');
    if (!value) return null;
    const user: unknown = JSON.parse(value);
    if (
      !user ||
      typeof user !== 'object' ||
      !('id' in user) ||
      typeof user.id !== 'string' ||
      !('login' in user) ||
      typeof user.login !== 'string' ||
      !('fullName' in user) ||
      typeof user.fullName !== 'string' ||
      !('role' in user) ||
      !['SUPER_ADMIN', 'ADMIN', 'TEACHER'].includes(String(user.role)) ||
      !('mustChangePw' in user) ||
      typeof user.mustChangePw !== 'boolean'
    ) {
      clearAuth();
      return null;
    }
    return user as User;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export function saveAuth(token: string, user: User) {
  accessToken = token;
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
  accessToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' }, false);
  } finally {
    clearAuth();
    window.location.assign('/login');
  }
}
