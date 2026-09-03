require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  AuditLogEvent
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

// قائمة الحسابات المسموح لها (تم تحويلها إلى متغيرات قابلة للتعديل عند التصفير)
let PANEL_ALLOWED_USERS = [
  '1496923040985124905',
  '1518574556787249177',
  '1422526730035396659',
  '1323373154919252108'
];

let ALLOWED_USERS = [
  '1518574556787249177',
  '1496923040985124905',
  '1422526730035396659',
  '1323373154919252108'
];

let KICKVOICE_ALLOWED_USERS = [
  '1518574556787249177',
  '1496923040985124905',
  '1422526730035396659',
  '1323373154919252108'
];

function getBanReason(executorId) {
  if (executorId === '1518574556787249177') return 'lbnani say no';
  if (executorId === '1496923040985124905') return 'Abu Khalid say no';
  if (executorId === '1422526730035396659') return 'Saud say no';
  return 'نظام حماية No-Back';
}

// ملفات حفظ البيانات
const voiceBlockFile = path.join(__dirname, 'voiceblock.json');
let voiceBlockList = new Set();

try {
  if (fs.existsSync(voiceBlockFile)) {
    const data = JSON.parse(fs.readFileSync(voiceBlockFile, 'utf8'));
    if (Array.isArray(data)) voiceBlockList = new Set(data);
  } else {
    fs.writeFileSync(voiceBlockFile, '[]', 'utf8');
  }
} catch (error) {
  console.error('تعذر تحميل بيانات الممنوعين من الفويس:', error);
}

function saveVoiceBlockData() {
  fs.writeFileSync(voiceBlockFile, JSON.stringify([...voiceBlockList], null, 2), 'utf8');
}

const dataFile = path.join(__dirname, 'noback.json');
let noBackList = new Map();
let isNoBackEnabled = true;

// خريطة لتتبع عدد مرات فك الحظر بواسطة كل إداري { userId: count }
const unbanViolations = new Map();

try {
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (data.users && typeof data.users === 'object' && !Array.isArray(data.users)) {
      noBackList = new Map(Object.entries(data.users));
    }
    if (typeof data.enabled === 'boolean') isNoBackEnabled = data.enabled;
  }
} catch (error) {
  console.error('تعذر تحميل بيانات No-Back:', error);
}

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify({ enabled: isNoBackEnabled, users: Object.fromEntries(noBackList) }, null, 2), 'utf8');
}

function isAllowed(message) {
  return ALLOWED_USERS.includes(message.author.id) || message.member?.permissions.has(PermissionsBitField.Flags.Administrator);
}

function isKickVoiceAllowed(message) {
  return KICKVOICE_ALLOWED_USERS.includes(message.author.id);
}

client.once('ready', () => {
  console.log(`✅ تم تشغيل البوت باسم: ${client.user.tag}`);
});

