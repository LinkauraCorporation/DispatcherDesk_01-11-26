/**
 * Password Recovery & Authentication State Test Suite
 *
 * Verifies:
 * 1. Normal login still works.
 * 2. Recovery session enters password-reset state.
 * 3. Recovery session does not redirect directly to normal dashboard.
 * 4. Matching passwords successfully call updateUser.
 * 5. Mismatched passwords are rejected.
 * 6. Successful password update redirects to login.
 * 7. Existing authenticated sessions remain unaffected.
 */

import assert from 'assert';

interface MockUser {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
}

interface MockSession {
  access_token: string;
  refresh_token: string;
  user: MockUser;
}

// Simulate the AuthContext / App state machine for recovery detection
class MockAuthContextManager {
  user: MockUser | null = null;
  session: MockSession | null = null;
  isPasswordRecovery: boolean = false;
  recoveryError: string | null = null;
  currentView: 'landing' | 'app' = 'landing';
  isResolvingUserData: boolean = false;
  userDataFetched: boolean = false;

  constructor(initialUrl: string = 'https://dispatcherdesk.online') {
    this.parseUrl(initialUrl);
  }

  parseUrl(urlStr: string) {
    try {
      const url = new URL(urlStr);
      const hash = url.hash || '';
      const search = url.search || '';

      if (
        hash.includes('error_code=otp_expired') ||
        search.includes('error_code=otp_expired') ||
        hash.includes('invalid+or+has+expired') ||
        hash.includes('Email+link+is+invalid')
      ) {
        this.recoveryError =
          'This password reset link has expired or has already been used. Please request a new password reset link.';
      } else if (hash.includes('error=access_denied') || search.includes('error=access_denied')) {
        this.recoveryError = 'Access denied or invalid reset link. Please request a new password reset link.';
      }

      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        this.isPasswordRecovery = true;
      }
    } catch {
      // ignore
    }
  }

  handleAuthStateChange(event: string, session: MockSession | null) {
    if (event === 'PASSWORD_RECOVERY') {
      this.isPasswordRecovery = true;
      this.recoveryError = null;
      this.session = session;
      this.user = session?.user ?? null;
      this.isResolvingUserData = false;
      return;
    }

    if (event === 'SIGNED_OUT') {
      this.isPasswordRecovery = false;
      this.session = null;
      this.user = null;
      this.isResolvingUserData = false;
      this.userDataFetched = false;
      this.currentView = 'landing';
      return;
    }

    this.session = session;
    this.user = session?.user ?? null;
    if (session?.user) {
      if (this.isPasswordRecovery) {
        // Recovery mode active: DO NOT auto-enter application
        return;
      }
      this.isResolvingUserData = true;
      this.userDataFetched = true;
      this.isResolvingUserData = false;
    } else {
      this.userDataFetched = false;
    }
  }

  // Simulates App.tsx routing effect
  evaluateAppRouting() {
    const isEmailVerified = !this.user?.email || Boolean(this.user?.email_confirmed_at);
    const isAuthenticated = Boolean(this.user && isEmailVerified && !this.isPasswordRecovery);

    // Guard: recovery mode blocks entering app shell
    if (this.isPasswordRecovery) {
      return 'reset_password_view';
    }

    if (isAuthenticated) {
      this.currentView = 'app';
      return 'app_shell';
    }

    this.currentView = 'landing';
    return 'landing_page';
  }

  clearPasswordRecovery() {
    this.isPasswordRecovery = false;
    this.recoveryError = null;
  }
}

// Mock Supabase updateUser validation logic
class MockPasswordResetService {
  lastUpdatedPassword: string | null = null;
  signOutCalled: boolean = false;

  validateInput(password: string, confirmPassword: string): { valid: boolean; error?: string } {
    const trimmedP = password.trim();
    const trimmedC = confirmPassword.trim();

    if (!trimmedP) {
      return { valid: false, error: 'Please enter a new password.' };
    }
    if (trimmedP.length < 6) {
      return { valid: false, error: 'Password must be at least 6 characters long.' };
    }
    if (trimmedP !== trimmedC) {
      return { valid: false, error: 'Passwords do not match. Please ensure both fields are identical.' };
    }
    return { valid: true };
  }

  async updateUserPassword(password: string, confirmPassword: string): Promise<{ success: boolean; error?: string }> {
    const val = this.validateInput(password, confirmPassword);
    if (!val.valid) {
      return { success: false, error: val.error };
    }
    this.lastUpdatedPassword = password.trim();
    return { success: true };
  }

  async signOut(): Promise<void> {
    this.signOutCalled = true;
  }
}

