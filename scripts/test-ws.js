/*
Simple Socket.IO test client that simulates two users joining a chat room
and exchanging messages. Run while the backend is running (default http://localhost:3000).

Usage:
  node scripts/test-ws.js
  SERVER=http://localhost:3000 node scripts/test-ws.js
*/

const { io } = require('socket.io-client');

const SERVER = process.env.SERVER || 'http://localhost:3000';
const CHAT_ID = process.env.CHAT_ID || 1;

function makeClient(empId, name) {
  const socket = io(SERVER, {
    transports: ['websocket'],
    reconnection: true,
    query: { employeeId: String(empId) },
    auth: {},
  });

  socket.on('connect', () => console.log(`${name} connected id=${socket.id}`));
  socket.on('disconnect', (r) => console.log(`${name} disconnected: ${r}`));
  socket.on('connect_error', (err) => console.error(`${name} connect_error:`, err && err.message));
  socket.on('message:new', (data) => console.log(`${name} RECEIVED message:new ->`, JSON.stringify(data)));
  return socket;
}

(async function main() {
  console.log('Test socket.io clients connecting to', SERVER, 'chatId=', CHAT_ID);

  const a = makeClient(10, 'ClientA');
  const b = makeClient(20, 'ClientB');

  // wait for both to connect (timeout fallback)
  await new Promise((resolve) => setTimeout(resolve, 1200));

  // Have both join the chat room
  a.emit('join:chat', { chat_id: Number(CHAT_ID) }, (ack) => console.log('ClientA join ack ->', ack));
  b.emit('join:chat', { chat_id: Number(CHAT_ID) }, (ack) => console.log('ClientB join ack ->', ack));

  // wait for joins to settle
  await new Promise((r) => setTimeout(r, 600));

  // ClientA sends a message (with tempId and sender_id)
  a.emit(
    'message:new',
    { message: { chat_id: Number(CHAT_ID), content: 'Hello from A', tempId: 't1', sender_id: 10 } },
    (ack) => console.log('ClientA send ack ->', ack),
  );

  // Wait then ClientB replies
  await new Promise((r) => setTimeout(r, 800));

  b.emit(
    'message:new',
    { message: { chat_id: Number(CHAT_ID), content: 'Reply from B', tempId: 't2', sender_id: 20 } },
    (ack) => console.log('ClientB send ack ->', ack),
  );

  // Let messages propagate and be logged, then close
  await new Promise((r) => setTimeout(r, 1500));

  a.disconnect();
  b.disconnect();

  console.log('Test complete');
  process.exit(0);
})();
