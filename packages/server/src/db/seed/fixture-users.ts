import type { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './password-fixture.ts';

export function seedUsersAndCategories(db: DatabaseSync, now: string): void {
    // 1. Users
    const users = [
      {
        id: 'user-admin-1',
        email: 'margaret@zur.internal',
        password_hash: hashPassword('AdminPass123!'),
        display_name: 'Margaret Hamilton',
        email_verified: 1,
        capabilities: JSON.stringify(['student', 'admin']),
        account_status: 'active',
      },
      {
        id: 'user-author-1',
        email: 'guido@zur.internal',
        password_hash: hashPassword('AuthorPass123!'),
        display_name: 'Guido van Rossum',
        email_verified: 1,
        capabilities: JSON.stringify(['student', 'author']),
        account_status: 'active',
      },
      {
        id: 'user-student-1',
        email: 'ada@zur.internal',
        password_hash: hashPassword('StudentPass123!'),
        display_name: 'Ada Lovelace',
        email_verified: 1,
        capabilities: JSON.stringify(['student']),
        account_status: 'active',
      },
      {
        id: 'user-student-2',
        email: 'grace@zur.internal',
        password_hash: hashPassword('StudentPass123!'),
        display_name: 'Grace Hopper',
        email_verified: 1,
        capabilities: JSON.stringify(['student']),
        account_status: 'active',
      },
      {
        id: 'user-student-3',
        email: 'alan@zur.internal',
        password_hash: hashPassword('StudentPass123!'),
        display_name: 'Alan Turing',
        email_verified: 1,
        capabilities: JSON.stringify(['student']),
        account_status: 'active',
      },
    ];

    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at)
      VALUES (@id, @email, @password_hash, @display_name, @email_verified, @capabilities, @account_status, '${now}', '${now}')
    `);
    for (const u of users) insertUser.run(u);

    // 2. Categories
    db.prepare(`
      INSERT INTO categories (id, name, slug, created_at)
      VALUES ('cat-programming', 'Programming', 'programming', '${now}')
    `).run();
}