// التعامل مع الرسائل والأوامر الكتابية
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  // أمر استدعاء لوحة القوائم التفاعلية
  if (command === '!panel' || command === '!menu') {
    if (!PANEL_ALLOWED_USERS.includes(message.author.id)) {
      return message.reply(':x: ليس لديك صلاحية لاستخدام لوحة القوائم.');
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_select')
      .setPlaceholder('اختر الإجراء المطلـوب من القائمة...')
      .addOptions([
        { label: 'إضافة شخص إلى Black Voice (منع الفويس)', value: 'action_bv_add', emoji: '🎙️' },
        { label: 'إزالة شخص من Black Voice', value: 'action_bv_remove', emoji: '🔊' },
        { label: 'عرض قائمة الممنوعين من الفويس', value: 'action_bv_list', emoji: '📋' },
        { label: 'إضافة شخص إلى نظام No-Back (حظر دائم)', value: 'action_noback_add', emoji: '⛔' },
        { label: 'إزالة شخص من نظام No-Back', value: 'action_noback_remove', emoji: '🟢' },
        { label: 'عرض قائمة المحظورين بنظام No-Back', value: 'action_noback_list', emoji: '📜' },
        { label: 'تغيير حالة حماية No-Back (تشغيل / إيقاف)', value: 'action_noback_toggle', emoji: '⚙️' }
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return message.reply({
      content: '⚙️ **لوحة التحكم التفاعلية بالأوامر:**\nاختر العملية التي تريد تنفيذها دون الحاجة لكتابة أي أمر:',
      components: [row]
    });
  }

  // الأوامر الكتابية العادية
  if (command === '!blackvoice' || command === '!bv') {
    if (!isKickVoiceAllowed(message)) return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    const userId = args[1]?.replace(/[<@!>]/g, '');
    if (!/^\d+$/.test(userId || '')) return message.reply(':warning: يرجى كتابة الـ ID الصحيح أو المنشن.');
    if (voiceBlockList.has(userId)) return message.reply('⚠️ هذا الشخص محظور بالفعل من دخول الرومات الصوتية.');

    voiceBlockList.add(userId);
    saveVoiceBlockData();

    try {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member?.voice.channel) {
        await member.voice.disconnect('ممنوع من دخول الرومات الصوتية (Black Voice)');
        return message.reply(`✅ تم طرد <@${userId}> من الفويس وإضافته لقائمة المنع.`);
      }
    } catch (e) {}

    return message.reply(`✅ تم إضافة <@${userId}> لقائمة المنع من الفويس.`);
  }

  if (command === '!unblackvoice' || command === '!unbv') {
    if (!isKickVoiceAllowed(message)) return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    const userId = args[1]?.replace(/[<@!>]/g, '');
    if (!/^\d+$/.test(userId || '')) return message.reply(':warning: يرجى كتابة الـ ID الصحيح.');
    if (!voiceBlockList.has(userId)) return message.reply('⚠️ هذا الشخص غير موجود في قائمة المنع من الفويس.');

    voiceBlockList.delete(userId);
    saveVoiceBlockData();
    return message.reply(`✅ تم إزالة <@${userId}> من قائمة المنع.`);
  }

  if (command === '!bvlist') {
    if (!isKickVoiceAllowed(message)) return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    if (voiceBlockList.size === 0) return message.reply('📋 قائمة الممنوعين من الفويس فارغة حالياً.');
    const list = [...voiceBlockList].map(id => `- <@${id}> (${id})`).join('\n');
    return message.reply(`📋 **قائمة الممنوعين من الفويس (${voiceBlockList.size}):**\n${list}`);
  }

  if (command === '!noback') {
    if (!isAllowed(message)) return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    const action = args[1]?.toLowerCase();

    if (action === 'list') {
      if (noBackList.size === 0) return message.reply(':clipboard: قائمة No-Back فارغة حالياً.');
      const list = [...noBackList.keys()].map(id => `- <@${id}> (${id})`).join('\n');
      return message.reply(`📋 **قائمة المحظورين No-Back (${noBackList.size}):**\n${list}`);
    }

    if (action === 'remove') {
      const userId = args[2];
      if (!/^\d+$/.test(userId || '')) return message.reply(':warning: يرجى كتابة الـ ID الصحيح.');
      if (!noBackList.has(userId)) return message.reply(':warning: غلطان يالاخو.');

      noBackList.delete(userId);
      saveData();
      return message.reply(`✅ تم إزالة <@${userId}> انفك الـ No-Back.`);
    }

    const userId = args[1];
    if (!/^\d+$/.test(userId || '')) return message.reply(':warning: يرجى كتابة الـ ID الصحيح للطرف المستهدف.');

    const executorId = message.author.id;
    const banReason = getBanReason(executorId);

    noBackList.set(userId, executorId);
    saveData();

    try {
      await message.guild.members.ban(userId, { reason: banReason });
      return message.reply(`✅ <@${userId}> تم شقه بنجاح.\n📝 السبب: \`${banReason}\``);
    } catch (error) {
      return message.reply(`✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً.`);
    }
  }

  if (command === '!noback_protection') {
    if (!isAllowed(message)) return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    const status = args[1]?.toLowerCase();
    if (status === 'on') {
      isNoBackEnabled = true;
      saveData();
      return message.reply(':green_circle: تم تفعيل نظام No-Back.');
    }
    if (status === 'off') {
      isNoBackEnabled = false;
      saveData();
      return message.reply(':red_circle: تم إيقاف نظام No-Back.');
    }
    return message.reply(`⚠️ الحالة الحالية للنظام: **${isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'}**`);
  }
});

