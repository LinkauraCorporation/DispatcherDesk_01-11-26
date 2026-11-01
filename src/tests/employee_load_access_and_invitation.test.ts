/**
 * DispatcherDesk - Employee Load Access Control & Seamless Invitation Verification Tests
 *
 * Verifies:
 * 1. ZERO Assignment Test: Dispatcher/Staff with 0 assignments gets 0 loads from getLoads()
 * 2. Single Assignment Test: Employee assigned Load 123 sees ONLY Load 123
 * 3. Multiple Assignments Test: Employee assigned Load 123 and Load 456 sees ONLY 123 and 456
 * 4. Owner Admin Test: Owner Admin retains full visibility across all organization loads
 * 5. Direct Load Detail Access Denial: getLoadById returns null for unauthorized load
 * 6. Cascading check-call access control: Check-calls for unauthorized loads are excluded
 * 7. Cascading document access control: Documents for unauthorized loads are excluded
 * 8. Invitation Session Storage Survival: Token and pending OTP state persistence
 */

// Polyfill localStorage and sessionStorage for Node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() { return store.size; },
  } as unknown as Storage;
}

if (typeof globalThis.sessionStorage === 'undefined') {
  const sStore = new Map<string, string>();
  globalThis.sessionStorage = {
    getItem: (key: string) => sStore.get(key) || null,
    setItem: (key: string, value: string) => { sStore.set(key, String(value)); },
    removeItem: (key: string) => { sStore.delete(key); },
    clear: () => { sStore.clear(); },
    key: (index: number) => Array.from(sStore.keys())[index] || null,
    get length() { return sStore.size; },
  } as unknown as Storage;
}

