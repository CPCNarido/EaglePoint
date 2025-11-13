const { io } = require('socket.io-client');

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Helper to await a single event once with timeout
function onceWithTimeout(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const onEvent = (data) => { clearTimeout(t); socket.off(event, onEvent); resolve(data); };
    const t = setTimeout(() => { socket.off(event, onEvent); reject(new Error('timeout')); }, timeoutMs);
    socket.on(event, onEvent);
  });
}

async function run() {
  console.log('Integration Test: connecting two clients to', SERVER);
  const a = io(SERVER, { query: { employeeId: '1' }, reconnection: false, transports: ['websocket','polling'] });
  const b = io(SERVER, { query: { employeeId: '2' }, reconnection: false, transports: ['websocket','polling'] });

  let aConnected = false, bConnected = false;
  a.on('connect', () => { aConnected = true; console.log('[A] connected id=', a.id); });
  b.on('connect', () => { bConnected = true; console.log('[B] connected id=', b.id); });

  a.on('connect_error', (err) => console.error('[A] connect_error', err));
  b.on('connect_error', (err) => console.error('[B] connect_error', err));

  // Wait for both to connect
  for (let i = 0; i < 30; i++) {
    if (aConnected && bConnected) break;
    await wait(200);
  }
  if (!aConnected || !bConnected) {
    console.error('One or both clients failed to connect; aborting');
    process.exit(1);
  }

  // Scenario 1: both join chat -> single-room emit should be received by both
  const chatId = 2001;
  console.log('Scenario 1: both join chat:', chatId);
  a.emit('join:chat', { chat_id: chatId }, (ack) => console.log('[A] join:chat ack', ack));
  b.emit('join:chat', { chat_id: chatId }, (ack) => console.log('[B] join:chat ack', ack));
  await wait(200);

  // Listen for message:new events
  let aReceived = null, bReceived = null;
  a.on('message:new', (out) => { try { aReceived = out; console.log('[A] got message:new', JSON.stringify(out)); } catch(e){} });
  b.on('message:new', (out) => { try { bReceived = out; console.log('[B] got message:new', JSON.stringify(out)); } catch(e){} });

  const temp1 = `temp-${Date.now()}`;
  console.log('[A] emitting chat message tempId=', temp1);
  const chatAckPromise = new Promise((res) => a.emit('message:new', { message: { chat_id: chatId, content: 'Hello chat from A', tempId: temp1, sender_id: 1 } }, (ack) => res(ack)));
  const ack1 = await Promise.race([chatAckPromise, wait(3000).then(()=>null)]);
  console.log('[A] chat send ack:', JSON.stringify(ack1));
  // wait a moment for both to receive
  await wait(500);

  if (!aReceived || !bReceived) {
    console.error('FAIL: Scenario 1 - both participants should receive chat message (chat room emit)');
  } else {
    console.log('PASS: Scenario 1 - both participants received chat message');
  }

  // Scenario 2: B leaves chat, A sends another message. B should still receive via emp:2 fallback
  console.log('Scenario 2: B leaves chat and A sends message again');
  b.emit('leave:chat', { chat_id: chatId }, () => {});
  await wait(200);
  aReceived = null; bReceived = null;
  const temp2 = `temp-${Date.now()}-2`;
  const chatAckPromise2 = new Promise((res) => a.emit('message:new', { message: { chat_id: chatId, content: 'Hello after leave', tempId: temp2, sender_id: 1 } }, (ack) => res(ack)));
  const ack2 = await Promise.race([chatAckPromise2, wait(3000).then(()=>null)]);
  console.log('[A] chat send ack after leave:', JSON.stringify(ack2));
  // wait for delivery
  await wait(500);
  if (!bReceived) {
    console.error('FAIL: Scenario 2 - recipient who left chat should still receive via emp:<id> fallback');
  } else {
    console.log('PASS: Scenario 2 - recipient received message via emp:<id> fallback');
  }

  // Scenario 3: Direct message A -> B (server creates private chat) should be received by both (sender and recipient)
  console.log('Scenario 3: A sends direct message to employeeId=2');
  aReceived = null; bReceived = null;
  const temp3 = `temp-${Date.now()}-dm`;
  const dmAck = await new Promise((res) => a.emit('message:new', { message: { employeeId: 2, content: 'Direct hello to you', tempId: temp3, sender_id: 1 } }, (ack) => res(ack)));
  console.log('[A] direct send ack', JSON.stringify(dmAck));
  await wait(500);
  if (!aReceived || !bReceived) {
    console.error('FAIL: Scenario 3 - direct message should be received by both sender and recipient');
  } else {
    console.log('PASS: Scenario 3 - direct message delivered to both');
  }

  console.log('All scenarios complete, disconnecting');
  a.disconnect(); b.disconnect();
  process.exit(0);
}

run().catch((e)=>{ console.error('test failed', e); process.exit(1); });
