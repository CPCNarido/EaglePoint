import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();

    // Prisma middleware: best-effort audit logging for model operations when an actor is present in the payload.
    // This avoids requiring every service to call the logger in code paths that include an employee id field
    // (for example: Player.create with created_by, BayAssignment.create with dispatcher_id, BallTransaction.create with handler_id).
    // The middleware will NOT log SystemLog writes (to avoid recursion) and will only write when an employee id is available.
    // Guard: in some environments (incomplete client generation or locked query engine)
    // the generated Prisma client may not expose $use. Protect against that so the
    // application can still start — middleware is best-effort.
    try {
      if (typeof (this as any).$use === 'function') {
        (this as any).$use(async (params: any, next) => {
          // run the original operation
          const result = await next(params);

          try {
            // skip logging for system log writes
            if (String(params.model) === 'SystemLog') return result;

            const model = String(params.model);
            const action = String(params.action);

            let actorId: number | undefined = undefined;
            let related: string | undefined = undefined;
            let sessionType: string | undefined = undefined;

            // Player create/update: look for created_by or created_at info
            if (model === 'Player') {
              if (action === 'create' && params.args && params.args.data) {
                actorId = params.args.data.created_by ?? undefined;
                related = `player:${params.args.data.receipt_number ?? ''}`;
                sessionType = params.args.data.end_time ? 'Timed' : 'Open';
              } else if (
                action === 'update' &&
                params.args &&
                params.args.data
              ) {
                // if end_time set, record session type
                if (params.args.data.end_time) {
                  // attempt to fetch who performed update from data.updated_by if present
                  actorId = params.args.data.updated_by ?? undefined;
                  related = `player:update`;
                  sessionType = 'Timed';
                }
              }
            }

            // BayAssignment create/update: dispatcher/serviceman
            if (model === 'BayAssignment') {
              if (action === 'create' && params.args && params.args.data) {
                actorId =
                  params.args.data.dispatcher_id ??
                  params.args.data.serviceman_id ??
                  undefined;
                related = `assignment:bay:${params.args.data.bay_id}`;
                sessionType = params.args.data.end_time ? 'Timed' : 'Open';
              } else if (
                action === 'update' &&
                params.args &&
                params.args.data
              ) {
                // closing an assignment (end_time set)
                if (params.args.data.end_time) {
                  actorId =
                    params.args.data.dispatcher_id ??
                    params.args.data.serviceman_id ??
                    undefined;
                  related = `assignment:update`;
                  sessionType = 'Timed';
                }
              }
            }

            // BallTransaction create: handler_id
            if (
              model === 'BallTransaction' &&
              action === 'create' &&
              params.args &&
              params.args.data
            ) {
              actorId = params.args.data.handler_id ?? undefined;
              related = `transaction:assignment:${params.args.data.assignment_id ?? ''}`;
              sessionType = undefined;
              // Immediately persist Player.start_time = delivered_time + 30s when
              // the first BallTransaction for an assignment is created. This is
              // idempotent and avoids relying on in-process timers that can be
              // lost on restart. We perform an updateMany guarded by
              // start_time == null so concurrent transactions won't overwrite an
              // already-populated start_time.
              try {
                const assignmentId = params.args.data.assignment_id;
                if (assignmentId) {
                  // find assignment -> player
                  const asg = await (this as any).bayAssignment
                    .findUnique({
                      where: { assignment_id: assignmentId },
                      select: { player_id: true },
                    })
                    .catch(() => null);
                  const playerId = asg?.player_id;
                  if (playerId) {
                    // Determine delivered_time: prefer provided data, fallback to now
                    const delivered = params.args.data.delivered_time
                      ? new Date(params.args.data.delivered_time)
                      : new Date();
                    const startAtMs = delivered.getTime() + 30000;
                    const startAt = new Date(startAtMs);

                    // Idempotent update: only set start_time when it's currently null
                    await (this as any).player
                      .updateMany({
                        where: { player_id: playerId, start_time: null },
                        data: { start_time: startAt },
                      })
                      .catch(() => null);
                  }
                }
              } catch (e) {
                void e;
              }
            }

            if (actorId) {
              // write a best-effort system log entry; guard against failures
              try {
                await (this as any).systemLog.create({
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  data: {
                    employee_id: actorId,
                    role: undefined,
                    action: `${model}.${action}`,
                    related_record: related ?? undefined,
                    session_type: sessionType ?? undefined,
                  } as any,
                });
              } catch (e) {
                // swallow - best-effort
                void e;
              }
            }
          } catch (e) {
            void e;
          }

          return result;
        });
      } else {
        // $use not available — middleware will be skipped.
        // This can happen if the Prisma client wasn't fully generated or the query engine
        // couldn't be replaced (EPERM). The app can still run, but audit logging from
        // Prisma middleware will be disabled until `npx prisma generate` completes.
        // We intentionally do not throw here.

        console.warn(
          'Prisma middleware skipped: $use is not available on PrismaClient instance',
        );
      }
    } catch (outer) {
      // If anything unexpected happens while registering middleware, don't crash the app.

      console.warn('Prisma middleware registration failed (non-fatal):', outer);
    }
  }
}