// التعامل مع القوائم المنسدلة
client.on('interactionCreate', async interaction => {
  if (!PANEL_ALLOWED_USERS.includes(interaction.user.id)) {
    return interaction.reply({ content: ':x: ليس لديك صلاحية لاستخدام لوحة القوائم.', ephemeral: true });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'panel_select') {
    const selected = interaction.values[0];

    if (selected === 'action_bv_add') {
      const modal = new ModalBuilder().setCustomId('modal_bv_add').setTitle('إضافة شخص إلى Black Voice');
      const input = new TextInputBuilder().setCustomId('target_id').setLabel('أدخل ID الشخص أو المنشن:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (selected === 'action_bv_remove') {
      const modal = new ModalBuilder().setCustomId('modal_bv_remove').setTitle('إزالة شخص من Black Voice');
      const input = new TextInputBuilder().setCustomId('target_id').setLabel('أدخل ID الشخص:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (selected === 'action_bv_list') {
      if (voiceBlockList.size === 0) return interaction.reply({ content: '📋 قائمة الممنوعين من الفويس فارغة حالياً.', ephemeral: true });
      const list = [...voiceBlockList].map(id => `- <@${id}> (${id})`).join('\n');
      return interaction.reply({ content: `📋 **قائمة الممنوعين من الفويس (${voiceBlockList.size}):**\n${list}`, ephemeral: true });
    }

    if (selected === 'action_noback_add') {
      const modal = new ModalBuilder().setCustomId('modal_noback_add').setTitle('إضافة شخص ونظامه إلى No-Back');
      const input = new TextInputBuilder().setCustomId('target_id').setLabel('أدخل ID الشخص المستهدف:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (selected === 'action_noback_remove') {
      const modal = new ModalBuilder().setCustomId('modal_noback_remove').setTitle('إزالة شخص من نظام No-Back');
      const input = new TextInputBuilder().setCustomId('target_id').setLabel('أدخل ID الشخص:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (selected === 'action_noback_list') {
      if (noBackList.size === 0) return interaction.reply({ content: ':clipboard: قائمة No-Back فارغة حالياً.', ephemeral: true });
      const list = [...noBackList.keys()].map(id => `- <@${id}> (${id})`).join('\n');
      return interaction.reply({ content: `📋 **قائمة المحظورين No-Back (${noBackList.size}):**\n${list}`, ephemeral: true });
    }

    if (selected === 'action_noback_toggle') {
      isNoBackEnabled = !isNoBackEnabled;
      saveData();
      return interaction.reply({ content: `✅ تم تغيير حالة حماية No-Back إلى: **${isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'}**`, ephemeral: true });
    }
  }

  if (interaction.isModalSubmit()) {
    const rawInput = interaction.fields.getTextInputValue('target_id');
    const userId = rawInput?.replace(/[<@!>]/g, '');

    if (!/^\d+$/.test(userId || '')) {
      return interaction.reply({ content: ':warning: يرجى كتابة الـ ID بشكل صحيح.', ephemeral: true });
    }

    if (interaction.customId === 'modal_bv_add') {
      if (voiceBlockList.has(userId)) return interaction.reply({ content: '⚠️ هذا الشخص محظور بالفعل من دخول الرومات الصوتية.', ephemeral: true });
      voiceBlockList.add(userId);
      saveVoiceBlockData();

      try {
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (member?.voice.channel) {
          await member.voice.disconnect('ممنوع من دخول الرومات الصوتية (Black Voice)');
          return interaction.reply({ content: `✅ تم طرد <@${userId}> من الفويس وإضافته لقائمة المنع.` });
        }
      } catch (e) {}

      return interaction.reply({ content: `✅ تم إضافة <@${userId}> لقائمة المنع من الفويس.` });
    }

    if (interaction.customId === 'modal_bv_remove') {
      if (!voiceBlockList.has(userId)) return interaction.reply({ content: '⚠️ هذا الشخص غير موجود في قائمة المنع من الفويس.', ephemeral: true });
      voiceBlockList.delete(userId);
      saveVoiceBlockData();
      return interaction.reply({ content: `✅ تم إزالة <@${userId}> من قائمة المنع من الفويس.` });
    }

    if (interaction.customId === 'modal_noback_add') {
      const executorId = interaction.user.id;
      const banReason = getBanReason(executorId);

      noBackList.set(userId, executorId);
      saveData();

      try {
        await interaction.guild.members.ban(userId, { reason: banReason });
        return interaction.reply({ content: `✅ <@${userId}> تم شقه بنجاح.\n📝 السبب: \`${banReason}\`` });
      } catch (error) {
        return interaction.reply({ content: `✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً.` });
      }
    }

    if (interaction.customId === 'modal_noback_remove') {
      if (!noBackList.has(userId)) return interaction.reply({ content: ':warning: غلطان يالاخو، الشخص ليس في القائمة.', ephemeral: true });
      noBackList.delete(userId);
      saveData();
      return interaction.reply({ content: `✅ تم إزالة <@${userId}> انفك الـ No-Back.` });
    }
  }
});

// طرد الشخص تلقائياً عند محاولته دخول روم صوتي
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (newState.channelId && voiceBlockList.has(newState.id)) {
    try {
      await newState.disconnect('ممنوع من دخول الرومات الصوتية (Black Voice)');
      console.log(`[BlackVoice] تم طرد ${newState.id} تلقائياً عند دخوله الروم.`);
    } catch (error) {
      console.error(`[BlackVoice] تعذر طرد العضو ${newState.id}:`, error);
    }
  }
});

// إعادة الحظر التلقائي ومعاقبة وتصفير الإداري عند فك الحظر مرتين
client.on('guildBanRemove', async ban => {
  if (!isNoBackEnabled || !noBackList.has(ban.user.id)) return;

  const originalExecutorId = noBackList.get(ban.user.id);
  const banReason = getBanReason(originalExecutorId);

  // إعادة حظر الشخص الممنوع من العودة تلقائياً
  try {
    await ban.guild.bans.create(ban.user.id, {
      reason: `حظر دائم - ${banReason}`
    });
  } catch (error) {
    console.error('[No-Back] يتعذر إعادة الحظر:', error);
  }

  // البحث عن الإداري الذي قام بفك الحظر من Audit Logs
  try {
    const fetchedLogs = await ban.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberBanRemove
    });
    const banLog = fetchedLogs.entries.first();

    if (banLog && banLog.target.id === ban.user.id) {
      const adminId = banLog.executor.id;

      // زيادات عداد المخالفات للإداري
      const currentViolations = (unbanViolations.get(adminId) || 0) + 1;
      unbanViolations.set(adminId, currentViolations);

      console.log(`⚠️ الإداري ${adminId} قام بفك حظر عضو No-Back. عدد المرات: ${currentViolations}`);

      // إذا وصل لمرتين يتم "تصفيره" (سحب جميع صلاحياته من البوت)
      if (currentViolations >= 2) {
        PANEL_ALLOWED_USERS = PANEL_ALLOWED_USERS.filter(id => id !== adminId);
        ALLOWED_USERS = ALLOWED_USERS.filter(id => id !== adminId);
        KICKVOICE_ALLOWED_USERS = KICKVOICE_ALLOWED_USERS.filter(id => id !== adminId);

        console.log(`🚨 تم تصفير وسحب كافة صلاحيات الإداري (${adminId}) لتجاوزه حد فك حظر No-Back (مرتين).`);
      }
    }
  } catch (err) {
    console.error('تعذر جلب سجّلات Audit Log لقراءة المسؤول عن فك الحظر:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
