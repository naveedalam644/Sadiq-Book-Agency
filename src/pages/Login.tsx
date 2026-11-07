import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
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
    import.meta.env.VITE_BUSINESS_NAME || 'Sadiq Book Agency';

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
      success('Logged in successfully. Welcome to Sadiq Book Agency.', 'Authentication Successful');
      navigate(from, { replace: true });
    } catch (err: any) {
      // Error message is stored in auth context or returned in error
      setFormError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071F49] via-[#0A255B] to-[#04122C] flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md mx-auto text-center">
        {/* Brand Icon & Heading */}
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-2xl bg-white p-2 shadow-2xl ring-4 ring-[#F5B51B]/40 flex items-center justify-center">
            <img
              src="/images/sadiq-book-agency-logo.png"
              alt="Sadiq Book Agency Logo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white px-2">
          {businessName}
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[#F5B51B] font-semibold tracking-wide px-2">
          Notebooks • Registers • Stationery
        </p>
        <p className="text-xs text-slate-300 mt-0.5 px-2">
          Admin Accounting & Management Portal
        </p>
      </div>

      <div className="mt-6 sm:mt-8 w-full max-w-md mx-auto">
        <div className="bg-white py-6 sm:py-8 px-4 sm:px-10 shadow-2xl rounded-2xl border-t-4 border-[#F5B51B]">
          {/* Header pill */}
          <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-[#071F49]">Sign In to Portal</h2>
              <p className="text-xs text-slate-500">Secure Store Administrator Access</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#071F49] bg-[#F5B51B]/20 px-2.5 py-1 rounded-full border border-[#F5B51B]/50">
              <ShieldCheck className="w-3.5 h-3.5 text-[#071F49]" />
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
                placeholder="admin@sadiqbookagency.com"
                leftIcon={<Mail className="w-4 h-4 text-slate-400" />}
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
                leftIcon={<Lock className="w-4 h-4 text-slate-400" />}
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

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <label className="flex items-start sm:items-center cursor-pointer select-none min-w-0">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-[#071F49] focus:ring-[#F5B51B] border-slate-300 transition shrink-0 mt-0.5 sm:mt-0"
                  disabled={isSubmitting}
                />
                <span className="ml-2 text-xs font-medium text-slate-600 leading-snug">
                  Remember this workstation
                </span>
              </label>

              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium shrink-0 pl-6 sm:pl-0">
                <Server className="w-3 h-3 text-[#071F49]" />
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
                className="bg-[#071F49] hover:bg-[#0A255B] text-white font-bold shadow-md shadow-[#071F49]/20"
                leftIcon={<ShieldCheck className="w-4 h-4 text-[#F5B51B]" />}
              >
                Sign In to Admin Portal
              </Button>
            </div>
          </form>

          {/* Security Notice - Strict No Public Registration */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-start gap-2.5 text-slate-500 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/60">
              <HelpCircle className="w-4 h-4 text-[#071F49] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800 block">Restricted Store Access</span>
                Public customer self-registration is disabled. Store operator and cashier credentials are provisioned via Firebase console.
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-6 text-center text-xs text-slate-400 font-medium px-2 leading-relaxed">
          Sadiq Book Agency • Notebooks • Registers • Stationery
        </p>
      </div>
    </div>
  );
};
