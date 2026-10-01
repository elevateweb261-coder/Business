'use strict';
// Comunicarea cu serverul. Toate cererile trimit antetul X-Metamorf (protecție CSRF) și cookie-ul de sesiune.

class ApiError extends Error {
  constructor(status, error = {}) {
    super(error.message || (status === 0
      ? 'Nu se poate contacta serverul. Verifică dacă rulează și încearcă din nou.'
      : 'A apărut o eroare. Încearcă din nou.'));
    this.status = status;
    this.code = error.code || (status === 0 ? 'network' : 'error');
    this.fields = error.fields || {};
  }
}

const API = {
  async request(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: { 'X-Metamorf': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0);
    }
    let data = null;
    try { data = await res.json(); } catch { /* răspuns gol */ }
    if (!res.ok) {
      const err = new ApiError(res.status, data?.error);
      // Sesiunea a expirat în timpul folosirii: revenim la ecranul de conectare.
      if (res.status === 401 && session.mode === 'account' && !path.startsWith('/api/auth/')) onSessionExpired();
      throw err;
    }
    return data;
  },
  get: path => API.request('GET', path),
  post: (path, body = {}) => API.request('POST', path, body),
  put: (path, body) => API.request('PUT', path, body),
  patch: (path, body) => API.request('PATCH', path, body),
  del: (path, body) => API.request('DELETE', path, body),
};
