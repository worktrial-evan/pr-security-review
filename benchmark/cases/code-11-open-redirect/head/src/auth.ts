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
 * Verifies the bearer token on the request and returns its claims, or null when it is missing or invalid.
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

  // verify the signature with the one accepted algorithm
  try {
    const payload = jsonwebtoken.verify(token, secret, {
      algorithms: [tokenAlgorithm],
    })
    if (typeof payload === 'string') {
      return null
    }
    return { userId: Number(payload.userId), role: String(payload.role) }
  } catch {
    return null
  }
}