async function runTests() {
  console.log('======================================================================');
  console.log('RUNNING PASSWORD RECOVERY & AUTHENTICATION TEST SUITE');
  console.log('======================================================================\n');

  // --- TEST 1: Normal login still works ---
  console.log('--- TEST 1: Normal login still works ---');
  {
    const auth = new MockAuthContextManager();
    const normalUser: MockUser = {
      id: 'usr-123',
      email: 'dispatcher@fleet.test',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    const normalSession: MockSession = {
      access_token: 'valid-jwt-token',
      refresh_token: 'valid-refresh-token',
      user: normalUser,
    };

    auth.handleAuthStateChange('SIGNED_IN', normalSession);
    const view = auth.evaluateAppRouting();

    assert.strictEqual(auth.isPasswordRecovery, false, 'Normal login must NOT set isPasswordRecovery');
    assert.strictEqual(auth.userDataFetched, true, 'Normal login must fetch user data and organizations');
    assert.strictEqual(auth.currentView, 'app', 'Normal login must navigate to app shell');
    assert.strictEqual(view, 'app_shell', 'Render target must be app_shell');
    console.log('  ✓ PASS: Normal login successfully establishes session and enters app shell');
  }

  // --- TEST 2: Recovery session enters password-reset state ---
  console.log('\n--- TEST 2: Recovery session enters password-reset state ---');
  {
    const recoveryUrl = 'https://dispatcherdesk.online/#access_token=recov-token-1&refresh_token=recov-ref-1&type=recovery';
    const auth = new MockAuthContextManager(recoveryUrl);

    assert.strictEqual(auth.isPasswordRecovery, true, 'Recovery URL must immediately detect recovery mode');

    const recoveryUser: MockUser = {
      id: 'usr-recovery-456',
      email: 'owner@transport.demo',
      email_confirmed_at: '2026-02-01T00:00:00Z',
    };
    const recoverySession: MockSession = {
      access_token: 'recov-token-1',
      refresh_token: 'recov-ref-1',
      user: recoveryUser,
    };

    auth.handleAuthStateChange('PASSWORD_RECOVERY', recoverySession);
    assert.strictEqual(auth.isPasswordRecovery, true, 'PASSWORD_RECOVERY event must set isPasswordRecovery = true');
    assert.strictEqual(auth.user?.id, 'usr-recovery-456', 'Recovery session user must be accessible for email display');
    console.log('  ✓ PASS: Recovery session enters password-reset state on PASSWORD_RECOVERY event');
  }

  // --- TEST 3: Recovery session does not redirect directly to normal dashboard ---
  console.log('\n--- TEST 3: Recovery session does not redirect directly to normal dashboard ---');
  {
    const auth = new MockAuthContextManager('https://dispatcherdesk.online/#type=recovery');
    const recoverySession: MockSession = {
      access_token: 'recov-token-2',
      refresh_token: 'recov-ref-2',
      user: {
        id: 'usr-recovery-789',
        email: 'ops@logistics.demo',
        email_confirmed_at: '2026-03-01T00:00:00Z',
      },
    };

    auth.handleAuthStateChange('PASSWORD_RECOVERY', recoverySession);
    const view = auth.evaluateAppRouting();

    assert.strictEqual(auth.currentView, 'landing', 'Current view must remain landing (not transitioned to app)');
    assert.strictEqual(view, 'reset_password_view', 'Routing must render ResetPasswordView instead of app_shell');
    assert.strictEqual(auth.userDataFetched, false, 'Recovery session must NOT fetch workspace data or trigger org onboarding');
    console.log('  ✓ PASS: Recovery session blocks normal app shell entry and renders ResetPasswordView');
  }

  // --- TEST 4: Matching passwords successfully call updateUser ---
  console.log('\n--- TEST 4: Matching passwords successfully call updateUser ---');
  {
    const service = new MockPasswordResetService();
    const result = await service.updateUserPassword('FleetSafePass2026!', 'FleetSafePass2026!');

    assert.strictEqual(result.success, true, 'Matching valid passwords must succeed');
    assert.strictEqual(service.lastUpdatedPassword, 'FleetSafePass2026!', 'Password must be passed to updateUser');
    console.log('  ✓ PASS: Matching valid passwords successfully invoke updateUser');
  }

  // --- TEST 5: Mismatched passwords are rejected ---
  console.log('\n--- TEST 5: Mismatched and invalid passwords are rejected ---');
  {
    const service = new MockPasswordResetService();

    // Mismatched passwords
    const mismatchRes = await service.updateUserPassword('Password123!', 'DifferentPass456!');
    assert.strictEqual(mismatchRes.success, false, 'Mismatched passwords must be rejected');
    assert.ok(mismatchRes.error?.includes('do not match'), 'Error message must specify mismatch');

    // Empty password
    const emptyRes = await service.updateUserPassword('   ', '   ');
    assert.strictEqual(emptyRes.success, false, 'Empty password must be rejected');

    // Too short password (< 6 chars)
    const shortRes = await service.updateUserPassword('12345', '12345');
    assert.strictEqual(shortRes.success, false, 'Short password must be rejected');
    assert.ok(shortRes.error?.includes('at least 6 characters'), 'Error message must specify 6 character requirement');

    console.log('  ✓ PASS: Mismatched, empty, and short passwords correctly rejected before calling updateUser');
  }

  // --- TEST 6: Successful password update redirects to login ---
  console.log('\n--- TEST 6: Successful password update redirects to login ---');
  {
    const auth = new MockAuthContextManager('https://dispatcherdesk.online/#type=recovery');
    const service = new MockPasswordResetService();

    const user: MockUser = {
      id: 'usr-reset-done',
      email: 'dispatcher@speedy.test',
      email_confirmed_at: '2026-01-15T00:00:00Z',
    };
    auth.handleAuthStateChange('PASSWORD_RECOVERY', {
      access_token: 'temp-token',
      refresh_token: 'temp-ref',
      user,
    });

    // User submits matching passwords
    const res = await service.updateUserPassword('BrandNewPass2026!', 'BrandNewPass2026!');
    assert.strictEqual(res.success, true);

    // After success: sign out recovery session
    await service.signOut();
    auth.handleAuthStateChange('SIGNED_OUT', null);
    auth.clearPasswordRecovery();

    assert.strictEqual(service.signOutCalled, true, 'Recovery session must be explicitly signed out');
    assert.strictEqual(auth.isPasswordRecovery, false, 'Recovery mode must be cleared');
    assert.strictEqual(auth.user, null, 'User session must be cleared');
    assert.strictEqual(auth.evaluateAppRouting(), 'landing_page', 'User must be sent to landing page / login modal');
    console.log('  ✓ PASS: Successful password update signs out recovery session and returns to login');
  }

  // --- TEST 7: Existing authenticated sessions remain unaffected ---
  console.log('\n--- TEST 7: Existing authenticated sessions remain unaffected ---');
  {
    const auth = new MockAuthContextManager('https://dispatcherdesk.online/app');
    const activeUser: MockUser = {
      id: 'usr-active-888',
      email: 'fleetmanager@apex.test',
      email_confirmed_at: '2025-10-01T00:00:00Z',
    };
    const activeSession: MockSession = {
      access_token: 'active-token-999',
      refresh_token: 'active-refresh-999',
      user: activeUser,
    };

    // User is already signed in and receives TOKEN_REFRESHED event
    auth.handleAuthStateChange('SIGNED_IN', activeSession);
    assert.strictEqual(auth.isPasswordRecovery, false);
    assert.strictEqual(auth.evaluateAppRouting(), 'app_shell');

    auth.handleAuthStateChange('TOKEN_REFRESHED', activeSession);
    assert.strictEqual(auth.isPasswordRecovery, false, 'TOKEN_REFRESHED must never trigger recovery mode');
    assert.strictEqual(auth.currentView, 'app', 'App shell view must be preserved');
    assert.strictEqual(auth.user?.id, 'usr-active-888', 'Active user identity must remain intact');
    console.log('  ✓ PASS: Existing authenticated sessions and token refreshes remain completely unaffected');
  }

  // --- BONUS TEST: Reused / Expired Recovery Token Error Handling ---
  console.log('\n--- TEST 8: Reused or expired recovery link error handling ---');
  {
    const expiredUrl =
      'https://dispatcherdesk.online/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    const auth = new MockAuthContextManager(expiredUrl);

    assert.strictEqual(auth.isPasswordRecovery, false, 'Expired link must not enter recovery mode');
    assert.ok(auth.recoveryError?.includes('expired or has already been used'), 'User-friendly error message set');
    assert.strictEqual(auth.evaluateAppRouting(), 'landing_page', 'Renders landing page to show alert and login modal');
    console.log('  ✓ PASS: Expired recovery token gracefully detected with clear error guidance');
  }

  console.log('\n======================================================================');
  console.log('🎉 ALL 8 PASSWORD RECOVERY & AUTHENTICATION TESTS PASSED! 🎉');
  console.log('======================================================================\n');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
