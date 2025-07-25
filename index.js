// 📦 Required Packages
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');
const { getTranslation, LANGUAGES, LANGUAGE_KEYBOARDS } = require('./translations');
require('dotenv').config();

// 📊 Load or initialize user database
const DB_FILE = 'db.json';
let db = fs.existsSync(DB_FILE) ? fs.readJsonSync(DB_FILE) : { users: {} };

function saveDB() {
  fs.writeJsonSync(DB_FILE, db);
}

// 📍 Configuration
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const REQUIRED_CHANNELS = ['@freeclaimltc', '@Konnetearnchannel'];

// 📌 Helper: Check if user joined required channels
async function hasJoinedRequiredChannels(userId) {
  for (const channel of REQUIRED_CHANNELS) {
    try {
      const member = await bot.getChatMember(channel, userId);
      if (["left", "kicked"].includes(member.status)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// 🎯 Helper: Send main menu
function sendMainMenu(chatId) {
  const lang = db.users[chatId].language || 'en';
  const t = getTranslation(lang);
  const menu = {
    reply_markup: {
      keyboard: [[
        t.balance, t.click_and_earn
      ], [
        t.signup_and_earn, t.withdraw
      ], [
        t.referral, t.contact_admin
      ]],
      resize_keyboard: true
    }
  };
  bot.sendMessage(chatId, t.menu, menu);
}

// 📥 /start Command
bot.onText(/\/start(?: (\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referrer = match[1];

  if (!db.users[chatId]) {
    db.users[chatId] = {
      balance: 0,
      referrals: [],
      clicks: 0,
      joined: false,
      language: null
    };
  }

  if (referrer && referrer !== String(chatId) && !db.users[chatId].refBy) {
    db.users[chatId].refBy = referrer;
  }

  if (!db.users[chatId].language) {
    return bot.sendMessage(chatId, "🌐 Please select your language:", {
      reply_markup: {
        inline_keyboard: LANGUAGE_KEYBOARDS
      }
    });
  }

  const t = getTranslation(db.users[chatId].language);

  if (!db.users[chatId].joined) {
    const joinText = `${t.join_to_continue}\n\n` +
      REQUIRED_CHANNELS.map(c => `🔗 ${c}`).join("\n");
    return bot.sendMessage(chatId, joinText, {
      reply_markup: {
        inline_keyboard: [[{ text: t.i_joined, callback_data: 'check_joined' }]]
      }
    });
  } else {
    sendMainMenu(chatId);
  }
});

// 🌐 Language Selection
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (LANGUAGES[data]) {
    db.users[chatId].language = data;
    saveDB();
    const t = getTranslation(data);
    const joinText = `${t.join_to_continue}\n\n` +
      REQUIRED_CHANNELS.map(c => `🔗 ${c}`).join("\n");
    return bot.editMessageText(joinText, {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: {
        inline_keyboard: [[{ text: t.i_joined, callback_data: 'check_joined' }]]
      }
    });
  }

  if (data === 'check_joined') {
    const joined = await hasJoinedRequiredChannels(chatId);
    const lang = db.users[chatId].language || 'en';
    const t = getTranslation(lang);

    if (joined) {
      db.users[chatId].joined = true;
      saveDB();

      // Credit referrer if first time
      const refBy = db.users[chatId].refBy;
      if (refBy && db.users[refBy]) {
        if (!db.users[refBy].referrals.includes(String(chatId))) {
          db.users[refBy].referrals.push(String(chatId));
          db.users[refBy].balance += 0.01;
          bot.sendMessage(refBy, `🎉 Someone just joined with your link! You earned $0.01.`);
        }
      }

      bot.editMessageText(t.welcome, {
        chat_id: chatId,
        message_id: query.message.message_id
      });
      return sendMainMenu(chatId);
    } else {
      return bot.answerCallbackQuery(query.id, { text: t.not_joined, show_alert: true });
    }
  }
});

// 💰 /balance
bot.onText(/\/balance/, msg => {
  const chatId = msg.chat.id;
  const user = db.users[chatId];
  const t = getTranslation(user.language);
  bot.sendMessage(chatId, `${t.your_balance}: $${user.balance.toFixed(4)}\n${t.your_referrals}: ${user.referrals.length}`);
});

// 📢 /referral
bot.onText(/\/referral/, msg => {
  const chatId = msg.chat.id;
  const user = db.users[chatId];
  const t = getTranslation(user.language);
  const link = `https://t.me/${bot.username}?start=${chatId}`;
  bot.sendMessage(chatId, `${t.your_referral_link}:\n${link}\n\n👥 ${t.your_referrals}: ${user.referrals.length}`);
});

// 📞 Contact Admin
bot.onText(/\/contact_admin/, msg => {
  const chatId = msg.chat.id;
  const t = getTranslation(db.users[chatId].language);
  bot.sendMessage(chatId, t.send_your_message);
  db.users[chatId].waitingMessage = true;
});

bot.on('message', msg => {
  const chatId = msg.chat.id;
  const user = db.users[chatId];
  if (user?.waitingMessage && msg.text && !msg.text.startsWith('/')) {
    bot.sendMessage(ADMIN_ID, `📩 Message from ${msg.from.first_name} (ID: ${chatId}):\n\n${msg.text}`);
    bot.sendMessage(chatId, `✅ Message sent to admin.`);
    db.users[chatId].waitingMessage = false;
  }

  if (msg.reply_to_message && chatId === ADMIN_ID) {
    const lines = msg.reply_to_message.text.split("ID: ");
    if (lines[1]) {
      const targetId = parseInt(lines[1]);
      bot.sendMessage(targetId, `📩 Admin replied:\n${msg.text}`);
    }
  }
});

// 🧠 Save DB every few minutes
setInterval(saveDB, 10000);

console.log('🤖 Bot is running...');
