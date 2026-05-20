// src/pages/Auth.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Package, Mail, Lock, Building2, Phone, Eye, EyeOff, Loader2 } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  companyName: z.string().min(1, 'Company name is required').max(100),
  contactNo: z.string().optional(),
  gstNumber: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    contactNo: '',
    gstNumber: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset-password modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const navigate = useNavigate();
  const { user } = useAuth();
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const resetEmailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  // Dev-aware server-side check helper:
  // In dev it calls local server (http://localhost:3000/check-user).
  // In production it will call the same-origin /check-user or /api/check-user once you deploy a function.
  const checkUserExistsServer = async (email: string): Promise<boolean | null> => {
    try {
      const base = import.meta.env.DEV ? 'http://localhost:3000' : '';
      const url = `${base}/check-user?email=${encodeURIComponent(email)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return !!json.exists;
    } catch (err) {
      // endpoint missing/unreachable -> return null so signup proceeds and Supabase returns the truth
      return null;
    }
  };

  const handleSignupClient = async (email: string, password: string) => {
    // client-side signup using anon/publishable key
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          company_name: formData.companyName,
          contact_no: formData.contactNo,
          gst_number: formData.gstNumber || null,
        },
      },
    });

    return { data, error };
  };

  // Open reset modal (prefill email if available)
  const handleForgotPassword = async () => {
    setResetEmail(formData.email || '');
    setResetModalOpen(true);
    // focus will be applied on modal open via effect below
  };

  // Focus reset email field when modal opens
  useEffect(() => {
    if (resetModalOpen) {
      setTimeout(() => {
        resetEmailRef.current?.focus();
      }, 120); // allow animation to start
    }
  }, [resetModalOpen]);

  const submitResetPassword = async () => {
    if (!resetEmail) {
      toast({ title: 'Error', description: 'Email is required', variant: 'destructive' });
      return;
    }

    try {
      setResetLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        toast({ title: 'Error', description: error.message || 'Unable to send reset email', variant: 'destructive' });
        return;
      }

      toast({
        title: 'Password Reset',
        description: 'Reset link sent — check your email. You can now sign in after resetting.',
      });

      // Close modal, switch to sign-in view and prefill email
      setResetModalOpen(false);
      setIsLogin(true);
      setFormData(prev => ({ ...prev, email: resetEmail }));
      // small delay then focus the email input in the main form
      setTimeout(() => emailInputRef.current?.focus(), 120);
    } catch (err: any) {
      console.error('Forgot password error', err);
      toast({ title: 'Error', description: err.message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      if (isLogin) {
        const validation = loginSchema.safeParse(formData);
        if (!validation.success) {
          const fieldErrors: Record<string, string> = {};
          validation.error.errors.forEach(err => {
            if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
          });
          setErrors(fieldErrors);
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) {
          const message = (error.message || '').toLowerCase();
          if (message.includes('invalid') || message.includes('credentials')) {
            toast({ title: 'Login Failed', description: 'Invalid email or password', variant: 'destructive' });
          } else {
            toast({ title: 'Login Failed', description: error.message, variant: 'destructive' });
          }
        } else {
          toast({ title: 'Welcome back!', description: 'Successfully logged in' });
          navigate('/dashboard');
        }
      } else {
        const validation = registerSchema.safeParse(formData);
        if (!validation.success) {
          const fieldErrors: Record<string, string> = {};
          validation.error.errors.forEach(err => {
            if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
          });
          setErrors(fieldErrors);
          setLoading(false);
          return;
        }

        // server-side pre-check (DEV local endpoint or deployed)
        const existsServer = await checkUserExistsServer(formData.email);
        if (existsServer === true) {
          toast({
            title: 'Registration Failed',
            description: 'An account with this email already exists. Please sign in or reset your password.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        const { data, error } = await handleSignupClient(formData.email, formData.password);

        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('already') || msg.includes('registered') || msg.includes('duplicate')) {
            toast({
              title: 'Registration Failed',
              description: 'An account with this email already exists. Please sign in or reset your password.',
              variant: 'destructive',
            });
          } else {
            toast({ title: 'Registration Failed', description: error.message || 'Unable to register', variant: 'destructive' });
          }
          setLoading(false);
          return;
        }

        toast({ title: 'Account Created!', description: 'Welcome to StockFlow — check your email if verification is required.' });
        navigate('/dashboard');
      }
    } catch (err: any) {
      console.error('Auth error', err);
      toast({ title: 'Error', description: err.message || 'An unexpected error occurred', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent/5 via-transparent to-transparent" />

      <Card className="w-full max-w-md relative animate-slide-up glass-card">
        <CardHeader className="text-center pb-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
              <Package className="w-8 h-8" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? 'Sign in to manage your inventory and billing'
              : 'Start managing your stock with StockFlow'
            }
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="companyName"
                      name="companyName"
                      placeholder="Your Company"
                      value={formData.companyName}
                      onChange={handleChange}
                      className="pl-10 input-focus"
                    />
                  </div>
                  {errors.companyName && <p className="text-sm text-destructive">{errors.companyName}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactNo">Phone Number (Optional)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="contactNo"
                      name="contactNo"
                      placeholder="+91 90000 00000"
                      value={formData.contactNo}
                      onChange={handleChange}
                      className="pl-10 input-focus"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstNumber">GST Number (Optional)</Label>
                  <Input
                    id="gstNumber"
                    name="gstNumber"
                    placeholder="27ABCDE1234F1Z5"
                    value={formData.gstNumber}
                    onChange={handleChange}
                    className="input-focus"
                  />
                </div>
              </>
            )}
            

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  value={formData.email}
                  onChange={handleChange}
                  className="pl-10 input-focus"
                  ref={emailInputRef}
                />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  className="pl-10 pr-10 input-focus"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            {/* Forgot password - visible only on login */}
            {isLogin && (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-accent hover:underline"
                  disabled={loading}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="pl-10 input-focus"
                  />
                </div>
                {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
              </div>
            )}

            <Button type="submit" className="w-full btn-accent h-11" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setErrors({});
              }}
              className="text-sm text-muted-foreground hover:text-accent transition-colors"
            >
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <span className="font-medium text-accent">
                {isLogin ? 'Sign up' : 'Sign in'}
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Reset Password Modal (glass style + slide up + subtle animation) */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          {/* overlay */}
          <div
            onClick={() => setResetModalOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          />

          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm animate-slide-up"
            style={{ zIndex: 60 }}
          >
            <div className="glass-card p-5 rounded-2xl shadow-xl border border-border/40 transform-gpu">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">Reset Password</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter the email address to receive a password reset link.
                  </p>
                </div>
                <div>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setResetModalOpen(false)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <Label>Email</Label>
                  <Input
                    placeholder="you@company.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    ref={resetEmailRef}
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setResetModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={submitResetPassword} disabled={resetLoading}>
                    {resetLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Send Reset Link
                  </Button>
                </div>
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                <p>
                  Tip: If you don't receive an email, check your spam folder or ensure the email address is registered.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
