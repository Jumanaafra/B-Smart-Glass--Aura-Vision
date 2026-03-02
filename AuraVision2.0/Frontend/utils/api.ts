// utils/api.ts
// -----------------------------------------------------------------------
// Centralised API helper for AuraVision frontend.
//
// Auth strategy: HTTP-only cookies (set by backend on login/register).
// The browser automatically sends the cookie with every request — no
// manual token reading needed. We only need to set credentials: 'include'.
//
// In development the Vite proxy forwards /api → localhost:5000, so the
// browser sees a same-origin request and SameSite=Lax cookies are sent.
// -----------------------------------------------------------------------

/**
 * Backend base URL.
 * - In development (Vite proxy active): use '' so /api calls are same-origin.
 * - In production: set VITE_BACKEND_URL in frontend .env to your server URL.
 */
export const BACKEND_URL =
    (import.meta as any).env?.VITE_BACKEND_URL || '';

// ── localStorage helpers (user object only — token is in cookie now) ─────────

/** Returns the currently logged-in user object from localStorage (non-sensitive UI data) */
export const getCurrentUser = (): any | null => {
    const str = localStorage.getItem('currentUser');
    return str ? JSON.parse(str) : null;
};

/** Clears user data from localStorage. Cookie is cleared via /api/auth/logout. */
export const clearLocalAuth = (): void => {
    localStorage.removeItem('currentUser');
    // Legacy keys — clear these too in case they exist from a previous session
    localStorage.removeItem('authToken');
    localStorage.removeItem('guideAuthToken');
    localStorage.removeItem('userAuthToken');
};

// ── Deprecated shim — kept so old callers compile without errors ──────────────
/** @deprecated Token is now an httpOnly cookie. This always returns null. */
export const getToken = (): string | null => null;

/** @deprecated Use clearLocalAuth() instead. This is a no-op for the token. */
export const clearAuth = clearLocalAuth;

// ── Header builder ────────────────────────────────────────────────────────────

/**
 * Default headers for every request.
 * No Authorization header needed — the browser sends the httpOnly cookie automatically.
 */
export const getHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
});

// ── Core fetch wrapper ───────────────────────────────────────────────────────

/**
 * apiFetch — wraps fetch with:
 *  - Automatic base URL prepend
 *  - credentials: 'include' → browser sends the httpOnly JWT cookie
 *  - JSON Content-Type header
 */
export const apiFetch = async (
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> => {
    const url = `${BACKEND_URL}${endpoint}`;
    return fetch(url, {
        ...options,
        credentials: 'include', // ← required to send/receive cookies cross-origin
        headers: {
            ...getHeaders(),
            ...(options.headers as Record<string, string> || {}),
        },
    });
};

// ── Auth API ─────────────────────────────────────────────────────────────────

export const authAPI = {
    /** Login — backend sets httpOnly cookie in response; body contains { user } */
    login: (email: string, password: string) =>
        apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),

    /** Register — backend sets httpOnly cookie in response; body contains { user } */
    register: (data: {
        fullName: string;
        email: string;
        password: string;
        userType: string;
        deviceId: string;
    }) =>
        apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    /**
     * Logout — calls backend to clear the httpOnly cookie.
     * Always call this; js cannot clear httpOnly cookies itself.
     */
    logout: () =>
        apiFetch('/api/auth/logout', { method: 'POST' }),

    /**
     * Get current user from existing cookie (session restore on page refresh).
     * Returns { user } if cookie is valid, or 401 if not logged in.
     */
    me: () => apiFetch('/api/auth/me'),

    forgotPassword: (email: string) =>
        apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
        }),

    changePassword: (userId: string, currentPassword: string, newPassword: string) =>
        apiFetch('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ userId, currentPassword, newPassword }),
        }),
};

// ── User API ─────────────────────────────────────────────────────────────────

export const userAPI = {
    getProfile: (userId: string) => apiFetch(`/api/user/${userId}`),
    updateSettings: (userId: string, settings: Record<string, any>) =>
        apiFetch(`/api/user/${userId}/settings`, {
            method: 'PUT',
            body: JSON.stringify({ settings }),
        }),
};

// ── Faces API ────────────────────────────────────────────────────────────────

export const facesAPI = {
    addPerson: (userId: string, name: string, imageUrl: string) =>
        apiFetch('/api/faces/add', {
            method: 'POST',
            body: JSON.stringify({ userId, name, imageBase64: imageUrl }),
        }),
    getFaces: (userId: string) => apiFetch(`/api/faces/${userId}`),
};

// ── AI API ───────────────────────────────────────────────────────────────────

export const aiAPI = {
    processImage: (imageBase64: string | null, prompt: string, userId: string, language: string, mode: string = 'vision') =>
        apiFetch('/api/process-image', {
            method: 'POST',
            body: JSON.stringify({ imageBase64, prompt, userId, language, mode }),
        }),
    chat: (message: string) =>
        apiFetch('/api/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message }),
        }),
};

// ── History API ───────────────────────────────────────────────────────────────

export const historyAPI = {
    getHistory: (userId: string, page = 1, limit = 15) =>
        apiFetch(`/api/history/${userId}?page=${page}&limit=${limit}`),
};
