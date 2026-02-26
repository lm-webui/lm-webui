import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

interface User {
  id: number;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requiresRegistration: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

// Create Axios instance for authentication endpoints
const authAxios = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Essential for cookie-based authentication
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresRegistration, setRequiresRegistration] = useState(false);

  // Cookies are handled automatically by the browser/backend
  const isAuthenticated = !!user;

  // Auto-refresh timer
  let refreshTimer: NodeJS.Timeout;

  const startRefreshTimer = () => {
    stopRefreshTimer();
    // Refresh at 12 minutes (access token is 15 minutes)
    refreshTimer = setTimeout(() => {
      refreshAccessToken();
    }, 12 * 60 * 1000);
  };

  const stopRefreshTimer = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
  };

  // Helper to clear temporary local storage data and persisted stores
  const clearTempStorage = () => {
    try {
      // Clear main sessions list
      localStorage.removeItem('tempSessions');
      
      // Clear all temp message keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tempMessages_')) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear old data exists from previous versions
      localStorage.removeItem('chat-storage');
      localStorage.removeItem('context-storage');
      
      // Clear any other potential persistence keys (except UI preferences)
      localStorage.removeItem('auth-storage'); // If exists
      localStorage.removeItem('reasoning-storage'); // If exists
      
      // Clear sessionStorage for draft messages (temporary storage)
      sessionStorage.clear();
      
      console.log('Cleared all temporary storage data (preserved UI preferences)');
    } catch (e) {
      console.error('Failed to clear temp storage:', e);
    }
  };

  // Check if registration is required (no users exist)
  const checkRegistrationRequired = async () => {
    try {
      const response = await authAxios.get('/api/auth/status');
      setRequiresRegistration(!response.data.hasUser);
    } catch (error) {
      console.error('Failed to check registration status:', error);
    }
  };

  const fetchUser = async () => {
    try {
      const response = await authAxios.get('/api/auth/me');
      setUser(response.data);
      startRefreshTimer();
      return true;
    } catch {
      return false;
    }
  };

  const refreshAccessToken = async () => {
    try {
      await authAxios.post('/api/auth/refresh', {});
      // After refresh, ensure we have the latest user data and timers set
      await fetchUser();
    } catch (error: any) {
      setUser(null);
      stopRefreshTimer();
      throw error;
    }
  };

  // Clean up storage on app initialization based on authentication state
  const cleanupStorageOnInit = async () => {
    try {
      // Simple check for authentication without side effects
      const checkAuthWithoutSideEffects = async (): Promise<boolean> => {
        try {
          await authAxios.get('/api/auth/me');
          return true;
        } catch {
          return false;
        }
      };
      
      const hasValidAuth = await checkAuthWithoutSideEffects();
      
      if (!hasValidAuth) {
        // User is not authenticated - clear all temporary and persisted storage
        console.log('User not authenticated, clearing all storage data');
        clearTempStorage();
        
        // Also clear any auth-related storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      } else {
        // User is authenticated
        console.log('User authenticated, performing storage cleanup');
        
        clearTempStorage();
        
        console.log('Cleared all storage for authenticated user (backend is source of truth)');
      }
      
      console.log('Storage cleanup completed on app initialization');
    } catch (error) {
      console.error('Storage cleanup failed:', error);
    }
  };

  // Initialize auth state on app load
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        // Step 1: Clean up storage based on authentication state
        await cleanupStorageOnInit();
        
        // Step 2: Check if registration is required
        await checkRegistrationRequired();

        // Step 3: Try to get user with existing access token
        const success = await fetchUser();
        
        if (!success) {
          // If failed, try to refresh
          try {
             await refreshAccessToken();
          } catch {
             // If refresh fails, we are logged out
             if (isMounted) setUser(null);
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      stopRefreshTimer();
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await authAxios.post('/api/auth/login', { email, password });
      setUser(response.data.user);
      startRefreshTimer();
      clearTempStorage(); // Clear temp storage on successful login
    } catch (error: any) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authAxios.post('/api/auth/logout', {});
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      stopRefreshTimer();
      // Clear local storage for chat persistence
      localStorage.removeItem('chat-storage');
      clearTempStorage(); // Ensure temp storage is cleared on logout too
    }
  };

  const register = async (email: string, password: string) => {
    try {
      const response = await authAxios.post('/api/auth/register', { email, password });
      setUser(response.data.user);
      startRefreshTimer();
      clearTempStorage(); // Clear temp storage on successful registration
    } catch (error: any) {
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    requiresRegistration,
    login,
    register,
    logout,
    refreshAccessToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
