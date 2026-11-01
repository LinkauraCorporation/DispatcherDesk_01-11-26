import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal.tsx';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { Phone, ShieldCheck, ArrowRight, ArrowLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface DriverPhoneLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DriverPhoneLoginModal: React.FC<DriverPhoneLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { refreshUserData, claimDriverPortalByPhone } = useAuth();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setStep('phone');
      setPhone('');
      setOtpCode('');
      setErrorMessage(null);
      setLoading(false);
      setResendCooldown(0);
    }
  }, [isOpen]);

  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const cleanPhone = (val: string): string => {
    const trimmed = val.trim();
    if (!trimmed) return '';
    if (!trimmed.startsWith('+')) return trimmed;
    const digits = trimmed.substring(1).replace(/\D/g, '');
    return '+' + digits;
  };

  const validatePhone = (val: string): { valid: boolean; message?: string; canonical?: string } => {
    const trimmed = val.trim();
    if (!trimmed) {
      return { valid: false, message: 'Phone number is required' };
    }
    if (!trimmed.startsWith('+')) {
      return {
        valid: false,
        message: 'Phone number must include country code in E.164 format (e.g. +12145550199)',
      };
    }
    const digits = trimmed.substring(1).replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15 || digits.startsWith('0')) {
      return {
        valid: false,
        message: 'Please enter a valid international mobile number (7-15 digits)',
      };
    }
    return { valid: true, canonical: '+' + digits };
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const validation = validatePhone(phone);
    if (!validation.valid || !validation.canonical) {
      setErrorMessage(validation.message || 'Invalid phone number');
      return;
    }

    const canonicalPhone = validation.canonical;
    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        // Local / demo simulation
        setStep('otp');
        setResendCooldown(30);
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        phone: canonicalPhone,
      });

      if (error) {
        throw error;
      }

      setStep('otp');
      setResendCooldown(30);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Unable to send verification code. Please check the number and try again.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = validatePhone(phone);
    if (!validation.valid || !validation.canonical) {
      setErrorMessage('Invalid phone number reference. Please start over.');
      return;
    }

    const canonicalPhone = validation.canonical;
    const cleanToken = otpCode.trim();

    if (!cleanToken || cleanToken.length < 4) {
      setErrorMessage('Please enter the verification code received via SMS.');
      return;
    }

    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        // Local / demo mode simulation
        if (cleanToken !== '123456' && cleanToken.length < 4) {
          throw new Error('Invalid demo code. Enter 123456 to test.');
        }

        const demoDriver = {
          id: 'demo-driver-1',
          organization_id: 'demo-org-1',
          client_id: 'demo-client-1',
          full_name: 'Marcus Vance (Demo Driver)',
          email: 'driver.vance@demo-fleet.com',
          phone: canonicalPhone,
          license_number: 'CDL-TX-998811',
          status: 'active',
          pay_type: 'percentage_gross',
          pay_rate: 25,
          client: {
            id: 'demo-client-1',
            name: 'Apex Logistics Carrier LLC',
            status: 'active',
            organization: {
              id: 'demo-org-1',
              name: 'DispatchDesk Logistics (Demo Fleet)',
              slug: 'dispatchdesk-demo',
              dot_number: '1234567',
              mc_number: '987654',
              primary_timezone: 'America/Chicago',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        };

        localStorage.setItem('dispatchdesk_demo_active_driver', JSON.stringify(demoDriver));
        await refreshUserData();
        if (onSuccess) onSuccess();
        onClose();
        return;
      }

      // Step 1: Authoritative OTP verification
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        phone: canonicalPhone,
        token: cleanToken,
        type: 'sms',
      });

      if (verifyError || !verifyData.user) {
        throw new Error(verifyError?.message || 'Invalid or expired verification code.');
      }

      // Step 2: Atomic driver portal claim RPC
      // RPC uses auth.uid() and auth.jwt() phone claim to bind drivers.user_id
      const claimResult = await claimDriverPortalByPhone();

      if (!claimResult.success) {
        // NO-MATCH / REJECTION FLOW:
        // Safely sign the user out immediately so unlinked accounts never reach office onboarding.
        await supabase.auth.signOut();

        const errMsg = claimResult.error || '';
        if (errMsg.includes('No active driver profile found') || errMsg.includes('P0002')) {
          throw new Error(
            'No active driver profile was found for this phone number. Please contact your carrier or dispatch office to verify your mobile number.'
          );
        } else if (errMsg.includes('inactive')) {
          throw new Error(
            'Your driver profile is currently marked inactive. Please reach out to your dispatch team.'
          );
        } else if (errMsg.includes('Office team members')) {
          throw new Error(
            'This account belongs to an office team member and cannot claim a driver portal identity.'
          );
        } else if (errMsg.includes('already linked to another user') || errMsg.includes('already bound')) {
          throw new Error(
            'This driver profile is already linked to another account. Please contact dispatch support.'
          );
        } else {
          throw new Error(errMsg || 'Failed to claim driver identity.');
        }
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Verification failed. Please check the code and try again.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      id="driver-phone-login-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Driver Portal Access"
      subtitle={
        step === 'phone'
          ? 'Enter your mobile number to receive a secure one-time login code'
          : `Enter the verification code sent to ${phone}`
      }
      maxWidth="sm"
    >
      <div className="space-y-4 text-xs">
        {errorMessage && (
          <div
            id="driver-login-error"
            className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-rose-300 flex items-start gap-2 text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label htmlFor="driver-portal-phone" className="block text-slate-300 font-medium mb-1.5">
                Mobile Phone Number (E.164)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  id="driver-portal-phone"
                  type="tel"
                  placeholder="+12145550199"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono text-sm tracking-wide disabled:opacity-50"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Must include your country code starting with <span className="font-mono text-emerald-400 font-bold">+</span> (e.g.{' '}
                <span className="font-mono text-slate-300">+12145550199</span> for USA/Canada).
              </p>
            </div>

            {!isSupabaseConfigured && (
              <div className="p-2.5 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-emerald-300 text-[11px] flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Demo mode: Any valid number works. Test code is <strong>123456</strong>.</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                id="btn-cancel-driver-phone"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="btn-send-driver-otp"
                disabled={loading || !phone.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending Code...</span>
                  </>
                ) : (
                  <>
                    <span>Send Login Code</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="driver-portal-otp" className="block text-slate-300 font-medium">
                  6-Digit SMS Code
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setErrorMessage(null);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Change number</span>
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <input
                  id="driver-portal-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  disabled={loading}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono text-base tracking-widest text-center disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Didn't receive code?</span>
              {resendCooldown > 0 ? (
                <span className="text-slate-500">Resend in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  id="btn-resend-driver-otp"
                  onClick={() => handleSendOtp()}
                  disabled={loading}
                  className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                >
                  Resend SMS Code
                </button>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                id="btn-back-driver-otp"
                onClick={() => setStep('phone')}
                disabled={loading}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 font-medium transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                id="btn-verify-driver-otp"
                disabled={loading || !otpCode.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Enter Portal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
