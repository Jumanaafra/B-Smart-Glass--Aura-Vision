// utils/api.ts
// -----------------------------------------------------------------------
// Centralised API helper for AuraVision frontend.
//
// Auth strategy: localStorage Token.
// The backend returns a { token } on login/register.
// We save it to localStorage and inject it into the Authorization header
// of every request automatically.
// -----------------------------------------------------------------------

/**
 * Backend base URL.
 * - In development (Vite proxy active): use '' so /api calls are same-origin.
 * - In production: set VITE_BACKEND_URL in frontend .env to your server URL.
 */
export const BACKEND_URL =
    (import.meta as any).env?.VITE_BACKEND_URL || '';

// ── localStorage helpers ──────────────────────────────────────────────────

/** Returns the currently logged-in user object from localStorage */
export const getCurrentUser = (): any | null => {
    const str = localStorage.getItem('currentUser');
    return str ? JSON.parse(str) : null;
};

/** Returns the JWT token from localStorage */
export const getToken = (): string | null => {
    return localStorage.getItem('authToken');
};

/** Sets the JWT token in localStorage */
export const setToken = (token: string): void => {
    localStorage.setItem('authToken', token);
};

/** Clears user data and token from localStorage */
export const clearLocalAuth = (): void => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    localStorage.removeItem('guideAuthToken');
    localStorage.removeItem('userAuthToken');
};

export const clearAuth = clearLocalAuth;

// ── Header builder ────────────────────────────────────────────────────────────

/**
 * Default headers for every request.
 * Automatically injects the Authorization Bearer token if it exists in localStorage.
 */
export const getHeaders = (): Record<string, string> => {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
};

// ── Core fetch wrapper ───────────────────────────────────────────────────────

/**
 * apiFetch — wraps fetch with:
 *  - Automatic base URL prepend
 *  - JSON Content-Type & Authorization headers
 */
export const apiFetch = async (
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> => {
    const url = `${BACKEND_URL}${endpoint}`;
    return fetch(url, {
        ...options,
        headers: {
            ...getHeaders(),
            ...(options.headers as Record<string, string> || {}),
        },
    });
};

// ── Auth API ─────────────────────────────────────────────────────────────────

export const authAPI = {
    /** Login — returns { token, user } in body */
    login: (email: string, password: string) =>
        apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),

    /** Register — returns { token, user } in body */
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
     * Logout — clears localStorage and calls backend.
     */
    logout: () => {
        clearLocalAuth();
        return apiFetch('/api/auth/logout', { method: 'POST' });
    },

    /**
     * Get current user (session restore on page refresh using token).
     * Returns { user } if token is valid.
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
    updateSafeZone: (userId: string, safeZone: { lat: number, lng: number, radiusInMeters: number, enabled: boolean }) =>
        apiFetch(`/api/user/${userId}/safezone`, {
            method: 'PUT',
            body: JSON.stringify({ safeZone }),
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
    updateFace: (faceId: string, name: string, imageUrl?: string | null) =>
        apiFetch(`/api/faces/${faceId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, imageBase64: imageUrl }),
        }),
    deleteFace: (faceId: string) =>
        apiFetch(`/api/faces/${faceId}`, {
            method: 'DELETE',
        }),
};

// ── AI API ───────────────────────────────────────────────────────────────────

export const aiAPI = {
    processImage: (imageBase64: string | null, prompt: string, userId: string, language: string, mode: string = 'vision') =>
        apiFetch('/api/process-image', {
            method: 'POST',
            body: JSON.stringify({ imageBase64, prompt, userId, language, mode }),
        }),
    chat: (viUserId: string, message: string) =>
        apiFetch('/api/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ viUserId, message }),
        }),
};

// ── History API ───────────────────────────────────────────────────────────────

export const historyAPI = {
    getHistory: (userId: string, page = 1, limit = 15) =>
        apiFetch(`/api/history/${userId}?page=${page}&limit=${limit}`),
};
