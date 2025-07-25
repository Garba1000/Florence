
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');
const translations = require('./translations');
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID;
const bot = new TelegramBot(token, { polling: true });

let db = fs.existsSync('db.json') ? fs.readJsonSync('db.json') : {};

function saveDB() {
  fs.writeJsonSync('db.json', db);
}

function t(chatId, key) {
  const lang = db[chatId]?.language || 'en';
  return translations[lang]?.[key] || translations['en'][key];
}

// START command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!db[chatId]) {
    db[chatId] = { balance: 0, referrals: [], clicks: [], joined: false, language: null };
  }
  bot.sendMessage(chatId, t(chatId, "select_language"), {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇺🇸 English", callback_data: "lang_en" }, { text: "🇫🇷 French", callback_data: "lang_fr" }],
        [{ text: "🇸🇦 Arabic", callback_data: "lang_ar" }, { text: "🇧🇩 Bengali", callback_data: "lang_bn" }],
        [{ text: "🇮🇳 Hindi", callback_data: "lang_hi" }, { text: "🌍 Swahili", callback_data: "lang_sw" }]
      ]
    }
  });
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('lang_')) {
    const lang = data.split('_')[1];
    db[chatId].language = lang;
    saveDB();
    bot.sendMessage(chatId, `${t(chatId, "language_set")} ${lang.toUpperCase()}`);
    bot.sendMessage(chatId, t(chatId, "welcome"));
  }
});

// Admin commands
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id.toString();
  if (chatId !== adminId) return;

  const allUsers = Object.keys(db);
  const earnings = allUsers.map(id => `👤 ${id}: 💰 $${db[id].balance?.toFixed(4) || '0.00'}`).join("\n");

  let refCounts = allUsers.map(id => ({ id, count: db[id].referrals?.length || 0 }));
  refCounts.sort((a, b) => b.count - a.count);
  const topRef = refCounts.slice(0, 5).map((u, i) => `#${i+1} 👤 ${u.id} → ${u.count} refs`).join("\n");

  bot.sendMessage(chatId, `📊 User Summary:\n\n👥 Total Users: ${allUsers.length}\n\n💸 Earnings:\n${earnings}\n\n🏆 Top Referrals:\n${topRef}`);
});

bot.onText(/\/messageall (.+)/, (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (chatId !== adminId) return;

  const text = match[1];
  for (let id of Object.keys(db)) {
    bot.sendMessage(id, `📢 Admin: ${text}`).catch(e => {});
  }
  bot.sendMessage(chatId, "✅ Broadcast sent.");
});

bot.onText(/\/message (\d+) (.+)/, (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (chatId !== adminId) return;

  const userId = match[1];
  const message = match[2];
  bot.sendMessage(userId, `📬 Admin: ${message}`).then(() => {
    bot.sendMessage(chatId, "✅ Message sent.");
  }).catch(() => {
    bot.sendMessage(chatId, "❌ Failed to send message.");
  });
});
