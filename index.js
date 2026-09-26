require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes
} = require("discord.js");

// === الإعدادات الأساسية ===
const TOKEN = process.env.DISCORD_TOKEN?.trim();
const GUILD_ID = process.env.GUILD_ID?.trim() || "1500918222378106901";
const COMMANDS_CHANNEL_ID = process.env.COMMANDS_CHANNEL_ID?.trim() || "1545389147911626772";
const NO_BACK_CHANNEL_ID = process.env.NO_BACK_CHANNEL_ID?.trim() || "1545821612304244756";

if (!TOKEN) {
  console.error("❌ لم يتم العثور على DISCORD_TOKEN داخل ملف .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// === قوائم الصلاحيات ===
const COMMAND_PERMISSION_USERS = ["1518574556787249177", "1496923040985124905", "1422526730035396659", "974728425824727132"];
const PANEL_USERS = ["1496923040985124905", "1518574556787249177", "1422526730035396659", "974728425824727132"];
const BLACK_VOICE_USERS = ["1518574556787249177", "1496923040985124905", "1422526730035396659", "974728425824727132"];
const TICKET_DELETE_USERS = ["1496923040985124905", "1518574556787249177", "1422526730035396659", "1324690375000068106", "1443146259580977252", "974728425824727132"];
const CHANNEL_DELETE_USERS = ["1496923040985124905", "1518574556787249177", "974728425824727132"];
const NO_BACK_PERMISSION_USERS = ["260968942430846977"];
const JAIL_PERMISSION_USERS = ["1518574556787249177", "1496923040985124905"];

const AUTHORIZED_USERS = [...new Set([
  ...COMMAND_PERMISSION_USERS,
  ...PANEL_USERS,
  ...BLACK_VOICE_USERS,
  ...TICKET_DELETE_USERS,
  ...CHANNEL_DELETE_USERS,
  ...NO_BACK_PERMISSION_USERS,
  ...JAIL_PERMISSION_USERS
])];

const TICKET_CATEGORY_ID = "1544479850021134386";
const JAIL_ROLE_ID = "1546513583926550578";
const JAIL_MEMBER_ROLE_ID = "1546521568199446590";
const HIDE_CATEGORY_IDS = ["1545178947040583723", "1526683963907772426", "1544479850021134386", "1526587780786946159"];
const HIDE_CHANNEL_IDS = [];
const HIDE_EXCLUDED_CHANNEL_IDS = [];

// === مسارات الملفات ===
const DATA_DIR = __dirname;
const COMMANDS_MESSAGE_FILE = path.join(DATA_DIR, "commands-message.json");
const ADMIN_ROLES_MESSAGE_FILE = path.join(DATA_DIR, "admin-roles-message.json");
const SERVER_MUTE_FILE = path.join(DATA_DIR, "servermute.json");
const SERVER_DEAFEN_FILE = path.join(DATA_DIR, "serverdeafen.json");
const VOICE_BLOCK_FILE = path.join(DATA_DIR, "voiceblock.json");
const NO_BACK_FILE = path.join(DATA_DIR, "noback.json");
const NO_BACK_MESSAGE_FILE = path.join(DATA_DIR, "noback-message.json");
const JAIL_FILE = path.join(DATA_DIR, "jail.json");

const spamJobs = new Map();
const snowflakePattern = /^\d{15,22}$/;

// === الدوال المساعدة ===
function readJson(file, defaultData) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultData, null, 2), "utf8");
      return defaultData;
    }
    return JSON.parse(fs.readFileSync(file, "utf8")) ?? defaultData;
  } catch (err) {
    console.error(`❌ تعذر قراءة الملف ${path.basename(file)}:`, err);
    return defaultData;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`❌ تعذر حفظ الملف ${path.basename(file)}:`, err);
  }
}

function readIdArray(file) {
  const data = readJson(file, []);
  return Array.isArray(data) ? data.filter(id => isValidId(id)) : [];
}

function isValidId(id) {
  return snowflakePattern.test(String(id || ""));
}

function getActorId(interactionOrMsg) {
  return interactionOrMsg?.author?.id || interactionOrMsg?.user?.id || "";
}

function canManageNoBack(interactionOrMsg) {
  return NO_BACK_PERMISSION_USERS.includes(getActorId(interactionOrMsg));
}

function canManageCommands(interactionOrMsg) {
  return COMMAND_PERMISSION_USERS.includes(getActorId(interactionOrMsg));
}

