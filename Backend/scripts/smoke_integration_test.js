const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function curlJson(args) {
  const r = spawnSync('curl.exe', args, { encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`curl exited ${r.status}: ${r.stderr}`);
  const out = r.stdout && r.stdout.trim();
  if (!out) return null;
  try { return JSON.parse(out); } catch (e) { throw new Error('Failed to parse JSON from curl output: ' + out); }
}

(async () => {
  try {
  console.log('Starting smoke integration test: start -> verify -> end -> verify');
  const bayArg = process.env.SMOKE_BAY || process.argv[2] || '1';
  console.log(`Using bay ${bayArg} for smoke test`);

  // 1) Start session via HTTP API
  console.log(`POST /api/admin/bays/${bayArg}/start`);
  const startPayload = JSON.stringify({ nickname: 'IntegrationSmoke' });
  const startResp = curlJson(['-s', '-X', 'POST', `http://localhost:3000/api/admin/bays/${bayArg}/start`, '-H', 'Content-Type: application/json', '-d', startPayload]);
    console.log('Start response:', startResp);
    if (!startResp || !startResp.ok) throw new Error('Start call failed');

    const playerId = startResp.player?.player_id;
    const assignmentId = startResp.assignment_id;
    if (!playerId || !assignmentId) throw new Error('Start response missing ids');

    // 2) Verify via Prisma the assignment is open and player.end_time is null
    await prisma.$connect();
    const a = await prisma.bayAssignment.findUnique({ where: { assignment_id: assignmentId }, include: { player: true } });
    if (!a) throw new Error('Created assignment not found in DB');
    console.log('DB assignment after start:', { assignment_id: a.assignment_id, open_time: a.open_time, end_time: a.end_time });
    if (!a.open_time) throw new Error('Assignment is not marked open after start');
    if (a.player && a.player.end_time !== null) throw new Error('Player.end_time should be null for open session');

  // 3) End session via override API
  console.log(`POST /api/admin/bays/${bayArg}/override {action: End Session}`);
  const endResp = curlJson(['-s', '-X', 'POST', `http://localhost:3000/api/admin/bays/${bayArg}/override`, '-H', 'Content-Type: application/json', '-d', JSON.stringify({ action: 'End Session' })]);
    console.log('End response:', endResp);

    // 4) Verify DB state after end
    const a2 = await prisma.bayAssignment.findUnique({ where: { assignment_id: assignmentId }, include: { player: true } });
    console.log('DB assignment after end:', { assignment_id: a2.assignment_id, open_time: a2.open_time, end_time: a2.end_time });
    if (a2.open_time) throw new Error('Assignment is still open after End Session');
    if (!a2.end_time) throw new Error('Assignment.end_time not set after End Session');
    if (!a2.player || !a2.player.end_time) throw new Error('Player.end_time not set after End Session');

    console.log('Smoke integration test passed');
    process.exit(0);
  } catch (e) {
    console.error('Smoke integration test failed:', e && e.message ? e.message : e);
    process.exit(2);
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
})();
