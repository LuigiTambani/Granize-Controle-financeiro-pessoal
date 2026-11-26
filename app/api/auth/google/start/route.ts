import { ApiError, publicOrigin } from "../../../_lib/server";
import { createGoogleFlow, googleConfig, googleFlowCookie } from "../_lib";

const plans = new Set(["trial", "basic", "pro", "annual"]);

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const mode = requestUrl.searchParams.get("mode") === "register" ? "register" : "login";
    const requestedPlan = requestUrl.searchParams.get("plan") || "trial";
    const plan = plans.has(requestedPlan) ? requestedPlan : "trial";
    const config = googleConfig(request);
    const { flow, challenge } = await createGoogleFlow(mode, plan);
    const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorization.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return new Response(null, { status: 302, headers: { Location: authorization.toString(), "Set-Cookie": googleFlowCookie(flow, request) } });
  } catch (error) {
    const code = error instanceof ApiError && error.status === 503 ? "not_configured" : "failed";
    return Response.redirect(new URL(`/?google=${code}`, publicOrigin(request)), 302);
  }
}
