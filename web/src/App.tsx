import { useEffect } from "react";
import "./global.css";

import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./components/ui/theme-provider";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { MultimodalProvider } from "./components/multimodal";
import { StartupGuard } from "./components/StartupGuard";

import IndexEnhanced from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/auth/ProtectedRoute";

// Wrapper component to handle WebSocket initialization
const AppContent = () => {
  const { requiresRegistration } = useAuth();

  // Initialize storage migration on app startup
  useEffect(() => {
    const migrateStorage = async () => {
      try {
        const { migrateToHybridStorage, needsStorageMigration } = await import('./utils/storageUtils');
        
        if (needsStorageMigration()) {
          console.log('🔄 Migrating storage to hybrid approach...');
          migrateToHybridStorage();
          console.log('✅ Storage migration completed');
        } else {
          console.log('✅ Storage already using hybrid approach');
        }
      } catch (error) {
        console.error('Storage migration failed:', error);
      }
    };
    
    migrateStorage();
  }, []);
  
  return (
    <Routes>
      <Route path="/login" element={
        requiresRegistration ? <Navigate to="/register" replace /> : <Login />
      } />
      <Route path="/register" element={
        requiresRegistration ? <Register /> : <Navigate to="/login" replace />
      } />
      <Route path="/" element={
        <ProtectedRoute>
          <IndexEnhanced />
        </ProtectedRoute>
      } />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <ThemeProvider defaultTheme="dark">
    <TooltipProvider>
      <Toaster />
      <Sonner />
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <AuthProvider>
        <MultimodalProvider>
          <StartupGuard>
            <AppContent />
          </StartupGuard>
        </MultimodalProvider>
      </AuthProvider>
    </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
