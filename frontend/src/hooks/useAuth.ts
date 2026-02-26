import { create } from 'zustand';
import axios from 'axios';

interface User {
  id: number;
  email: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  checkAuthStatus: () => Promise<boolean>;
}

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

// Create Axios instance specifically for authentication endpoints
const authAxios = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Essential for cookie-based authentication
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add 401 interceptor for authentication endpoints only
authAxios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      console.log('🔐 401 detected in auth request, attempting token refresh...');
      
      try {
        // Attempt to refresh the access token
        const refreshResponse = await axios.post(
          `${API_BASE_URL}/api/auth/refresh`,
          {},
          { 
            withCredentials: true,
            timeout: 10000 // Shorter timeout for refresh
          }
        );
        
        if (refreshResponse.status === 200) {
          console.log('✅ Token refreshed successfully');
          
          // Retry the original request with fresh token
          return authAxios(originalRequest);
        } else {
          // Refresh failed with non-200 status
          console.warn('⚠️ Token refresh failed with status:', refreshResponse.status);
          throw new Error('Token refresh failed');
        }
      } catch (refreshError) {
        console.error('❌ Token refresh error:', refreshError);
        
        // Trigger logout
        useAuth.getState().logout();
        
        // Re-throw with consistent error message
        return Promise.reject(new Error('Authentication failed. Please login again.'));
      }
    }
    
    return Promise.reject(error);
  }
);

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,

  login: async (email, password) => {
    const { data } = await authAxios.post('/api/auth/login', { email, password });
    set({ user: data.user, isAuthenticated: true });
    startRefreshTimer();
  },

  logout: async () => {
    await authAxios.post('/api/auth/logout', {});
    set({ user: null, isAuthenticated: false });
    stopRefreshTimer();
  },

  refreshAccessToken: async () => {
    try {
      await authAxios.post('/api/auth/refresh', {});
      set({ isAuthenticated: true });
      startRefreshTimer();
    } catch {
      get().logout();
    }
  },

  checkAuthStatus: async () => {
    try {
      // First check if any user exists in the system
      const statusResponse = await authAxios.get('/api/auth/status');
      
      if (!statusResponse.data.hasUser) {
        set({ user: null, isAuthenticated: false });
        return false;
      }
      
      // Try silent token refresh first
      try {
        await authAxios.post('/api/auth/refresh', {});
        
        // If refresh succeeded, get user info
        const { data } = await authAxios.get('/api/auth/me');
        
        set({ user: data, isAuthenticated: true });
        startRefreshTimer();
        return true;
      } catch (refreshError) {
        // Refresh failed, check if we can still get user info
        try {
          const { data } = await authAxios.get('/api/auth/me');
          set({ user: data, isAuthenticated: true });
          startRefreshTimer();
          return true;
        } catch {
          // Both refresh and user info failed
          set({ user: null, isAuthenticated: false });
          return false;
        }
      }
    } catch {
      set({ user: null, isAuthenticated: false });
      return false;
    }
  },
}));

// Auto-refresh at 50 minutes (10 minutes before 60-minute expiry)
let timer: NodeJS.Timeout;
function startRefreshTimer() {
  stopRefreshTimer();
  timer = setTimeout(() => useAuth.getState().refreshAccessToken(), 50 * 60 * 1000);
}
function stopRefreshTimer() {
  if (timer) clearTimeout(timer);
}