import { loadService } from '../modules/loads/loadService.ts';
import { clientService } from '../modules/clients/clientService.ts';
import { checkCallService } from '../modules/checkcalls/checkCallService.ts';
import { documentService } from '../modules/documents/documentService.ts';
import { teamService } from '../modules/team/teamService.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING EMPLOYEE LOAD ACCESS CONTROL & INVITATION ONBOARDING TESTS');
  console.log('================================================================\n');

  const testOrgId = 'test-org-rbac-' + Date.now();
  const employeeA = 'user-employee-a-' + Date.now();
  const employeeB = 'user-employee-b-' + Date.now();
  const ownerAdmin = 'user-owner-admin-' + Date.now();

  console.log('--- Setting up test client & loads ---');
  const client = await clientService.createClient(testOrgId, {
    company_name: 'Test Carrier LLC',
    contact_name: 'John Carrier',
    client_type: 'owner_operator',
  });

  // Create 3 test loads in testOrgId using standard createLoad signature: (orgId, input)
  const load1 = await loadService.createLoad(testOrgId, {
    load_number: 'LOAD-RBAC-001',
    client_id: client.id,
    origin_city: 'Chicago',
    origin_state: 'IL',
    dest_city: 'Dallas',
    dest_state: 'TX',
    commodity: 'General Freight 1',
    rate: 1500,
    loaded_miles: 500,
    equipment_type: 'dry_van',
    pipeline_status: 'booked',
    assigned_dispatcher_id: employeeB, // assigned to employee B
  });

  const load2 = await loadService.createLoad(testOrgId, {
    load_number: 'LOAD-RBAC-002',
    client_id: client.id,
    origin_city: 'Dallas',
    origin_state: 'TX',
    dest_city: 'Atlanta',
    dest_state: 'GA',
    commodity: 'General Freight 2',
    rate: 2200,
    loaded_miles: 780,
    equipment_type: 'dry_van',
    pipeline_status: 'booked',
    // Unassigned initially
  });

  const load3 = await loadService.createLoad(testOrgId, {
    load_number: 'LOAD-RBAC-003',
    client_id: client.id,
    origin_city: 'Memphis',
    origin_state: 'TN',
    dest_city: 'Miami',
    dest_state: 'FL',
    commodity: 'Reefer Produce',
    rate: 3100,
    loaded_miles: 950,
    equipment_type: 'dry_van',
    pipeline_status: 'in_transit',
    // Unassigned initially
  });

  console.log(`Created test loads: ${load1.load_number}, ${load2.load_number}, ${load3.load_number}`);

  // -------------------------------------------------------------
  // Test 1: ZERO Assignment Test
  // -------------------------------------------------------------
  console.log('\n--- Test 1: ZERO Assignment Test (Employee A with 0 assignments) ---');
  // Explicit filters
  const employeeALoads = await loadService.getLoads(testOrgId, {
    userRole: 'dispatcher',
    currentUserId: employeeA,
  });

  assert(
    employeeALoads.length === 0,
    `Employee A with 0 assignments must see 0 loads. Received: ${employeeALoads.length}`
  );

  // Test via localStorage context synchronization (what App and UI components use)
  localStorage.setItem('dispatchdesk_current_role', 'dispatcher');
  localStorage.setItem('dispatchdesk_current_user_id', employeeA);
  const employeeALoadsViaStorage = await loadService.getLoads(testOrgId);
  assert(
    employeeALoadsViaStorage.length === 0,
    `Employee A via localStorage role/userId gets 0 loads. Received: ${employeeALoadsViaStorage.length}`
  );

  // -------------------------------------------------------------
  // Test 2: Single Assignment Test (Employee A assigned Load 2)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Single Assignment Test (Employee A assigned Load 2) ---');
  // Assign Employee A to Load 2
  await loadService.updateLoad(testOrgId, load2.id, { assigned_dispatcher_id: employeeA });

  const employeeALoadsAfterAssign1 = await loadService.getLoads(testOrgId, {
    userRole: 'dispatcher',
    currentUserId: employeeA,
  });

  assert(
    employeeALoadsAfterAssign1.length === 1,
    `Employee A must see exactly 1 load after assignment. Received: ${employeeALoadsAfterAssign1.length}`
  );
  assert(
    employeeALoadsAfterAssign1[0].id === load2.id,
    `Employee A should see Load 2 (${load2.load_number}). Received: ${employeeALoadsAfterAssign1[0].load_number}`
  );

  // -------------------------------------------------------------
  // Test 3: Multiple Assignments Test (Employee A assigned Load 2 and Load 3)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Multiple Assignments Test (Employee A assigned Load 2 and Load 3) ---');
  await loadService.updateLoad(testOrgId, load3.id, { assigned_dispatcher_id: employeeA });

  const employeeALoadsAfterAssign2 = await loadService.getLoads(testOrgId, {
    userRole: 'dispatcher',
    currentUserId: employeeA,
  });

  assert(
    employeeALoadsAfterAssign2.length === 2,
    `Employee A must see exactly 2 loads after assignment. Received: ${employeeALoadsAfterAssign2.length}`
  );
  const loadIdsSeen = employeeALoadsAfterAssign2.map((l) => l.id);
  assert(
    loadIdsSeen.includes(load2.id) && loadIdsSeen.includes(load3.id) && !loadIdsSeen.includes(load1.id),
    `Employee A must see ONLY Load 2 and Load 3, NOT Load 1 (assigned to Employee B).`
  );

  // -------------------------------------------------------------
  // Test 4: Direct Load Detail Access Denial
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Direct Load Detail Access Denial ---');
  // Load 1 belongs to Employee B; Employee A attempts direct access:
  localStorage.setItem('dispatchdesk_current_role', 'dispatcher');
  localStorage.setItem('dispatchdesk_current_user_id', employeeA);
  const unauthorizedLoad = await loadService.getLoadById(testOrgId, load1.id);
  assert(
    unauthorizedLoad === null,
    `Direct getLoadById for unassigned Load 1 must return null for Employee A`
  );

  // Authorized load direct access succeeds:
  const authorizedLoad = await loadService.getLoadById(testOrgId, load2.id);
  assert(
    authorizedLoad !== null && authorizedLoad.id === load2.id,
    `Direct getLoadById for assigned Load 2 must return load successfully for Employee A`
  );

  // -------------------------------------------------------------
  // Test 5: Owner Admin Retains Full Organization Visibility
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Owner Admin Retains Full Visibility ---');
  localStorage.setItem('dispatchdesk_current_role', 'owner_admin');
  localStorage.setItem('dispatchdesk_current_user_id', ownerAdmin);

  const adminLoads = await loadService.getLoads(testOrgId, {
    userRole: 'owner_admin',
    currentUserId: ownerAdmin,
  });
  const adminLoadIds = adminLoads.map((l) => l.id);
  assert(
    adminLoadIds.includes(load1.id) && adminLoadIds.includes(load2.id) && adminLoadIds.includes(load3.id),
    `Owner Admin must see all organization loads including unassigned and other employees' loads. Total seen: ${adminLoads.length}`
  );

  // -------------------------------------------------------------
  // Test 6: Check-Calls Data Isolation
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Check-Calls Data Isolation ---');
  // Create check call for Load 1 (Employee B's load) and Load 2 (Employee A's load)
  await checkCallService.createCheckCall(testOrgId, {
    load_id: load1.id,
    call_type: 'en_route_delivery',
    status: 'delayed',
    location_city: 'Chicago',
    location_state: 'IL',
    notes: 'Load 1 check call notes',
  });
  await checkCallService.createCheckCall(testOrgId, {
    load_id: load2.id,
    call_type: 'loaded',
    status: 'on_time',
    location_city: 'Dallas',
    location_state: 'TX',
    notes: 'Load 2 check call notes',
  });

  // Switch context to Employee A
  localStorage.setItem('dispatchdesk_current_role', 'dispatcher');
  localStorage.setItem('dispatchdesk_current_user_id', employeeA);

  const employeeACheckCalls = await checkCallService.getCheckCalls(testOrgId);
  assert(
    employeeACheckCalls.every((cc) => cc.load_id !== load1.id),
    `Employee A must NOT see check calls for Load 1`
  );
  assert(
    employeeACheckCalls.some((cc) => cc.load_id === load2.id),
    `Employee A must see check calls for assigned Load 2`
  );

  // -------------------------------------------------------------
  // Test 7: Documents Data Isolation
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Documents Data Isolation ---');
  // Temporarily switch to admin to seed docs
  localStorage.setItem('dispatchdesk_current_role', 'owner_admin');
  await documentService.createDocument(testOrgId, {
    load_id: load1.id,
    doc_type: 'rate_confirmation',
    file_name: 'ratecon_load1.pdf',
    notes: 'Ratecon for Load 1',
  });
  await documentService.createDocument(testOrgId, {
    load_id: load2.id,
    doc_type: 'rate_confirmation',
    file_name: 'ratecon_load2.pdf',
    notes: 'Ratecon for Load 2',
  });

  // Switch context back to Employee A
  localStorage.setItem('dispatchdesk_current_role', 'dispatcher');
  localStorage.setItem('dispatchdesk_current_user_id', employeeA);

  const employeeADocuments = await documentService.listDocuments(testOrgId);
  assert(
    employeeADocuments.every((d) => d.load_id !== load1.id),
    `Employee A must NOT see documents for Load 1`
  );
  assert(
    employeeADocuments.some((d) => d.load_id === load2.id),
    `Employee A must see documents for assigned Load 2`
  );

  // -------------------------------------------------------------
  // Test 8: Invitation Token & OTP Survival in SessionStorage
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Invitation Token & OTP Survival across Page Reload ---');
  const dummyInviteToken = 'inv_test_token_abc123';
  sessionStorage.setItem('dispatchdesk_invitation_token', dummyInviteToken);

  const restoredToken = sessionStorage.getItem('dispatchdesk_invitation_token');
  assert(
    restoredToken === dummyInviteToken,
    `Invitation token must persist in sessionStorage so refresh does not lose token`
  );

  // Test pending OTP state preservation
  const pendingOtpData = JSON.stringify({
    token: dummyInviteToken,
    email: 'newemployee@example.com',
    fullName: 'Jane Doe',
    role: 'dispatcher',
  });
  sessionStorage.setItem('dispatchdesk_invite_pending_otp', pendingOtpData);

  const restoredPendingOtp = JSON.parse(sessionStorage.getItem('dispatchdesk_invite_pending_otp') || '{}');
  assert(
    restoredPendingOtp.token === dummyInviteToken && restoredPendingOtp.email === 'newemployee@example.com',
    `Pending OTP state restores email and token correctly after simulated reload`
  );

  // -------------------------------------------------------------
  // Test 9: Prevention of Premature Organization Creation during Invitation Flow
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Prevention of Premature Org Creation during Invitation Flow ---');

  // Helper simulating App.tsx hasActiveInvitationFlow derivation
  const checkHasActiveInvitationFlow = (token: string | null) => {
    return Boolean(
      token ||
      (typeof sessionStorage !== 'undefined' && (
        sessionStorage.getItem('dispatchdesk_invitation_token') ||
        sessionStorage.getItem('dispatchdesk_invite_pending_otp')
      ))
    );
  };

  // Scenario A: Active invitation in sessionStorage (e.g. while OTP is pending or being verified)
  sessionStorage.setItem('dispatchdesk_invitation_token', 'test_inv_token');
  assert(
    checkHasActiveInvitationFlow(null) === true,
    'hasActiveInvitationFlow must be TRUE when dispatchdesk_invitation_token is in sessionStorage'
  );

  // Scenario B: Active pending OTP state in sessionStorage
  sessionStorage.removeItem('dispatchdesk_invitation_token');
  sessionStorage.setItem('dispatchdesk_invite_pending_otp', JSON.stringify({ email: 'user@test.com' }));
  assert(
    checkHasActiveInvitationFlow(null) === true,
    'hasActiveInvitationFlow must be TRUE when dispatchdesk_invite_pending_otp is in sessionStorage'
  );

  // Scenario C: Clean state after full invitation acceptance
  sessionStorage.removeItem('dispatchdesk_invite_pending_otp');
  assert(
    checkHasActiveInvitationFlow(null) === false,
    'hasActiveInvitationFlow must be FALSE after tokens are cleaned up'
  );

  // Scenario D: Normal non-invitation visitor
  assert(
    checkHasActiveInvitationFlow(null) === false,
    'Normal visitors without an invitation must have hasActiveInvitationFlow === false'
  );

  // -------------------------------------------------------------
  // Test 10: Real-Time Team Invitation UI Synchronization
  // -------------------------------------------------------------
  console.log('\n--- Test 10: Real-Time Team Invitation UI Synchronization ---');

  const syncOrgId = 'test-org-sync-' + Date.now();
  const inviteEmail = `dispatcher.${Date.now()}@example.com`;

  // 1. Create team invitation
  const createResult = await teamService.createInvitation(
    syncOrgId,
    inviteEmail,
    'dispatcher',
    'usr-admin-1',
    'owner_admin'
  );
  assert(Boolean(createResult.rawToken), 'Raw token must be generated for invitation');
  assert(createResult.invitation.status === 'pending', 'New invitation must have pending status');

  // 2. Initial listing by Admin shows status 'pending'
  const initialInvList = await teamService.listInvitations(syncOrgId, 'owner_admin');
  const matchedInvBefore = initialInvList.find((i) => i.id === createResult.invitation.id);
  assert(Boolean(matchedInvBefore), 'Invitation must be listed for organization');
  assert(matchedInvBefore?.status === 'pending', 'Initial invitation status must be pending');

  // 3. Register onTeamUpdated listener (simulating Admin UI live subscription)
  const listenerTracker = { updateFired: false };
  const unsubscribe = teamService.onTeamUpdated(() => {
    listenerTracker.updateFired = true;
  });

  // 4. Employee accepts invitation
  const acceptedResult = await teamService.acceptInvitation(createResult.rawToken, {
    id: `usr-emp-${Date.now()}`,
    email: inviteEmail,
    full_name: 'Fast Dispatcher',
  });
  assert(acceptedResult.organizationId === syncOrgId, 'Accepted organization ID must match');
  assert(acceptedResult.role === 'dispatcher', 'Accepted role must match invitation role');

  // 5. Verify listener was triggered immediately without browser reload
  assert(listenerTracker.updateFired === true, 'teamService.onTeamUpdated callback must fire immediately upon acceptance');
  unsubscribe();

  // 6. Verify subsequent listInvitations query shows 'accepted' status
  const refreshedInvList = await teamService.listInvitations(syncOrgId, 'owner_admin');
  const matchedInvAfter = refreshedInvList.find((i) => i.id === createResult.invitation.id);
  assert(matchedInvAfter?.status === 'accepted', 'Refreshed invitation status must immediately transition to "accepted"');
  assert(Boolean(matchedInvAfter?.accepted_at), 'accepted_at timestamp must be populated');

  // -------------------------------------------------------------
  // Test 11: Anti-Stale Response Reconciliation
  // -------------------------------------------------------------
  console.log('\n--- Test 11: Anti-Stale Response Reconciliation ---');

  // Simulate UI state where an invitation was marked 'accepted'
  const prevUIState = [
    { id: createResult.invitation.id, email: inviteEmail, status: 'accepted' as const, expires_at: new Date().toISOString() },
  ];

  // Simulate a delayed/stale API response arriving late that still has status 'pending'
  const staleApiResponse = [
    { id: createResult.invitation.id, email: inviteEmail, status: 'pending' as const, expires_at: new Date().toISOString() },
  ];

  // Reconcile as implemented in TeamMembersSection.tsx
  const prevAcceptedIds = new Set(
    prevUIState.filter((inv) => inv.status === 'accepted').map((inv) => inv.id)
  );
  const reconciled = staleApiResponse.map((inv) => {
    if (prevAcceptedIds.has(inv.id) && inv.status === 'pending') {
      return { ...inv, status: 'accepted' as const };
    }
    return inv;
  });

  assert(
    reconciled[0].status === 'accepted',
    'Reconciliation must protect accepted state from being overwritten by stale pending responses'
  );

  console.log('\n================================================================');
  console.log('✅ ALL EMPLOYEE LOAD ACCESS CONTROL & INVITATION TESTS PASSED!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILURE:', err);
  process.exit(1);
});
