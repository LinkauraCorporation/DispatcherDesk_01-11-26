import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { AlertCircle, Mail, RotateCw, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessSignUp?: () => void;
  onSuccessSignIn?: () => void;
  initialEmail?: string;
  initialStep?: 'auth' | 'verify_email' | 'forgot_password';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccessSignUp,
  onSuccessSignIn,
  initialEmail,
  initialStep = 'auth',
}) => {
  const [step, setStep] = useState<'auth' | 'verify_email' | 'forgot_password'>(initialStep);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { refreshUserData } = useAuth();

  // Reset or initialize state whenever modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setInfoMessage(null);
      if (initialEmail) {
        setEmail(initialEmail);
      }
      if (initialStep === 'verify_email') {
        setStep('verify_email');
      } else if (!step || step === 'verify_email') {
        if (!initialStep || initialStep === 'auth') {
          setStep('auth');
        }
      }
    } else {
      setOtp('');
      setErrorMessage(null);
      setInfoMessage(null);
    }
  }, [isOpen, initialEmail, initialStep]);

  // Resend cooldown countdown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (!isSupabaseConfigured) {
      setErrorMessage(
        'Supabase is not yet configured with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Please provide credentials to authenticate.'
      );
      return;
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });
        if (error) throw error;

        // Account created in Supabase. Supabase automatically dispatches the verification OTP to user's email.
        // Transition to dedicated Email Verification screen inside the modal.
        // DO NOT close modal, DO NOT call onSuccessSignUp(), DO NOT start trial or Guide yet.
        setStep('verify_email');
        setOtp('');
        setResendCooldown(60);
        setInfoMessage(
          `An 8-digit verification code has been sent to ${email.trim()}. Enter the code below to complete your registration.`
        );
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (error) {
          // Detect unconfirmed email on sign-in and redirect smoothly to OTP verification
          if (
            error.message.toLowerCase().includes('email not confirmed') ||
            error.message.toLowerCase().includes('unconfirmed')
          ) {
            setStep('verify_email');
            setOtp('');
            setResendCooldown(60);
            setErrorMessage('Your email address is not verified yet. Please enter the verification code sent to your email.');
            try {
              await supabase.auth.resend({
                type: 'signup',
                email: email.trim(),
              });
            } catch {
              // Ignore background resend failure
            }
            return;
          }
          throw error;
        }

        // Defensive check: if session exists but email is unconfirmed
        if (data.user && data.user.email && !data.user.email_confirmed_at && !(data.user as any).confirmed_at) {
          setStep('verify_email');
          setOtp('');
          setResendCooldown(60);
          setErrorMessage('Please verify your email address to continue.');
          return;
        }

        onClose();
        await refreshUserData(data?.user);
        if (onSuccessSignIn) {
          onSuccessSignIn();
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      setErrorMessage('Please enter the 8-digit verification code sent to your email.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase is not configured.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanOtp,
        type: 'signup',
      });

      if (error) {
        if (error.message.toLowerCase().includes('expired')) {
          throw new Error('This verification code has expired. Please click "Resend Code" to receive a new one.');
        } else if (
          error.message.toLowerCase().includes('invalid') ||
          error.message.toLowerCase().includes('token')
        ) {
          throw new Error('Invalid verification code. Please check the 8-digit code and try again.');
        }
        throw error;
      }

      // 1. Establish/confirm authenticated Supabase session
      let verifiedSession = data.session;
      let verifiedUser = data.user;

      if (!verifiedSession) {
        const { data: sessionData } = await supabase.auth.getSession();
        verifiedSession = sessionData.session;
        verifiedUser = sessionData.session?.user || verifiedUser;
      }

      // 2. Authoritative check: confirm email is verified
      if (!verifiedUser || (!verifiedUser.email_confirmed_at && !(verifiedUser as any).confirmed_at)) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user && (userData.user.email_confirmed_at || (userData.user as any).confirmed_at)) {
          verifiedUser = userData.user;
        } else {
          throw new Error('Email verification could not be confirmed. Please check your OTP code and try again.');
        }
      }

      // 3. Upsert user profile
      if (verifiedUser) {
        try {
          await supabase.from('profiles').upsert({
            id: verifiedUser.id,
            full_name: fullName.trim() || null,
            preferred_timezone: 'Asia/Kolkata',
          });
        } catch (profileErr) {
          console.warn('Profile upsert note during OTP verification:', profileErr);
        }

        onClose();
        await refreshUserData(verifiedUser);
        // 4. Trigger existing organization creation & Guide flow ONLY after successful verification
        if (onSuccessSignUp) {
          onSuccessSignUp();
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setErrorMessage(null);
    setInfoMessage(null);
    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });
      if (error) {
        if (
          error.message.toLowerCase().includes('rate limit') ||
          error.message.toLowerCase().includes('too many')
        ) {
          throw new Error('Too many requests. Please wait a moment before requesting another code.');
        }
        throw error;
      }
      setInfoMessage(`A fresh verification code has been sent to ${email.trim()}.`);
      setResendCooldown(60);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend verification code';
      setErrorMessage(message);
    } finally {
      setIsResending(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your account email address.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase is not configured.');
      return;
    }

    setIsLoading(true);
    try {
      const redirectUrl =
        typeof window !== 'undefined' && window.location.origin
          ? window.location.origin
          : 'https://dispatcherdesk.online';

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });

      if (error) {
        throw error;
      }

      setInfoMessage(
        `If an account exists for ${cleanEmail}, a password reset link has been sent. Please check your inbox and click the link to set a new password.`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send password reset email';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      id="auth-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={
        step === 'forgot_password'
          ? 'Reset your password'
          : step === 'verify_email'
          ? 'Verify your email'
          : isSignUp
          ? 'Create DispatchDesk Account'
          : 'Sign in to DispatchDesk'
      }
      subtitle={
        step === 'forgot_password'
          ? 'Enter your email to receive a password recovery link'
          : step === 'verify_email'
          ? 'Enter the 8-digit one-time passcode sent to your inbox'
          : isSignUp
          ? 'Join or establish a multi-tenant dispatch organization'
          : 'Access your fleet operations workspace'
      }
      maxWidth="md"
    >
      {step === 'forgot_password' ? (
        /* Request Password Reset Email Screen */
        <form onSubmit={handleForgotPasswordSubmit} className="space-y-4 text-xs">
          {errorMessage && (
            <div
              id="forgot-password-error-alert"
              className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div
              id="forgot-password-info-alert"
              className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-emerald-300 flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{infoMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Account Email Address *
            </label>
            <input
              id="forgot-password-email-input"
              type="email"
              required
              autoFocus
              placeholder="dispatcher@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              We will send a secure password recovery link to your registered email address.
            </p>
          </div>

          <button
            id="send-recovery-link-submit-btn"
            type="submit"
            disabled={isLoading || !email.trim()}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Sending Recovery Link...</span>
              </>
            ) : (
              <span>Send Recovery Link</span>
            )}
          </button>

          <div className="pt-2 text-center text-slate-400">
            <button
              type="button"
              onClick={() => {
                setStep('auth');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 text-xs font-medium cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          </div>
        </form>
      ) : step === 'verify_email' ? (
        /* Dedicated Email OTP Verification Screen */
        <form onSubmit={handleVerifyOtp} className="space-y-4 text-xs">
          {errorMessage && (
            <div
              id="otp-error-alert"
              className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div
              id="otp-info-alert"
              className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-emerald-300 flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Email Being Verified */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="text-slate-300 font-medium truncate">{email}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep('auth');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer shrink-0"
            >
              Change
            </button>
          </div>

          {/* 8-Digit OTP Input */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              Verification Code (8-Digit OTP) *
            </label>
            <input
              id="otp-input"
              type="text"
              required
              maxLength={8}
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="12345678"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-center text-lg tracking-[0.35em] font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Verify Button */}
          <button
            id="verify-email-submit-btn"
            type="submit"
            disabled={isLoading || otp.length < 8}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying Email...</span>
              </>
            ) : (
              <span>Verify Email & Continue</span>
            )}
          </button>

          {/* Resend OTP & Cooldown Controls */}
          <div className="pt-2 flex items-center justify-between text-slate-400 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setStep('auth');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Back to Sign In</span>
            </button>

            <button
              id="resend-otp-btn"
              type="button"
              disabled={resendCooldown > 0 || isResending}
              onClick={handleResendOtp}
              className="text-indigo-400 hover:text-indigo-300 disabled:text-slate-600 disabled:cursor-not-allowed font-medium cursor-pointer"
            >
              {isResending
                ? 'Sending code...'
                : resendCooldown > 0
                ? `Resend code (${resendCooldown}s)`
                : 'Resend Code'}
            </button>
          </div>
        </form>
      ) : (
        /* Standard Credentials Form */
        <form onSubmit={handleAuthSubmit} className="space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isSignUp && (
            <div>
              <label className="block text-slate-300 font-medium mb-1">Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-medium mb-1">Email Address *</label>
            <input
              type="email"
              required
              placeholder="dispatcher@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-300 font-medium">Password *</label>
              {!isSignUp && (
                <button
                  type="button"
                  id="forgot-password-link-btn"
                  onClick={() => {
                    setStep('forgot_password');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>

          <div className="pt-2 text-center text-slate-400">
            {isSignUp ? (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                >
                  Sign in
                </button>
              </p>
            ) : (
              <p>
                Need a new workspace?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                >
                  Create an account
                </button>
              </p>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
};
