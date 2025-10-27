import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  full_name!: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsString()
  password!: string;

  @IsString()
  @IsIn(['Admin', 'Cashier', 'Dispatcher', 'BallHandler', 'Serviceman'])
  role!: 'Admin' | 'Cashier' | 'Dispatcher' | 'BallHandler' | 'Serviceman';
}
