import { Injectable } from '@nestjs/common';
import { DbService } from './db.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AppService {
  constructor(private readonly db: DbService) {}

  getHello(): string {
    return 'Hello World!';
  }

  // Validate user against Admin table (username or email)
  async validateUser(identifier: string, password: string): Promise<boolean> {
    // Try to find admin by username
    const res = await this.db.query('SELECT username, password FROM "Admin" WHERE username = $1 LIMIT 1', [identifier]);
    if (res.rowCount === 0) {
      // Optionally try email column if exists
      const res2 = await this.db.query('SELECT username, password FROM "Admin" WHERE username = $1 OR username = $2 LIMIT 1', [identifier, identifier]);
      if (res2.rowCount === 0) return false;
      const row = res2.rows[0];
      return bcrypt.compare(password, row.password);
    }
    const row = res.rows[0];
    return bcrypt.compare(password, row.password);
  }

  // Return user info (id and username) by identifier
  async getUserByIdentifier(identifier: string) {
    const res = await this.db.query('SELECT admin_id as id, username, role FROM "Admin" WHERE username = $1 OR username = $2 LIMIT 1', [identifier, identifier]);
    if (res.rowCount === 0) return null;
    return res.rows[0];
  }
}
