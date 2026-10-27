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

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { accessToken: string };
        localStorage.setItem('accessToken', data.accessToken);
        return data.accessToken;
      })
      .catch(() => null)
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);

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
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
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
  try {
    const value = localStorage.getItem('user');
    return value ? (JSON.parse(value) as User) : null;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export function saveAuth(accessToken: string, user: User) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('user', JSON.stringify(user));
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' }, false);
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    window.location.assign('/login');
  }
}