function canUsePanel(interactionOrMsg) {
  return PANEL_USERS.includes(getActorId(interactionOrMsg));
}

function canUseBlackVoice(interactionOrMsg) {
  return BLACK_VOICE_USERS.includes(getActorId(interactionOrMsg));
}

function canUseJail(interactionOrMsg) {
  return JAIL_PERMISSION_USERS.includes(getActorId(interactionOrMsg)) ||
    Boolean(interactionOrMsg?.member?.roles?.cache?.has(JAIL_ROLE_ID));
}

// === إدارة بيانات No-Back ===
const savedNoBack = readJson(NO_BACK_FILE, { enabled: true, users: {} });
let noBackEnabled = savedNoBack?.enabled !== false;
const noBackUsers = new Map();

if (savedNoBack?.users && typeof savedNoBack.users === "object") {
  for (const [id, addedBy] of Object.entries(savedNoBack.users)) {
    if (isValidId(id)) noBackUsers.set(id, String(addedBy || "system"));
  }
}

function saveNoBack() {
  writeJson(NO_BACK_FILE, { enabled: noBackEnabled, users: Object.fromEntries(noBackUsers) });
}

let updatingNoBackMessage = false;
async function updateNoBackMessage() {
  if (updatingNoBackMessage) return;
  updatingNoBackMessage = true;
  try {
    const channel = await client.channels.fetch(NO_BACK_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased() || typeof channel.send !== "function") return;

    const userIds = [...noBackUsers.keys()];
    const listText = userIds.length === 0 
      ? "📋 قائمة No-Back فارغة حاليًا." 
      : userIds.map(id => `• <@${id}>`).join("\n");

    const payload = {
      embeds: [
        new EmbedBuilder()
          .setColor(0x626367)
          .setTitle("📋 قائمة No-Back")
          .setDescription(listText.length > 4096 ? `${listText.slice(0, 4050)}\n… توجد أسماء إضافية.` : listText)
          .setFooter({ text: `العدد: ${userIds.length}` })
      ],
      allowedMentions: { users: userIds.slice(0, 100) }
    };

    const msgData = readJson(NO_BACK_MESSAGE_FILE, {});
    let msg = typeof msgData?.messageId === "string" ? await channel.messages.fetch(msgData.messageId).catch(() => null) : null;

    if (msg && msg.author?.id === client.user?.id) {
      await msg.edit(payload);
    } else {
      msg = await channel.send(payload);
      writeJson(NO_BACK_MESSAGE_FILE, { messageId: msg.id });
    }
  } catch (err) {
    console.error("❌ تعذر تحديث قائمة No-Back:", err);
  } finally {
    updatingNoBackMessage = false;
  }
}

function getNoBackReason(addedBy) {
  if (addedBy === "260968942430846977") return "No-Back System Restriction";
  if (addedBy === "1518574556787249177") return "lbnani say no";
  if (addedBy === "1496923040985124905") return "Abu Khalid say no";
  if (addedBy === "1422526730035396659") return "Saud say no";
  return "نظام حماية No-Back";
}

async function addNoBackUser(guild, targetId, addedBy) {
  const reason = getNoBackReason(addedBy);
  noBackUsers.set(targetId, addedBy);
  saveNoBack();
  await updateNoBackMessage();

  try {
    await guild.members.ban(targetId, { reason });
    return `✅ تم حظر <@${targetId}> وإضافته إلى No-Back.\n📝 السبب: \`${reason}\``;
  } catch (err) {
    return `✅ تمت إضافة <@${targetId}> إلى No-Back، لكن تعذر حظره الآن.`;
  }
}

async function removeNoBackUser(targetId) {
  if (!noBackUsers.has(targetId)) return "⚠️ الشخص غير موجود في قائمة No-Back.";
  noBackUsers.delete(targetId);
  saveNoBack();
  await updateNoBackMessage();
  return `✅ تم إزالة <@${targetId}> من No-Back.`;
}

function getNoBackListText() {
  if (noBackUsers.size === 0) return "📋 قائمة No-Back فارغة حاليًا.";
  return `📋 **قائمة No-Back (${noBackUsers.size}):**\n` + [...noBackUsers.keys()].map(id => `• <@${id}> (${id})`).join("\n");
}

