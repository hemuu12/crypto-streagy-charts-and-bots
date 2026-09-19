const BOT_TOKEN = "8997522037:AAHvchzslAWZRRSEs7Sc9iHVOa_9xyctAuM";
const CHAT_ID = "587148154";

export async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      console.error(`Telegram send failed: ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    console.error(`Telegram send error: ${e.message}`);
  }
}
