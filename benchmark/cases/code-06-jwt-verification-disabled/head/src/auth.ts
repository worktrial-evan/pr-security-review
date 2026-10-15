// issues and verifies the session tokens that guard the admin route
import jsonwebtoken from 'jsonwebtoken'
import ms from 'ms'

// the claims a session token holds
export interface SessionClaims {
  userId: number
  role: string
}

// the one algorithm the app signs and accepts
const tokenAlgorithm = 'HS256'

// how long a token stays valid, in seconds
const tokenLifetimeSeconds = ms('1h') / 1000

/**
 * Signs a session token for the claims with the app secret.
 */
export function signSessionToken(
  claims: SessionClaims,
  secret: string,
): string {
  return jsonwebtoken.sign(claims, secret, {
    algorithm: tokenAlgorithm,
    expiresIn: tokenLifetimeSeconds,
  })
}

/**
 * Reads the claims from the bearer token on the request, or null when it is missing or malformed.
 */
export function verifySessionToken(
  request: Request,
  secret: string,
): SessionClaims | null {
  // take the token from the bearer header
  const authorizationHeader = request.headers.get('authorization') ?? ''
  if (!authorizationHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authorizationHeader.slice('Bearer '.length)

  // read the claims from the token payload
  const payload = jsonwebtoken.decode(token)
  if (payload === null || typeof payload === 'string') {
    return null
  }
  return { userId: Number(payload.userId), role: String(payload.role) }
}
