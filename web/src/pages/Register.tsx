import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function Register() {
  const { register, requiresRegistration } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{email?: string; password?: string; confirmPassword?: string}>({});

  const validateForm = () => {
    const newErrors: {email?: string; password?: string; confirmPassword?: string} = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    }

    if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters long';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      await register(email, password);
      toast.success('Registration successful!');
      navigate('/', { replace: true });
    } catch (error: any) {
      toast.error(error.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md bg-[#171717]/70 border border-white/10 backdrop-blur-sm px-4 shadow-inner rounded-3xl">
        <CardHeader>
            <div className="flex items-center justify-center gap-4 py-4">
              <img src="/logo1.png" alt="Logo" className="h-8 w-8 object-contain" />
              <img src="/text41.png" alt="AI Assistant" className="h-5 object-contain" />
            </div>
          <CardTitle className="text-white text-center text-2xl py-2">Register</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) {
                    const newErrors = {...errors};
                    delete newErrors.email;
                    setErrors(newErrors);
                  }
                }}
                placeholder="Enter your email"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/50 rounded-3xl"
                disabled={isLoading}
              />
              {errors.email && (
                <div className="text-red-400 text-xs mt-1">{errors.email}</div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) {
                    const newErrors = {...errors};
                    delete newErrors.password;
                    setErrors(newErrors);
                  }
                }}
                placeholder="Enter your password (min. 8 characters)"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/50 rounded-3xl"
                disabled={isLoading}
              />
              {errors.password && (
                <div className="text-red-400 text-xs mt-1">{errors.password}</div>
              )}
            </div>

            <div className="space-y-2 pb-4">
              <Label htmlFor="confirmPassword" className="text-white">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) {
                    const newErrors = {...errors};
                    delete newErrors.confirmPassword;
                    setErrors(newErrors);
                  }
                }}
                placeholder="Confirm your password"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/50 rounded-3xl"
                disabled={isLoading}
              />
              {errors.confirmPassword && (
                <div className="text-red-400 text-xs mt-1">{errors.confirmPassword}</div>
              )}
            </div>
            
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4"
              disabled={isLoading}
            >
              {isLoading ? 'Registering...' : 'Register'}
            </Button>
            
            <div className="text-center pt-4 border-t border-white/10 mt-4">
              <Link
                to="/login"
                className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                Already have an account? Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
