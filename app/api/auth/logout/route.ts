import { errorResponse, getD1, requireSameOrigin, sessionCookie, sha256 } from "../../_lib/server";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const token = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith("granize_session="))?.split("=").slice(1).join("=") || "";
    if (token) await getD1().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(decodeURIComponent(token))).run();
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", request, 0) } });
  } catch (error) { return errorResponse(error); }
}
