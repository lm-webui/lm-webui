import { useEffect, useState, useRef } from 'react';
import { Loader2, ServerCrash, CheckCircle2, Cpu } from 'lucide-react';

interface HealthStatus {
  status: string;
  message: string;
  progress: number;
  ready: boolean;
  error?: string;
}

export function StartupGuard({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const retriesRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    const pollHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error("Backend unreachable");
        
        const data = await res.json();
        if (mounted) {
          retriesRef.current = 0;
          setHealth(data);
          if (!data.ready) setTimeout(pollHealth, 2000);
        }
      } catch (err) {
        if (mounted) {
          retriesRef.current++;
          const delay = Math.min(1000 * retriesRef.current, 5000);
          setHealth(prev => prev ? { ...prev, message: "Connecting to server..." } : null);
          setTimeout(pollHealth, delay);
        }
      }
    };
    pollHealth();
    return () => { mounted = false; };
  }, []);

  // If Ready, Render App
  if (health?.ready) return <>{children}</>;

  // Loading / Error State
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-neutral-900 text-white/90 font-inter">
      <div className="w-full max-w-2xl p-12 space-y-8 bg-neutral-950/50 backdrop-blur rounded-none border border-stone-800/50 shadow-xl">
        
        {/* Logo Area */}
        <div className="flex justify-center mb-6 gap-8 ml-6 mr-6">
           <img src="/logo1.png" width={50} height={50} alt="LM-WebUI Logo"/>
            <img src="/text41.png" height={10} width={290} alt="LM-WebUI"/>
        </div>

        {/* Status Icon */}
        <div className="flex justify-center">
          {health?.status === 'error' ? (
            <ServerCrash className="w-16 h-16 text-red-500/70" />
          ) : (
            <Loader2 className="w-16 h-16 text-amber-600 animate-spin" />
          )}
        </div>

        {/* Text Status */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight animate-pulse">
            {health?.status === 'error' ? 'System Failure' : 'Initializing System'}
          </h2>
          <p className="text-gray-400 text-sm font-mono h-6">
            {health?.message || "Waiting for connection..."}
          </p>
        </div>

        {/* Progress Bar */}
        {health?.status !== 'error' && (
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-amber-600 h-full transition-all duration-700 ease-out"
              style={{ width: `${health?.progress || 5}%` }}
            />
          </div>
        )}

        {/* Error Details */}
        {health?.status === 'error' && (
          <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-lg">
            <code className="text-xs text-red-200 break-all">
              Error: {health.error}
            </code>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 w-full py-2 bg-red-600/90 hover:bg-red-700 rounded-md text-sm font-medium transition"
            >
              Restart Service
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
