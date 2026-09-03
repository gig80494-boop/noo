require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require('discord.js');

if (!process.env.DISCORD_TOKEN) {
  throw new Error('ضع DISCORD_TOKEN داخل ملف .env');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// قائمة المسموح لهم باستخدام الأوامر العامة
const ALLOWED_USERS = [
  '1518574556787249177',
  '1496923040985124905',
  '1422526730035396659'
];

// قائمة المسموح لهم حصراً باستخدام أمر kickvoice (محددة بالضبط بالأرقام المطلوب)
const KICKVOICE_ALLOWED_USERS = [
  '1518574556787249177',
  '1496923040985124905',
  '1422526730035396659'
];

function getBanReason(executorId) {
  if (executorId === '1518574556787249177') return 'lbnani say no';
  if (executorId === '1496923040985124905') return 'Abu Khalid say no';
  if (executorId === '1422526730035396659') return 'Saud say no';
  return 'نظام حماية النوباك (No-Back)';
}

// --- إعدادات وتخزين بيانات النوباك ---
const dataFile = path.join(__dirname, 'noback.json');
let noBackList = new Map();
let isNoBackEnabled = true;

try {
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

    if (data.users && typeof data.users === 'object' && !Array.isArray(data.users)) {
      noBackList = new Map(Object.entries(data.users));
    } else if (Array.isArray(data.users)) {
      data.users.forEach(id => noBackList.set(id, 'system'));
    } else if (Array.isArray(data)) {
      data.forEach(id => noBackList.set(id, 'system'));
    }

    if (typeof data.enabled === 'boolean') {
      isNoBackEnabled = data.enabled;
    }
  }
} catch (error) {
  console.error('تعذر تحميل بيانات النوباك:', error);
}

function saveData() {
  fs.writeFileSync(
    dataFile,
    JSON.stringify(
      {
        enabled: isNoBackEnabled,
        users: Object.fromEntries(noBackList)
      },
      null,
      2
    ),
    'utf8'
  );
}

// --- إعدادات وتخزين قائمة الممنوعين من الفويس ---
const voiceBlockFile = path.join(__dirname, 'voiceblock.json');
let voiceBlockList = new Set();

try {
  if (fs.existsSync(voiceBlockFile)) {
    const data = JSON.parse(fs.readFileSync(voiceBlockFile, 'utf8'));
    if (Array.isArray(data)) {
      voiceBlockList = new Set(data);
    }
  }
} catch (error) {
  console.error('تعذر تحميل بيانات الممنوعين من الفويس:', error);
}

function saveVoiceBlockData() {
  fs.writeFileSync(
    voiceBlockFile,
    JSON.stringify([...voiceBlockList], null, 2),
    'utf8'
  );
}

