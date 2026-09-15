import { ApiError, errorResponse, getD1, getProfileImages, getRequestUser, hasAppSession, isLocalRequest, requireApiUser, runtimeString, sessionCookie } from "../_lib/server";

export async function GET(request: Request) {
  try {
    const identity = await getRequestUser(request);
    if (!identity) return Response.json({ authenticated: false, appAuth: false });
    const user = await requireApiUser(request);
    const db = getD1();
    const profile = await db.prepare(`SELECT id, email, full_name AS fullName, phone,
      CASE WHEN avatar_key IS NULL THEN 0 ELSE 1 END AS hasAvatar,
      COALESCE(avatar_key, '') AS avatarVersion, birth_date AS birthDate,
      country, currency, financial_goal AS financialGoal, preferred_summary_day AS preferredSummaryDay,
      monthly_budget_cents AS monthlyBudgetCents, email_notifications AS emailNotifications,
      browser_notifications AS browserNotifications, onboarding_completed AS onboardingCompleted,
      profile_completed AS profileCompleted, terms_accepted_at AS termsAcceptedAt,
      privacy_accepted_at AS privacyAcceptedAt
      FROM users WHERE id = ?`).bind(user.id).first();
    const whatsapp = await db.prepare("SELECT instance_name AS instanceName, status, phone FROM whatsapp_bot_connections WHERE id = 'primary'").first();
    const whatsappLink = await db.prepare("SELECT phone, verified_at AS verifiedAt FROM whatsapp_user_links WHERE user_id = ?").bind(user.id).first();
    const subscription = await db.prepare("SELECT plan, status, current_period_end AS currentPeriodEnd FROM subscriptions WHERE user_id = ?").bind(user.id).first();
    return Response.json({
      authenticated: true,
      appAuth: hasAppSession(request),
      profile,
      whatsapp,
      whatsappLink: whatsappLink || null,
      subscription: subscription || { plan: "none", status: "inactive", currentPeriodEnd: null },
      integrations: {
        evolution: Boolean(runtimeString("EVOLUTION_API_URL") && runtimeString("EVOLUTION_API_KEY")),
        n8n: Boolean(runtimeString("N8N_WEBHOOK_URL") && runtimeString("N8N_SHARED_SECRET")),
        stripe: Boolean(runtimeString("STRIPE_SECRET_KEY")),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const payload = await request.json() as {
      fullName?: string; phone?: string; birthDate?: string; country?: string; currency?: string;
      financialGoal?: string; preferredSummaryDay?: number; monthlyBudget?: number;
      emailNotifications?: boolean; browserNotifications?: boolean; onboardingCompleted?: boolean;
      completeProfile?: boolean; acceptTerms?: boolean; acceptPrivacy?: boolean;
    };
    const fullName = payload.fullName?.trim().slice(0, 100) || user.fullName || user.email.split("@")[0];
    const phone = payload.phone?.replace(/[^\d+() -]/g, "").trim().slice(0, 24) || "";
    const phoneDigits = phone.replace(/\D/g, "");
    const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.birthDate || "") ? payload.birthDate! : "";
    if (birthDate && birthDate > new Date().toISOString().slice(0, 10)) throw new ApiError(400, "A data de nascimento não pode estar no futuro.");
    const country = payload.country?.trim().slice(0, 60) || "Brasil";
    const currency = ["BRL", "USD", "EUR"].includes(payload.currency || "") ? payload.currency! : "BRL";
    const financialGoal = payload.financialGoal?.trim().slice(0, 240) || "";
    const preferredSummaryDay = Math.min(28, Math.max(1, Math.round(Number(payload.preferredSummaryDay) || 1)));
    const monthlyBudget = Number(payload.monthlyBudget || 0);
    const monthlyBudgetCents = Number.isFinite(monthlyBudget) && monthlyBudget >= 0 ? Math.round(monthlyBudget * 100) : 0;
    if (payload.completeProfile) {
      if (fullName.length < 2) throw new ApiError(400, "Informe seu nome completo.");
      if (phoneDigits.length < 10 || phoneDigits.length > 13) throw new ApiError(400, "Informe um telefone válido com DDD.");
      if (!payload.acceptTerms || !payload.acceptPrivacy) throw new ApiError(400, "Aceite os Termos de Uso e a Política de Privacidade para continuar.");
    }
    await getD1().prepare(`
      UPDATE users SET full_name = ?, phone = ?, birth_date = ?, country = ?, currency = ?,
        financial_goal = ?, preferred_summary_day = ?, monthly_budget_cents = ?, email_notifications = ?,
        browser_notifications = ?, onboarding_completed = CASE WHEN ? = 1 THEN 1 ELSE onboarding_completed END,
        profile_completed = CASE WHEN ? = 1 THEN 1 ELSE profile_completed END,
        terms_accepted_at = CASE WHEN ? = 1 THEN COALESCE(terms_accepted_at, CURRENT_TIMESTAMP) ELSE terms_accepted_at END,
        privacy_accepted_at = CASE WHEN ? = 1 THEN COALESCE(privacy_accepted_at, CURRENT_TIMESTAMP) ELSE privacy_accepted_at END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(fullName, phone, birthDate, country, currency, financialGoal, preferredSummaryDay,
      monthlyBudgetCents, payload.emailNotifications ? 1 : 0, payload.browserNotifications === false ? 0 : 1,
      payload.onboardingCompleted || payload.completeProfile ? 1 : 0, payload.completeProfile ? 1 : 0,
      payload.acceptTerms ? 1 : 0, payload.acceptPrivacy ? 1 : 0, user.id).run();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isLocalRequest(request)) throw new ApiError(403, "A exclusão direta não está disponível neste acesso.");
    const user = await requireApiUser(request);
    const payload = await request.json() as { confirmation?: string };
    if (payload.confirmation !== "EXCLUIR") throw new ApiError(400, "Confirmação inválida.");
    const profile = await getD1().prepare("SELECT avatar_key AS avatarKey FROM users WHERE id = ?").bind(user.id).first<{ avatarKey: string | null }>();
    await getD1().prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();
    if (profile?.avatarKey) await getProfileImages().delete(profile.avatarKey).catch(() => undefined);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", request, 0) } });
  } catch (error) { return errorResponse(error); }
}
