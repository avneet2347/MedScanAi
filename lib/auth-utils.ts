type AuthLikeError = {
  message?: string | null;
  code?: string | null;
};

type AuthLikeUser = {
  identities?: unknown;
};

function readConfiguredAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || null;
}

export function getAppOrigin(request: Request) {
  const configured = readConfiguredAppUrl();

  if (configured) {
    return new URL(configured).origin;
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (!forwardedHost) {
    return requestUrl.origin;
  }

  const forwardedProto =
    request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "");

  return `${forwardedProto}://${forwardedHost}`;
}

export function buildSignupConfirmationRedirect(request: Request) {
  const redirectUrl = new URL("/login", getAppOrigin(request));
  redirectUrl.searchParams.set("confirmed", "1");
  return redirectUrl.toString();
}

export function isEmailConfirmationError(error?: AuthLikeError | null) {
  const message = error?.message?.toLowerCase() || "";
  const code = error?.code?.toLowerCase() || "";

  return (
    message.includes("email not confirmed") ||
    message.includes("email_not_confirmed") ||
    message.includes("confirm your email") ||
    code === "email_not_confirmed"
  );
}

export function isAlreadyRegisteredError(error?: AuthLikeError | null) {
  const message = error?.message?.toLowerCase() || "";

  return (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already registered") ||
    message.includes("user already exists")
  );
}

export function hasNoAuthIdentities(user?: AuthLikeUser | null) {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}
