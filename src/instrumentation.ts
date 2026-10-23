// Runs once when the server starts. All business times (visit slots, "today", proposal dates) are
// Indian Standard Time; cloud servers default to UTC, which would shift every rendered time by 5h30m.
export function register() {
  process.env.TZ ||= process.env.APP_TIMEZONE || "Asia/Kolkata";
}
