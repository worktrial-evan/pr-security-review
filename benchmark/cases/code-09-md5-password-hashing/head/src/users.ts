// stores the users in sqlite and reads them back with parameterized queries
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'

// one user row, without the password hash
export interface User {
  id: number
  name: string
  role: string
}

// the user row with the password hash the login route checks
interface UserWithPasswordHash extends User {
  passwordHash: string
}

/**
 * Opens the database and seeds the two fixture users.
 */
export function openUserDatabase(databasePath: string): Database {
  // create the table on first open
  const database = new Database(databasePath)
  database.run(
    'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL)',
  )

  // seed an admin and a member, each with a hashed fixture password
  const insertUser = database.query(
    'INSERT OR IGNORE INTO users (id, name, role, password_hash) VALUES (?, ?, ?, ?)',
  )
  insertUser.run(1, 'alice', 'admin', hashPassword('alice-fixture'))
  insertUser.run(2, 'bob', 'member', hashPassword('bob-fixture'))

  return database
}

/**
 * Finds one user by id, or null when there is none.
 */
export function findUserById(database: Database, userId: number): User | null {
  // bind the id as a parameter
  const selectUser = database.query<User, [number]>(
    'SELECT id, name, role FROM users WHERE id = ?',
  )
  return selectUser.get(userId)
}

/**
 * Finds one user by name and password, or null when either is wrong.
 */
export async function findUserByCredentials({
  database,
  name,
  password,
}: {
  database: Database
  name: string
  password: string
}): Promise<User | null> {
  // read the row with its hash by name
  const selectUser = database.query<UserWithPasswordHash, [string]>(
    'SELECT id, name, role, password_hash AS passwordHash FROM users WHERE name = ?',
  )
  const userWithPasswordHash = selectUser.get(name)
  if (userWithPasswordHash === null) {
    return null
  }

  // check the password against the stored hash and drop the hash from the result
  const { passwordHash, ...user } = userWithPasswordHash
  const isPasswordValid = hashPassword(password) === passwordHash
  return isPasswordValid ? user : null
}

// hash a password with md5
function hashPassword(password: string): string {
  return createHash('md5').update(password).digest('hex')
}
