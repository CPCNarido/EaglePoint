import { Test, TestingModule } from '@nestjs/testing';
import { DispatcherService } from './dispatcher.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('DispatcherService (staff on duty)', () => {
  let service: DispatcherService;
  const mockPrisma: any = {
    siteConfig: { findFirst: jest.fn() },
    attendance: { findMany: jest.fn() },
    employee: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DispatcherService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    // bypass Nest's DI typing and inject service manually with mocked prisma
    service = module.get<DispatcherService>(DispatcherService);
    // attach prisma to service instance for tests
    (service as any).prisma = mockPrisma;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns attendance-based list when attendance rows exist', async () => {
    const now = new Date();
    mockPrisma.siteConfig.findFirst.mockResolvedValue({ timezone: 'UTC' });
    mockPrisma.attendance.findMany.mockResolvedValue([
      {
        employee_id: 11,
        clock_in: new Date(now.getTime() - 3600 * 1000),
        clock_out: null,
        date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        source: null,
        employee: { employee_id: 11, full_name: 'Test User', username: 'testuser' },
      },
    ]);

    const res = await service.getStaffOnDutyList();
    expect(res).toBeDefined();
    expect(res.source).toBe('attendance');
    expect(Array.isArray(res.rows)).toBe(true);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].employee_id).toBe(11);
    expect(res.rows[0].full_name).toBe('Test User');
  });

  it('falls back to employees when attendance query fails', async () => {
    mockPrisma.siteConfig.findFirst.mockResolvedValue({ timezone: 'UTC' });
    mockPrisma.attendance.findMany.mockRejectedValue(new Error('db error'));
    mockPrisma.employee.findMany.mockResolvedValue([
      { employee_id: 1, full_name: 'Alice', username: 'alice' },
      { employee_id: 2, full_name: 'Bob', username: 'bob' },
    ]);

    const res = await service.getStaffOnDutyList();
    expect(res).toBeDefined();
    expect(res.source).toBe('employees');
    expect(Array.isArray(res.rows)).toBe(true);
    expect(res.rows.length).toBe(2);
    expect(res.rows[0].present).toBe(false);
  });
});
