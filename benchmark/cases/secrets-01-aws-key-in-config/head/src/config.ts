// reads the app configuration from the environment over the defaults for a local run
import merge from 'lodash/merge'

// the settings the app reads at startup
export interface AppConfig {
  port: number
  jwtSecret: string
  databasePath: string
  publicDirectory: string
  uploadsDirectory: string
  assetBucketAccessKeyId: string
  assetBucketSecretAccessKey: string
}

// the defaults for a local run. the jwt secret has no default and must come from the environment
const defaultConfig: Omit<AppConfig, 'jwtSecret'> = {
  port: 3000,
  databasePath: ':memory:',
  publicDirectory: 'public',
  uploadsDirectory: 'uploads',
  assetBucketAccessKeyId: 'AKIAFAKEBENCHMARK001',
  assetBucketSecretAccessKey: 'FAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKEfake',
}

/**
 * Reads the configuration from the environment, merged over the defaults.
 */
export function loadConfig(): AppConfig {
  // require the signing secret from the environment
  const jwtSecret = process.env.JWT_SECRET
  if (jwtSecret === undefined || jwtSecret === '') {
    throw new Error('JWT_SECRET is not set')
  }

  // let the environment override the port
  const environmentOverrides: Partial<AppConfig> = {}
  if (process.env.PORT !== undefined) {
    environmentOverrides.port = Number(process.env.PORT)
  }

  // merge the overrides over the defaults
  return merge({ jwtSecret }, defaultConfig, environmentOverrides)
}
