import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  HelpCircle,
  Server,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { AlertBanner } from '../components/feedback/AlertBanner';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, error: authError, clearError, isFirebaseReady } = useAuth();
  const { success } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const businessName =
    import.meta.env.VITE_BUSINESS_NAME || 'Bookstore & Stationers';
  const appName =
    import.meta.env.VITE_APP_NAME || 'Bookstore Management System';

  // Target destination after successful login
  const from = (location.state as any)?.from?.pathname || '/';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setFormError(null);

    // Form validation
    if (!email.trim()) {
      setFormError('Please enter your administrator email address.');
      return;
    }
    if (!password) {
      setFormError('Please enter your administrator password.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login({ email: email.trim(), password, rememberMe });
      success('Logged in successfully. Welcome to Bookstore Management.', 'Authentication Successful');
      navigate(from, { replace: true });
    } catch (err: any) {
      // Error message is stored in auth context or returned in error
      setFormError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Icon & Heading */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-xl shadow-brand-600/30 ring-4 ring-brand-500/20">
            <BookOpen className="w-8 h-8" />
          </div>
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-white">
          {businessName}
        </h1>
        <p className="mt-1 text-center text-xs sm:text-sm text-slate-400">
          {appName} — Admin Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-5 sm:px-10 shadow-2xl rounded-2xl border border-slate-100">
          {/* Header pill */}
          <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Sign In to Dashboard</h2>
              <p className="text-xs text-slate-500">Phase 1 Secure Admin Access</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Protected
            </span>
          </div>

          {/* Configuration Alert if Firebase is not yet hooked up */}
          {!isFirebaseReady && (
            <div className="mb-5">
              <AlertBanner
                variant="warning"
                title="Firebase Setup Required"
                message={
                  <div className="space-y-1">
                    <p>Firebase environment variables are not yet configured in <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">.env</code>.</p>
                    <p className="text-[11px] text-amber-800">
                      Copy <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">.env.example</code> to <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">.env</code> and add your Firebase credentials. See <span className="font-semibold">FIREBASE_SETUP.md</span>.
                    </p>
                  </div>
                }
              />
            </div>
          )}

          {/* Error Message */}
          {(formError || authError) && (
            <div className="mb-5">
              <AlertBanner
                variant="error"
                title="Authentication Notice"
                message={formError || authError}
                onDismiss={() => {
                  setFormError(null);
                  clearError();
                }}
              />
            </div>
          )}

          {/* Login Form */}
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <Input
                label="Administrator Email"
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@bookstore.com"
                leftIcon={<Mail className="w-4 h-4" />}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <Input
                label="Administrator Password"
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                }
                disabled={isSubmitting}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 transition"
                  disabled={isSubmitting}
                />
                <span className="ml-2 text-xs text-slate-600">Remember this device</span>
              </label>

              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Server className="w-3 h-3" />
                Persistent session
              </span>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                fullWidth
                isLoading={isSubmitting}
                leftIcon={<ShieldCheck className="w-4 h-4" />}
              >
                Sign In to Admin Portal
              </Button>
            </div>
          </form>

          {/* Security Notice - Strict No Public Registration */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-start gap-2.5 text-slate-500 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200/60">
              <HelpCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-700 block">Strict Access Policy</span>
                Public customer registration is intentionally disabled. Admin accounts are provisioned via Firebase Console or system admin.
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Bookstore & Stationers Management System • Phase 1 Release
        </p>
      </div>
    </div>
  );
};