function isAllowed(message) {
  return (
    ALLOWED_USERS.includes(message.author.id) ||
    message.member?.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

// تحقق خاص لأمر kickvoice حصراً للأشخاص المحددين فقط
function isKickVoiceAllowed(message) {
  return KICKVOICE_ALLOWED_USERS.includes(message.author.id);
}

client.once('ready', () => {
  console.log(`✅ تم تشغيل البوت باسم: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  // --- 1. أمر المنع والتأفيك من الفويس (kickvoice / kv) ---
  if (command === '!kickvoice' || command === '!kv') {
    // التأكد من أن الشخص من ضمن الأيدي القليلة المحددة حصراً
    if (!isKickVoiceAllowed(message)) {
      return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    const userId = args[1]?.replace(/[<@!>]/g, '');

    if (!/^\d+$/.test(userId || '')) {
      return message.reply(':warning: يرجى كتابة الـ ID الصحيح أو المنشن. مثال: `!kickvoice 123456789`');
    }

    if (voiceBlockList.has(userId)) {
      return message.reply('⚠️ هذا الشخص محظور بالفعل من دخول الرومات الصوتية.');
    }

    voiceBlockList.add(userId);
    saveVoiceBlockData();

    // إذا كان الشخص في روم صوتي حالياً يتم إخراجه فوراً
    try {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member && member.voice.channel) {
        await member.voice.disconnect('ممنوع من دخول الرومات الصوتية (Kick Voice)');
        return message.reply(`✅ تم طرد <@${userId}> من الفويس وإضافته لقائمة المنع من الدخول.`);
      }
    } catch (err) {
      console.error(err);
    }

    return message.reply(`✅ تم إضافة <@${userId}> لقائمة المنع من الفويس.`);
  }

  // إزالة شخص من قائمة منع الفويس
  if (command === '!unkickvoice' || command === '!unkv') {
    if (!isKickVoiceAllowed(message)) {
      return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    const userId = args[1]?.replace(/[<@!>]/g, '');

    if (!/^\d+$/.test(userId || '')) {
      return message.reply(':warning: يرجى كتابة الـ ID الصحيح.');
    }

    if (!voiceBlockList.has(userId)) {
      return message.reply('⚠️ هذا الشخص غير موجود في قائمة المنع من الفويس.');
    }

    voiceBlockList.delete(userId);
    saveVoiceBlockData();
    return message.reply(`✅ تم إزالة <@${userId}> من قائمة المنع ويمكنه الدخول للفويس الآن.`);
  }

  // عرض قائمة المحظورين من الفويس
  if (command === '!kvlist') {
    if (!isKickVoiceAllowed(message)) {
      return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    if (voiceBlockList.size === 0) {
      return message.reply('📋 قائمة الممنوعين من الفويس فارغة حالياً.');
    }

    const list = [...voiceBlockList]
      .map(id => `- <@${id}> (${id})`)
      .join('\n');

    return message.reply(`📋 **قائمة الممنوعين من الفويس (${voiceBlockList.size}):**\n${list}`);
  }

  // --- 2. الأوامر الأخرى (!noback / !noback_protection) ---
  if (command !== '!noback' && command !== '!noback_protection') {
    return;
  }

  if (!isAllowed(message)) {
    return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
  }

  // معالجة أمر !noback
  if (command === '!noback') {
    const action = args[1]?.toLowerCase();

    if (action === 'list') {
      if (noBackList.size === 0) {
        return message.reply(':clipboard: قائمة النوباك فارغة حالياً.');
      }

      const list = [...noBackList.keys()]
        .map(id => `- <@${id}> (${id})`)
        .join('\n');

      return message.reply(
        `📋 **قائمة المحظورين نوباك (${noBackList.size}):**\n${list}`
      );
    }

    if (action === 'removed' || action === 'remove') {
      const userId = args[2];

      if (!/^\d+$/.test(userId || '')) {
        return message.reply(':warning: يرجى كتابة الـ ID الصحيح.');
      }

      if (!noBackList.has(userId)) {
        return message.reply(':warning: غلطان يالاخو.');
      }

      noBackList.delete(userId);
      saveData();
      return message.reply(`✅ تم إزالة <@${userId}> انفك النوباك.`);
    }

    const userId = args[1];

    if (!/^\d+$/.test(userId || '')) {
      return message.reply(
        ':warning: يرجى كتابة الـ ID الصحيح للطرف المستهدف.'
      );
    }

    const executorId = message.author.id;
    const banReason = getBanReason(executorId);

    noBackList.set(userId, executorId);
    saveData();

    try {
      await message.guild.members.ban(userId, {
        reason: banReason
      });

      return message.reply(`✅ <@${userId}> تم شقه بنجاح.\n📝 السبب: \`${banReason}\``);
    } catch (error) {
      console.error(error);
      return message.reply(
        `✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً (تأكد من وجود البوت فوق رتبته أو تمتعه بصلاحية Ban Members).`
      );
    }
  }

  // معالجة أمر !noback_protection
  if (command === '!noback_protection') {
    const status = args[1]?.toLowerCase();

    if (status === 'on') {
      isNoBackEnabled = true;
      saveData();
      return message.reply(':green_circle: تم تفعيل نظام النوباك.');
    }

    if (status === 'off') {
      isNoBackEnabled = false;
      saveData();
      return message.reply(':red_circle: تم إيقاف نظام النوباك.');
    }

    return message.reply(
      `⚠️ الحالة الحالية للنظام: **${
        isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'
      }**\nاستخدم \`!noback_protection on\` أو \`off\`.`
    );
  }
});

// طرد التلقائي للشخص فور محاولته دخول أي روم صوتي
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (newState.channelId && voiceBlockList.has(newState.id)) {
    try {
      await newState.disconnect('ممنوع من دخول الرومات الصوتية (Kick Voice)');
      console.log(`[KickVoice] تم طرد ${newState.id} تلقائياً عند دخوله الروم.`);
    } catch (error) {
      console.error(`[KickVoice] تعذر طرد العضو ${newState.id}:`, error);
    }
  }
});

// إعادة الحظر التلقائي بنفس السبب المخزن للآيدي صاحب الأمر
client.on('guildBanRemove', async (ban) => {
    if (!isNoBackEnabled || !noBackList.has(ban.user.id)) return;

    const executorId = noBackList.get(ban.user.id);
    const banReason = getBanReason(executorId);

    try {
        await ban.guild.bans.create(ban.user.id, {
            reason: `حظر دائم - ${banReason}`
        });
    } catch (error) {
        console.error('[No-Back] يتعذر إعادة الحظر:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
