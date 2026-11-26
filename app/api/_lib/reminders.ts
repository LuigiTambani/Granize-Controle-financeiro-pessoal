import { ApiError } from "./server";

type ReminderPayload = { title?: string; notes?: string; kind?: string; amount?: number | null; dueDate?: string };

export function validateReminder(payload: ReminderPayload) {
  const title = payload.title?.trim().slice(0, 120) || "";
  const notes = payload.notes?.trim().slice(0, 500) || "";
  const kind = ["payment", "income", "general"].includes(payload.kind || "") ? payload.kind! : "payment";
  const dueDate = payload.dueDate || "";
  const numericAmount = payload.amount === null || payload.amount === undefined || payload.amount === 0 ? null : Number(payload.amount);
  if (title.length < 2) throw new ApiError(400, "Informe um título para o lembrete.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new ApiError(400, "Informe uma data válida.");
  if (numericAmount !== null && (!Number.isFinite(numericAmount) || numericAmount < 0)) throw new ApiError(400, "Informe um valor válido.");
  return { title, notes, kind, dueDate, amountCents: numericAmount === null ? null : Math.round(numericAmount * 100) };
}
