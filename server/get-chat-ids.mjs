// Lists everyone who has messaged this bot, with their chat id.
//
// Usage:
//   1. Have each person open the bot in Telegram and press Start.
//   2. node get-chat-ids.mjs
//   3. Add the ids to TELEGRAM_CHAT_ID in .env (comma-separated)
//
// Telegram only keeps recent updates (~24h), so run this soon after they
// press Start. Note getUpdates conflicts with an active webhook/polling bot.
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set in server/.env");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const body = await res.json();

if (!body.ok) {
  console.error(`Telegram error: ${body.error_code} ${body.description}`);
  process.exit(1);
}

const seen = new Map();
for (const u of body.result) {
  const chat = (u.message ?? u.edited_message ?? u.channel_post)?.chat;
  if (chat) seen.set(chat.id, chat);
}

if (!seen.size) {
  console.log("No chats found. Make sure the person pressed Start on the bot,");
  console.log("then run this again within a day.");
  process.exit(0);
}

console.log(`Found ${seen.size} chat(s):\n`);
for (const c of seen.values()) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.title || "(no name)";
  const handle = c.username ? ` @${c.username}` : "";
  console.log(`  ${String(c.id).padEnd(14)} ${name}${handle}  [${c.type}]`);
}
console.log("\nAdd the id(s) to TELEGRAM_CHAT_ID in server/.env, comma-separated");
