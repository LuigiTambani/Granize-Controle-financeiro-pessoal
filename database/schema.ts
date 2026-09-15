import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  avatarKey: text("avatar_key"),
  birthDate: text("birth_date").notNull().default(""),
  country: text("country").notNull().default("Brasil"),
  currency: text("currency").notNull().default("BRL"),
  financialGoal: text("financial_goal").notNull().default(""),
  preferredSummaryDay: integer("preferred_summary_day").notNull().default(1),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  googleSub: text("google_sub").unique(),
  monthlyBudgetCents: integer("monthly_budget_cents").notNull().default(0),
  emailNotifications: integer("email_notifications", { mode: "boolean" }).notNull().default(false),
  browserNotifications: integer("browser_notifications", { mode: "boolean" }).notNull().default(true),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" }).notNull().default(false),
  profileCompleted: integer("profile_completed", { mode: "boolean" }).notNull().default(false),
  termsAcceptedAt: text("terms_accepted_at"),
  privacyAcceptedAt: text("privacy_accepted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_sessions_user").on(table.userId)]);

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  transactionDate: text("transaction_date").notNull(),
  transactionTime: text("transaction_time").notNull().default(""),
  source: text("source", { enum: ["manual", "whatsapp"] }).notNull().default("manual"),
  externalId: text("external_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_transactions_user_date").on(table.userId, table.transactionDate),
  uniqueIndex("idx_transactions_user_external").on(table.userId, table.externalId),
]);

export const whatsappConnections = sqliteTable("whatsapp_connections", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  instanceName: text("instance_name").notNull().unique(),
  status: text("status").notNull().default("disconnected"),
  phone: text("phone"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const whatsappBotConnections = sqliteTable("whatsapp_bot_connections", {
  id: text("id").primaryKey().default("primary"),
  instanceName: text("instance_name").notNull().unique(),
  status: text("status").notNull().default("disconnected"),
  phone: text("phone"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const whatsappUserLinks = sqliteTable("whatsapp_user_links", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  phone: text("phone").notNull().unique(),
  verifiedAt: text("verified_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const whatsappLinkTokens = sqliteTable("whatsapp_link_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_whatsapp_link_tokens_user").on(table.userId, table.expiresAt)]);

export const subscriptions = sqliteTable("subscriptions", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("stripe"),
  plan: text("plan").notNull().default("none"),
  status: text("status").notNull().default("inactive"),
  customerId: text("customer_id"),
  subscriptionId: text("subscription_id"),
  checkoutSessionId: text("checkout_session_id"),
  currentPeriodEnd: text("current_period_end"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  eventType: text("event_type").notNull(),
  processedAt: text("processed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  kind: text("kind", { enum: ["payment", "income", "general"] }).notNull().default("payment"),
  amountCents: integer("amount_cents"),
  dueDate: text("due_date").notNull(),
  status: text("status", { enum: ["active", "completed"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_reminders_user_due").on(table.userId, table.status, table.dueDate)]);
