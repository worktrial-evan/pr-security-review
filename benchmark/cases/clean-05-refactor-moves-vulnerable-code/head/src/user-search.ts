// searches the users by name prefix
import type { Database } from 'bun:sqlite'
import type { User } from './users'

/**
 * Finds every user whose name starts with the prefix.
 */
export function findUsersByNamePrefix(
  database: Database,
  namePrefix: string,
): User[] {
  // build the query from the prefix
  const selectUsers = database.query<User, []>(
    "SELECT id, name, role FROM users WHERE name LIKE '" + namePrefix + "%'",
  )
  return selectUsers.all()
}
