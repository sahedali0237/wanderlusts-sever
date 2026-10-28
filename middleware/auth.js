import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS_URI = process.env.JWKS_URI;
const JWKS = createRemoteJWKSet(new URL(JWKS_URI));

function extractToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      return res
        .status(401)
        .json({ error: "Missing or invalid Authorization header" });
    }
    const { payload } = await jwtVerify(token, JWKS);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      ...payload,
    };
    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);
    if (error.code === "ERR_JWT_EXPIRED")
      return res.status(401).json({ error: "Token expired" });
    if (error.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED")
      return res.status(401).json({ error: "Invalid token signature" });
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req.headers.authorization);
    if (!token) return next();
    const { payload } = await jwtVerify(token, JWKS);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      ...payload,
    };
  } catch (error) {
    console.debug("Optional auth: invalid token", error.message);
  }
  next();
}