// === أوامر Slash Registration ===
const SLASH_COMMANDS = [
  { name: "noback", description: "إدارة قائمة No-Back", options: [
    { type: 1, name: "add", description: "إضافة عضو", options: [{ type: 6, name: "user", description: "اختر العضو", required: true }] },
    { type: 1, name: "remove", description: "إزالة عضو", options: [{ type: 6, name: "user", description: "اختر العضو", required: true }] },
    { type: 1, name: "list", description: "عرض القائمة" }
  ]},
  { name: "noback_protection", description: "تفعيل أو تعطيل حماية No-Back", options: [
    { type: 3, name: "mode", description: "الحالة", required: true, choices: [{ name: "on", value: "on" }, { name: "off", value: "off" }] }
  ]}
];

const SLASH_PERMISSION_MAP = {
  noback: NO_BACK_PERMISSION_USERS,
  noback_protection: NO_BACK_PERMISSION_USERS
};

async function registerSlashCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    const data = await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: SLASH_COMMANDS }
    );
    console.log(`✅ تم تسجيل ${data.length} أمر Slash بنجاح.`);
  } catch (err) {
    console.error("❌ تعذر تسجيل أوامر Slash:", err);
  }
}

// === الأحداث والتشغيل ===
client.once("ready", async () => {
  console.log(`✅ البوت يعمل الآن باسم ${client.user.tag}`);
  console.log(`📌 السيرفر: ${GUILD_ID}`);
  await registerSlashCommands();
  await updateNoBackMessage();
});

// حماية حظر No-Back فور الدخول
client.on("guildMemberAdd", async (member) => {
  if (!noBackEnabled) return;
  if (noBackUsers.has(member.id)) {
    const addedBy = noBackUsers.get(member.id);
    const reason = getNoBackReason(addedBy);
    try {
      await member.ban({ reason });
      console.log(`🛡️ تم طرد/حظر <@${member.id}> تلقائياً بسبب تفعيل نظام No-Back.`);
    } catch (err) {
      console.error(`❌ تعذر حظر العضو المحظور بـ No-Back عند دخوله: ${member.id}`, err);
    }
  }
});

// معالجة الأوامر النصية (!noback)
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  if (command === "!noback") {
    if (!canManageNoBack(message)) {
      return message.reply("❌ ليس لديك صلاحية استخدام هذا الأمر.");
    }

    const subCommand = args[1]?.toLowerCase();
    const targetMention = args[2] || args[1];
    const targetId = targetMention?.replace(/[<@!>]/g, "");

    if (subCommand === "list" || !subCommand) {
      return message.reply(getNoBackListText());
    }

    if (subCommand === "remove") {
      if (!isValidId(targetId)) return message.reply("⚠️ يرجى تحديد ID أو منشن صحيح.");
      const res = await removeNoBackUser(targetId);
      return message.reply(res);
    }

    // إضافة افتراضية لو تم كتابة ID مباشرة (!noback <ID>) أو (!noback add <ID>)
    const finalTargetId = isValidId(targetId) ? targetId : (isValidId(subCommand) ? subCommand : null);
    if (!finalTargetId) {
      return message.reply("⚠️ الاستخدام الصحيح:\n`!noback <ID>`\n`!noback list`\n`!noback remove <ID>`");
    }

    const res = await addNoBackUser(message.guild, finalTargetId, message.author.id);
    return message.reply(res);
  }
});

// معالجة أجزاء السلاش (/noback)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "noback") {
    if (!canManageNoBack(interaction)) {
      return interaction.reply({ content: "❌ ليس لديك صلاحية استخدام هذا الأمر.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      return interaction.reply({ content: getNoBackListText(), ephemeral: true });
    }

    const targetUser = interaction.options.getUser("user", true);

    if (sub === "add") {
      const res = await addNoBackUser(interaction.guild, targetUser.id, interaction.user.id);
      return interaction.reply({ content: res, ephemeral: true });
    }

    if (sub === "remove") {
      const res = await removeNoBackUser(targetUser.id);
      return interaction.reply({ content: res, ephemeral: true });
    }
  }

  if (commandName === "noback_protection") {
    if (!canManageNoBack(interaction)) {
      return interaction.reply({ content: "❌ ليس لديك صلاحية استخدام هذا الأمر.", ephemeral: true });
    }
    const mode = interaction.options.getString("mode", true);
    noBackEnabled = mode === "on";
    saveNoBack();
    return interaction.reply({ content: `✅ تم ${noBackEnabled ? "تفعيل" : "تعطيل"} نظام No-Back.`, ephemeral: true });
  }
});

client.login(TOKEN);
