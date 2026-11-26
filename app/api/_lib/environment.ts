// Server-only runtime configuration. Never import this module in client components.
export const env: Record<string, unknown> = process.env;
