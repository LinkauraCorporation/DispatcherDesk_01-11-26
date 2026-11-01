/**
 * DispatcherDesk S6.7 Communication Foundation Application Verification Test Suite
 * File: src/modules/communication/communication_foundation.test.ts
 *
 * Tests:
 * 1. Conversation listing (organization scoping, filters by status/type)
 * 2. Driver conversation resolution (authoritative get-or-create, one active general invariant)
 * 3. Load conversation creation (load_id consistency, load-specific conversation)
 * 4. Message listing (conversation isolation, chronological ordering)
 * 5. Message sending (supported message types, channels, content, metadata/context)
 * 6. client_message_id idempotency handling (resend deduplication, no duplicates on retry)
 * 7. read_at update (independent timestamp update)
 * 8. acknowledged_at update (independent timestamp update without mutating read_at)
 * 9. Organization scoping (cross-tenant data firewall, tenant-safe queries)
 * 10. Driver identity must not come from arbitrary client driver_id (authoritative resolution)
 */

// Polyfill localStorage for Node test runner
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] || null,
    length: 0,
  } as Storage;
}

import { communicationService } from './communicationService.ts';
import { ConversationType, MessageType } from './types.ts';
import { supabase } from '../../lib/supabase.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runTests() {
  console.log('===============================================================');
  console.log('RUNNING S6.7 DRIVER COMMUNICATION APPLICATION FOUNDATION TESTS');
  console.log('===============================================================\n');

  const orgA = 'org-comm-alpha-' + Date.now();
  const orgB = 'org-comm-beta-' + Date.now();
  const driverA1 = 'driver-alpha-101';
  const driverA2 = 'driver-alpha-102';
  const driverB1 = 'driver-beta-201';
  const loadA1 = 'load-alpha-9001';
  const loadA2 = 'load-alpha-9002';

  // Seed authoritative driver identities for test runner
  const driverUser1 = 'user-auth-driver-1';
  communicationService.setAuthoritativeDriverForUser(orgA, driverUser1, driverA1);
  (supabase.auth as any).getUser = async () => ({
    data: { user: { id: driverUser1 } },
    error: null,
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Conversation Listing
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Conversation listing ---');
  const emptyList = await communicationService.listConversations(orgA);
  assert(Array.isArray(emptyList), 'listConversations returns an array');
  assert(emptyList.length === 0, 'Initial conversation list is empty for fresh organization');

  // Create two conversations
  const conv1 = await communicationService.getOrCreateDriverConversation(orgA, driverA1);
  const conv2 = await communicationService.createLoadConversation(orgA, driverA2, loadA1);

  const allConversations = await communicationService.listConversations(orgA);
  assert(allConversations.length === 2, `Expected 2 conversations in orgA, got ${allConversations.length}`);

  // Test filter by driverId
  const driverFiltered = await communicationService.listConversations(orgA, { driverId: driverA1 });
  assert(driverFiltered.length === 1, `Driver filter returned 1 conversation`);
  assert(driverFiltered[0].driver_id === driverA1, 'Driver filter matched correct driver_id');

  // Test filter by loadId
  const loadFiltered = await communicationService.listConversations(orgA, { loadId: loadA1 });
  assert(loadFiltered.length === 1, `Load filter returned 1 conversation`);
  assert(loadFiltered[0].load_id === loadA1, 'Load filter matched correct load_id');

  // ---------------------------------------------------------------------------
  // TEST 2: Driver Conversation Resolution (One Active General Invariant)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Driver conversation resolution ---');
  // First call created conv1 with type 'general' and status 'active'
  assert(conv1.type === 'general', `Conversation type is 'general' (got ${conv1.type})`);
  assert(conv1.status === 'active', `Conversation status is 'active' (got ${conv1.status})`);
  assert(conv1.load_id === null, 'General conversation has load_id = null');

  // Second call for the same driver must return the EXACT SAME active general conversation
  const conv1DuplicateCheck = await communicationService.getOrCreateDriverConversation(orgA, driverA1);
  assert(conv1DuplicateCheck.id === conv1.id, 'Idempotent resolution: same driver conversation ID returned');

  // Ensure total conversations in orgA did NOT increase
  const postDedupeList = await communicationService.listConversations(orgA);
  assert(postDedupeList.length === 2, 'One-active-general invariant preserved (no duplicate conversation row)');

  // ---------------------------------------------------------------------------
  // TEST 3: Load Conversation Creation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Load conversation creation ---');
  assert(conv2.type === 'load', `Load conversation type is 'load' (got ${conv2.type})`);
  assert(conv2.load_id === loadA1, `Load conversation points to load_id = ${loadA1}`);
  assert(conv2.driver_id === driverA2, `Load conversation points to driver_id = ${driverA2}`);
  assert(conv2.organization_id === orgA, `Load conversation scoped to orgA`);

  // Create another load conversation for driverA1 with a different load
  const conv3 = await communicationService.createLoadConversation(orgA, driverA1, loadA2);
  assert(conv3.load_id === loadA2, 'Second load conversation created with distinct load_id');
  assert(conv3.driver_id === driverA1, 'Same driver can have both general and load-specific conversations');

  // Verify failure when loadId is missing
  let loadMissingCaught = false;
  try {
    await communicationService.createLoadConversation(orgA, driverA1, '');
  } catch (err) {
    loadMissingCaught = true;
  }
  assert(loadMissingCaught, 'Creating load conversation without load_id throws error');

  // ---------------------------------------------------------------------------
  // TEST 4: Message Listing
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Message listing ---');
  const emptyMessages = await communicationService.listMessages(orgA, conv1.id);
  assert(Array.isArray(emptyMessages) && emptyMessages.length === 0, 'Initial messages list is empty');

  // ---------------------------------------------------------------------------
  // TEST 5: Message Sending (Supported Message Types & Channels)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Message sending ---');
  const testMessageTypes: MessageType[] = [
    'text',
    'instruction',
    'question',
    'confirmation',
    'quick_action',
    'status_update',
  ];

  for (const msgType of testMessageTypes) {
    const sent = await communicationService.sendMessage(orgA, {
      conversationId: conv1.id,
      messageType: msgType,
      channel: 'in_app',
      content: `Test message with type: ${msgType}`,
      context: { testKey: msgType },
    });
    assert(sent.message_type === msgType, `Message created with message_type = ${msgType}`);
    assert(sent.channel === 'in_app', 'Message created with channel = in_app');
    assert(sent.context?.testKey === msgType, 'Context JSONB stored and preserved');
    assert(sent.metadata?.testKey === msgType, 'Metadata alias preserves context semantics');
    assert(Boolean(sent.client_message_id), 'client_message_id is automatically generated if omitted');
    assert(sent.read_at === null, 'New message has read_at = null');
    assert(sent.acknowledged_at === null, 'New message has acknowledged_at = null');
  }

  const listedMessages = await communicationService.listMessages(orgA, conv1.id);
  assert(listedMessages.length === testMessageTypes.length, `Listed all ${testMessageTypes.length} sent messages`);

  // Verify chronological ordering (created_at ASC)
  for (let i = 1; i < listedMessages.length; i++) {
    const prevTime = new Date(listedMessages[i - 1].created_at).getTime();
    const currTime = new Date(listedMessages[i].created_at).getTime();
    assert(currTime >= prevTime, 'Messages are listed in chronological order (created_at ASC)');
  }

  // ---------------------------------------------------------------------------
  // TEST 6: client_message_id Idempotency Handling
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: client_message_id idempotency handling ---');
  const fixedClientMsgId = '99999999-aaaa-bbbb-cccc-111111111111';
  const initialSend = await communicationService.sendMessage(orgA, {
    conversationId: conv1.id,
    content: 'Unique message for idempotency test',
    clientMessageId: fixedClientMsgId,
  });
  assert(initialSend.client_message_id === fixedClientMsgId, 'Message sent with designated client_message_id');

  const countBeforeRetry = (await communicationService.listMessages(orgA, conv1.id)).length;

  // Retry sending identical message with the SAME client_message_id
  const retrySend = await communicationService.sendMessage(orgA, {
    conversationId: conv1.id,
    content: 'Unique message for idempotency test (retry)',
    clientMessageId: fixedClientMsgId,
  });

  const countAfterRetry = (await communicationService.listMessages(orgA, conv1.id)).length;
  assert(retrySend.id === initialSend.id, 'Idempotent retry returned the existing message ID');
  assert(countAfterRetry === countBeforeRetry, 'No duplicate message row created on retry');

  // ---------------------------------------------------------------------------
  // TEST 7: read_at Update
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: read_at update ---');
  const msgToRead = listedMessages[0];
  assert(msgToRead.read_at === null, 'Message initially unread');
  assert(msgToRead.acknowledged_at === null, 'Message initially unacknowledged');

  const readMsg = await communicationService.markMessageRead(orgA, msgToRead.id);
  assert(readMsg.read_at !== null, 'read_at successfully populated with timestamp');
  assert(readMsg.acknowledged_at === null, 'acknowledged_at remained strictly NULL after read_at update');

  // ---------------------------------------------------------------------------
  // TEST 8: acknowledged_at Update (Independence from read_at)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: acknowledged_at update ---');
  const msgToAck = listedMessages[1];
  assert(msgToAck.read_at === null, 'Target message initially unread');
  assert(msgToAck.acknowledged_at === null, 'Target message initially unacknowledged');

  // Mark acknowledged WITHOUT marking read
  const ackMsg = await communicationService.markMessageAcknowledged(orgA, msgToAck.id);
  assert(ackMsg.acknowledged_at !== null, 'acknowledged_at successfully populated with timestamp');
  assert(ackMsg.read_at === null, 'read_at remained strictly NULL after acknowledged_at update (independent)');

  // Now mark the already-acknowledged message as read
  const ackAndReadMsg = await communicationService.markMessageRead(orgA, msgToAck.id);
  assert(ackAndReadMsg.acknowledged_at !== null, 'acknowledged_at preserved');
  assert(ackAndReadMsg.read_at !== null, 'read_at now also populated');

  // ---------------------------------------------------------------------------
  // TEST 9: Organization Scoping & Tenant Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9: Organization scoping & tenant isolation ---');
  // Org B must not see Org A's conversations
  const orgBConversations = await communicationService.listConversations(orgB);
  assert(orgBConversations.length === 0, 'Org B sees 0 conversations from Org A');

  // Attempt to fetch Org A's conversation by ID using Org B credentials
  const crossOrgConv = await communicationService.getConversationById(orgB, conv1.id);
  assert(crossOrgConv === null, 'Cross-tenant getConversationById returns null');

  // Attempt to send message to Org A's conversation using Org B credentials
  let crossOrgSendCaught = false;
  try {
    await communicationService.sendMessage(orgB, {
      conversationId: conv1.id,
      content: 'Malicious cross-tenant message',
    });
  } catch (err) {
    crossOrgSendCaught = true;
  }
  assert(crossOrgSendCaught, 'Cross-tenant message sending strictly rejected');

  // Verify same client_message_id in Org B is valid (isolated namespace)
  const orgBConv = await communicationService.getOrCreateDriverConversation(orgB, driverB1);
  const orgBMsg = await communicationService.sendMessage(orgB, {
    conversationId: orgBConv.id,
    content: 'Org B message with same clientMessageId as Org A',
    clientMessageId: fixedClientMsgId,
  });
  assert(orgBMsg.organization_id === orgB, 'Org B message created in Org B');
  assert(orgBMsg.client_message_id === fixedClientMsgId, 'Same client_message_id independently valid in different org');

  // ---------------------------------------------------------------------------
  // TEST 10: Driver Identity Must Not Come From Arbitrary Client driver_id
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10: Driver identity must not come from arbitrary client driver_id ---');
  // Setup: The caller is authenticated as driverUser1, which authoritatively maps to driverA1.
  // When calling getOrCreateCurrentDriverConversation, the driver ID must resolve to driverA1
  // regardless of any client-side tampering attempts.
  const authoritativeConv = await communicationService.getOrCreateCurrentDriverConversation(orgA);
  assert(authoritativeConv.driver_id === driverA1, `Resolved authoritative driver_id = ${driverA1}`);

  // Now verify createCurrentDriverLoadConversation also uses authoritative resolution
  const authoritativeLoadConv = await communicationService.createCurrentDriverLoadConversation(
    orgA,
    loadA2
  );
  assert(
    authoritativeLoadConv.driver_id === driverA1,
    `Current driver load conversation authoritatively bound to ${driverA1}, not an arbitrary client id`
  );

  // Status update test (resolved / active / escalated)
  console.log('\n--- Status resolution test ---');
  const resolved = await communicationService.updateConversationStatus(orgA, conv3.id, 'resolved');
  assert(resolved.status === 'resolved', 'Status successfully updated to resolved');
  assert(resolved.resolved_at !== null, 'resolved_at timestamp set on resolution');

  console.log('\n===============================================================');
  console.log('✅ ALL S6.7 COMMUNICATION APPLICATION FOUNDATION TESTS PASSED!');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
