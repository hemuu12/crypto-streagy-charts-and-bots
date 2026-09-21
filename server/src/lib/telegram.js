const BOT_TOKEN = "8997522037:AAHvchzslAWZRRSEs7Sc9iHVOa_9xyctAuM";

// Everyone who receives alerts. Add an id to notify another person — run
// `node get-chat-ids.mjs` to discover one. Each recipient must press Start
// on @Streatgy_bot at least once, or Telegram refuses to deliver to them.
const CHAT_IDS = [
  "587148154", // hari
  "8868240269", // Amarjeet Singh
];

export async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  // One failing recipient must not stop the others from being notified.
  await Promise.all(
    CHAT_IDS.map(async (chatId) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        });
        if (!res.ok) {
          console.error(`Telegram send failed for ${chatId}: ${res.status} ${await res.text()}`);
        }
      } catch (e) {
        console.error(`Telegram send error for ${chatId}: ${e.message}`);
      }
    })
  );
}
