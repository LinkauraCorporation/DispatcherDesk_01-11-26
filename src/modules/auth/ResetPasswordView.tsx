import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, RotateCw, ArrowLeft, KeyRound } from 'lucide-react';

interface ResetPasswordViewProps {
  userEmail?: string | null;
  onSuccess: (email?: string) => void;
  onCancel: () => void;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({
  userEmail,
  onSuccess,
  onCancel,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedPassword = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    // 1. Validation: password is not empty
    if (!trimmedPassword) {
      setErrorMessage('Please enter a new password.');
      return;
    }

    // 2. Validation: minimum length policy (6+ chars as enforced by Supabase)
    if (trimmedPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    // 3. Validation: passwords match
    if (trimmedPassword !== trimmedConfirm) {
      setErrorMessage('Passwords do not match. Please ensure both fields are identical.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase is not configured. Unable to update password.');
      return;
    }

    setIsLoading(true);
    try {
      // 4. Call Supabase updateUser to update password for the recovery session
      const { data, error } = await supabase.auth.updateUser({
        password: trimmedPassword,
      });

      if (error) {
        throw error;
      }

      // 5. Successful update: Show clear success message
      setSuccessMessage('Password updated successfully. Please sign in with your new password.');

      // 6. Sign out the recovery session so user is not silently kept logged in
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.warn('Post-recovery signOut note:', signOutErr);
      }

      const updatedEmail = data.user?.email || userEmail || undefined;

      // 7. Transition user back to normal login screen after a brief confirmation moment
      setTimeout(() => {
        onSuccess(updatedEmail);
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update password. Please try again.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 mb-4">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Reset your password
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Enter your new password below.
          </p>
          {userEmail && (
            <div className="mt-2 inline-block px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-300">
              Account: <span className="text-indigo-300 font-semibold">{userEmail}</span>
            </div>
          )}
        </div>

        {/* Success Message Banner */}
        {successMessage && (
          <div
            id="password-reset-success-alert"
            className="mb-6 p-4 bg-emerald-950/50 border border-emerald-500/50 rounded-xl text-emerald-200 flex items-start gap-3 text-xs sm:text-sm animate-in fade-in duration-300"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-300">Success!</p>
              <p className="mt-0.5 text-emerald-200/90">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Error Message Banner */}
        {errorMessage && (
          <div
            id="password-reset-error-alert"
            className="mb-6 p-4 bg-rose-950/50 border border-rose-500/50 rounded-xl text-rose-200 flex items-start gap-3 text-xs sm:text-sm animate-in fade-in duration-300"
          >
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-300">Password Reset Error</p>
              <p className="mt-0.5 text-rose-200/90">{errorMessage}</p>
            </div>
          </div>
        )}

        {!successMessage && (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
            {/* New Password Input */}
            <div>
              <label className="block text-slate-300 font-medium mb-1.5" htmlFor="new-password-input">
                New Password *
              </label>
              <div className="relative">
                <input
                  id="new-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  minLength={6}
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Must be at least 6 characters long.</p>
            </div>

            {/* Confirm New Password Input */}
            <div>
              <label className="block text-slate-300 font-medium mb-1.5" htmlFor="confirm-password-input">
                Confirm New Password *
              </label>
              <div className="relative">
                <input
                  id="confirm-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              id="update-password-submit-btn"
              type="submit"
              disabled={isLoading || !newPassword || !confirmPassword}
              className="w-full mt-2 py-3 px-4 text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>

            {/* Cancel / Back to Login */}
            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer font-medium transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Cancel and return to sign in</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
