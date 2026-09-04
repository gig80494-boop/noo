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
  ButtonStyle
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

// الحسابات المسموح لها باستخدام لوحة القوائم التفاعلية
const PANEL_ALLOWED_USERS = [
  '1496923040985124905',
  '1518574556787249177',
  '1422526730035396659'
];

const ALLOWED_USERS = [
  '1518574556787249177',
  '1496923040985124905',
  '1422526730035396659',
  '1323373154919252108'
];

const KICKVOICE_ALLOWED_USERS = [
  '1518574556787249177',
  '1496923040985124905',
  '1422526730035396659',
  '1323373154919252108'
];

// activeSpams: userId => { interval, channelId, text }
const activeSpams = new Map();
const ID_PATTERN = /^\d+$/;

function cleanId(value) {
  return value?.replace(/[<@!>]/g, '');
}

function startSpam(userId, channel, text) {
  const interval = setInterval(async () => {
    try {
      if (!channel?.isTextBased()) return;

      await channel.send({
        content: `<@${userId}> ${text}`,
        allowedMentions: { users: [userId] }
      });
    } catch (error) {
      console.error('فشل إرسال رسالة السبام:', error);
    }
  }, 1500);

  activeSpams.set(userId, { interval, channelId: channel.id, text });
}

function stopSpam(userId) {
  const spam = activeSpams.get(userId);
  if (!spam) return false;

  clearInterval(spam.interval);
  activeSpams.delete(userId);
  return true;
}

// إعدادات قائمة الرتب التي لديها صلاحية Administrator
const STREETER_GUILD_ID = '1500918222378106901';
const STREETER_CHANNEL_ID = '1545389147911626772';
const STREETER_MESSAGE_FILE = path.join(__dirname, 'streeter-list.json');
let streeterListMessageId = null;

try {
  if (fs.existsSync(STREETER_MESSAGE_FILE)) {
    const data = JSON.parse(
      fs.readFileSync(STREETER_MESSAGE_FILE, 'utf8')
    );
    if (typeof data.messageId === 'string') {
      streeterListMessageId = data.messageId;
    }
  }
} catch (error) {
  console.error('تعذر تحميل رسالة قائمة الستريتر:', error);
}

function saveStreeterMessageId(messageId) {
  fs.writeFileSync(
    STREETER_MESSAGE_FILE,
    JSON.stringify({ messageId }, null, 2),
    'utf8'
  );
  streeterListMessageId = messageId;
}

function getStreeterRoles(guild) {
  return [...guild.roles.cache.values()]
    .filter(
      role =>
        !role.managed &&
        role.permissions.has(
          PermissionsBitField.Flags.Administrator
        )
    )
    .sort((a, b) => b.position - a.position);
}

function getStreeterListContent(roles) {
  if (roles.length === 0) {
    return '📋 لا توجد رتب لديها صلاحية Administrator حالياً.';
  }

  return [
    '📋 **قائمة الرتب التي لديها صلاحية Administrator:**',
    ...roles.map(role => `- <@&${role.id}> — ${role.name}`)
  ].join('\n');
}

async function updateStreeterList(guild, newRole = null) {
  if (guild.id !== STREETER_GUILD_ID) return;

  const channel = await guild.channels
    .fetch(STREETER_CHANNEL_ID)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    console.error('روم قائمة الستريتر غير موجود أو ليس رومًا كتابيًا.');
    return;
  }

  const roles = getStreeterRoles(guild);
  const content = getStreeterListContent(roles);
  const allowedRoleMentions = roles.map(role => role.id);
  let listMessage = null;

  if (streeterListMessageId) {
    listMessage = await channel.messages
      .fetch(streeterListMessageId)
      .catch(() => null);
  }

  if (listMessage && listMessage.author.id === client.user.id) {
    await listMessage.edit({
      content,
      allowedMentions: {
        roles: allowedRoleMentions
      }
    });
  } else {
    listMessage = await channel.send({
      content,
      allowedMentions: {
        roles: allowedRoleMentions
      }
    });
    saveStreeterMessageId(listMessage.id);
  }

  if (newRole) {
    await channel.send({
      content: `📢 تمت إضافة رتبة جديدة بصلاحية Administrator إلى القائمة: <@&${newRole.id}>`,
      allowedMentions: {
        roles: [newRole.id]
      }
    });
  }
}

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
  fs.writeFileSync(
    voiceBlockFile,
    JSON.stringify([...voiceBlockList], null, 2),
    'utf8'
  );
}

const dataFile = path.join(__dirname, 'noback.json');
let noBackList = new Map();
let isNoBackEnabled = true;

try {
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

    if (
      data.users &&
      typeof data.users === 'object' &&
      !Array.isArray(data.users)
    ) {
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
  console.error('تعذر تحميل بيانات No-Back:', error);
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

// إنشاء المكونات القائمة التفاعلية بعد إضافة خيارات السبام
function createPanelComponents() {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('panel_select')
    .setPlaceholder('اختر الإجراء المطلـوب من القائمة...')
    .addOptions([
      {
        label: 'بدء سبام منشن على شخص (Spam)',
        value: 'action_spam_add',
        emoji: '🔥'
      },
      {
        label: 'إيقاف السبام عن شخص (Unspam)',
        value: 'action_spam_remove',
        emoji: '🛑'
      },
      {
        label: 'عرض قائمة المزعج عليهم حالياً',
        value: 'action_spam_list',
        emoji: '🔔'
      },
      {
        label: 'إضافة شخص إلى Black Voice (منع الفويس)',
        value: 'action_bv_add',
        emoji: '🎙️'
      },
      {
        label: 'إزالة شخص من Black Voice',
        value: 'action_bv_remove',
        emoji: '🔊'
      },
      {
        label: 'عرض قائمة الممنوعين من الفويس',
        value: 'action_bv_list',
        emoji: '📋'
      },
      {
        label: 'إضافة شخص إلى نظام No-Back (حظر دائم)',
        value: 'action_noback_add',
        emoji: '⛔'
      },
      {
        label: 'إزالة شخص من نظام No-Back',
        value: 'action_noback_remove',
        emoji: '🟢'
      },
      {
        label: 'عرض قائمة المحظورين بنظام No-Back',
        value: 'action_noback_list',
        emoji: '📜'
      },
      {
        label: 'تغيير حالة حماية No-Back (تشغيل / إيقاف)',
        value: 'action_noback_toggle',
        emoji: '⚙️'
      }
    ]);

  const refreshButton = new ButtonBuilder()
    .setCustomId('panel_refresh')
    .setLabel('تحديث اللوحة 🔄')
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const row2 = new ActionRowBuilder().addComponents(refreshButton);

  return [row1, row2];
}

function showIdModal(interaction, customId, title, label) {
  const input = new TextInputBuilder()
    .setCustomId('target_id')
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  return interaction.showModal(
    new ModalBuilder()
      .setCustomId(customId)
      .setTitle(title)
      .addComponents(new ActionRowBuilder().addComponents(input))
  );
}

function showSpamModal(interaction) {
  const targetInput = new TextInputBuilder()
    .setCustomId('target_id')
    .setLabel('أدخل ID الشخص أو المنشن:')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const textInput = new TextInputBuilder()
    .setCustomId('spam_text')
    .setLabel('اكتب الرسالة التي تريد تكرارها:')
    .setPlaceholder('مثال: اطلع الخاص')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1900)
    .setRequired(true);

  return interaction.showModal(
    new ModalBuilder()
      .setCustomId('modal_spam_add')
      .setTitle('بدء سبام منشن على شخص')
      .addComponents(
        new ActionRowBuilder().addComponents(targetInput),
        new ActionRowBuilder().addComponents(textInput)
      )
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

function isKickVoiceAllowed(message) {
  return KICKVOICE_ALLOWED_USERS.includes(message.author.id);
}

client.once('ready', async () => {
  console.log(`✅ تم تشغيل البوت باسم: ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(STREETER_GUILD_ID);
    await guild.roles.fetch();
    await updateStreeterList(guild);
  } catch (error) {
    console.error('تعذر إرسال قائمة رتب Administrator:', error);
  }
});

// تحديث القائمة عند إنشاء رتبة جديدة لديها صلاحية Administrator
client.on('roleCreate', async role => {
  if (
    role.guild.id === STREETER_GUILD_ID &&
    role.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    await updateStreeterList(role.guild, role);
  }
});

// تحديث القائمة إذا تغيّرت صلاحيات رتبة أو تم حذف رتبة
client.on('roleUpdate', async (oldRole, newRole) => {
  if (newRole.guild.id !== STREETER_GUILD_ID) return;

  const oldHasAdministrator = oldRole.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
  const newHasAdministrator = newRole.permissions.has(
    PermissionsBitField.Flags.Administrator
  );

  if (oldHasAdministrator !== newHasAdministrator) {
    await updateStreeterList(newRole.guild);
  }
});

client.on('roleDelete', async role => {
  if (role.guild.id === STREETER_GUILD_ID) {
    await updateStreeterList(role.guild);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  // --- أوامر السبام النصية ---
  if (command === '!spam' || command === '!sp') {
    if (!isAllowed(message)) {
      return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    const userId = cleanId(args[1]);
    const spamText = args.slice(2).join(' ').trim();

    if (!ID_PATTERN.test(userId || '')) {
      return message.reply(':warning: يرجى تحديد الشخص عن طريق المنشن أو الـ ID.');
    }

    if (!spamText) {
      return message.reply(
        ':warning: اكتب الرسالة بعد الـ ID.\nمثال: `!spam 123456789 الرسالة المطلوبة`'
      );
    }

    if (spamText.length > 1900) {
      return message.reply(':warning: رسالة السبام لا يمكن أن تتجاوز 1900 حرف.');
    }

    if (activeSpams.has(userId)) {
      return message.reply('⚠️ هذا الشخص يتم إزعاجه حالياً بالفعل!');
    }

    await message.reply(`🔥 بدأ الإزعاج المستمر لـ <@${userId}>...`);
    startSpam(userId, message.channel, spamText);
    return;
  }

  if (command === '!unspam' || command === '!unsp') {
    if (!isAllowed(message)) {
      return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    const userId = cleanId(args[1]);

    if (!ID_PATTERN.test(userId || '')) {
      return message.reply(':warning: يرجى كتابة الـ ID أو منشن الشخص.');
    }

    if (!stopSpam(userId)) {
      return message.reply('⚠️ هذا الشخص ليس في قائمة الإزعاج.');
    }

    return message.reply(`✅ تم إيقاف الإزعاج عن <@${userId}>.`);
  }

  if (command === '!spamlist') {
    if (!isAllowed(message)) {
      return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    if (activeSpams.size === 0) {
      return message.reply('📋 لا يوجد أحد قيد الإزعاج حالياً.');
    }

    const list = [...activeSpams.keys()]
      .map(id => `- <@${id}> (${id})`)
      .join('\n');

    return message.reply(`📋 **قائمة المزعج عليهم حالياً (${activeSpams.size}):**\n${list}`);
  }

  if (command === '!send' || command === '!sendto' || command === '!say') {
    if (!isAllowed(message)) {
      return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    const channelId = args[1];
    const content = args.slice(2).join(' ').trim();

    if (!ID_PATTERN.test(channelId || '') || !content) {
      return message.reply(
        ':warning: الاستخدام الصحيح: `!send <channel_id> <النص>`'
      );
    }

    if (content.length > 2000) {
      return message.reply(':warning: الرسالة لا يمكن أن تتجاوز 2000 حرف.');
    }

    const channel = await message.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      return message.reply(':warning: لم أجد رومًا كتابيًا بهذا الـ ID.');
    }

    try {
      await channel.send({
        content,
        allowedMentions: { parse: [] }
      });
      return message.reply(`✅ تم إرسال الرسالة إلى الروم <#${channelId}>.`);
    } catch (error) {
      console.error('[Send] تعذر إرسال الرسالة:', error);
      return message.reply(
        ':x: تعذر الإرسال. تأكد أن البوت يملك صلاحية View Channel و Send Messages.'
      );
    }
  }

  if (command === '!panel' || command === '!menu') {
    if (!PANEL_ALLOWED_USERS.includes(message.author.id)) {
      return message.reply(
        ':x: ليس لديك صلاحية لاستخدام لوحة القوائم.'
      );
    }

    return message.reply({
      content:
        '⚙️ **لوحة التحكم التفاعلية بالأوامر:**\nاختر العملية التي تريد تنفيذها دون الحاجة لكتابة أي أمر:',
      components: createPanelComponents()
    });
  }

  if (command === '!blackvoice' || command === '!bv') {
    if (!isKickVoiceAllowed(message)) {
      return message.reply(
        ':x: ليس لديك صلاحية لاستخدام هذا الأمر.'
      );
    }

    const userId = cleanId(args[1]);

    if (!ID_PATTERN.test(userId || '')) {
      return message.reply(
        ':warning: يرجى كتابة الـ ID الصحيح أو المنشن.'
      );
    }

    if (voiceBlockList.has(userId)) {
      return message.reply(
        '⚠️ هذا الشخص محظور بالفعل من دخول الرومات الصوتية.'
      );
    }

    voiceBlockList.add(userId);
    saveVoiceBlockData();

    try {
      const member = await message.guild.members
        .fetch(userId)
        .catch(() => null);

      if (member?.voice.channel) {
        await member.voice.disconnect(
          'ممنوع من دخول الرومات الصوتية (Black Voice)'
        );

        return message.reply(
          `✅ تم طرد <@${userId}> من الفويس وإضافته لقائمة المنع.`
        );
      }
    } catch (error) {
      console.error('[BlackVoice] تعذر طرد العضو:', error);
    }

    return message.reply(
      `✅ تم إضافة <@${userId}> لقائمة المنع من الفويس.`
    );
  }

  if (command === '!unblackvoice' || command === '!unbv') {
    if (!isKickVoiceAllowed(message)) {
      return message.reply(
        ':x: ليس لديك صلاحية لاستخدام هذا الأمر.'
      );
    }

    const userId = cleanId(args[1]);

    if (!ID_PATTERN.test(userId || '')) {
      return message.reply(':warning: يرجى كتابة الـ ID الصحيح.');
    }

    if (!voiceBlockList.has(userId)) {
      return message.reply(
        '⚠️ هذا الشخص غير موجود في قائمة المنع من الفويس.'
      );
    }

    voiceBlockList.delete(userId);
    saveVoiceBlockData();

    return message.reply(
      `✅ تم إزالة <@${userId}> من قائمة المنع.`
    );
  }

  if (command === '!bvlist') {
    if (!isKickVoiceAllowed(message)) {
      return message.reply(
        ':x: ليس لديك صلاحية لاستخدام هذا الأمر.'
      );
    }

    if (voiceBlockList.size === 0) {
      return message.reply(
        '📋 قائمة الممنوعين من الفويس فارغة حالياً.'
      );
    }

    const list = [...voiceBlockList]
      .map(id => `- <@${id}> (${id})`)
      .join('\n');

    return message.reply(
      `📋 **قائمة الممنوعين من الفويس (${voiceBlockList.size}):**\n${list}`
    );
  }

  if (command === '!noback') {
    if (!isAllowed(message)) {
      return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    }

    const action = args[1]?.toLowerCase();

    if (action === 'list') {
      if (noBackList.size === 0) {
        return message.reply(
          ':clipboard: قائمة No-Back فارغة حالياً.'
        );
      }

      const list = [...noBackList.keys()]
        .map(id => `- <@${id}> (${id})`)
        .join('\n');

      return message.reply(
        `📋 **قائمة المحظورين No-Back (${noBackList.size}):**\n${list}`
      );
    }

    if (action === 'remove') {
      const userId = args[2];

      if (!ID_PATTERN.test(userId || '')) {
        return message.reply(
          ':warning: يرجى كتابة الـ ID الصحيح.'
        );
      }

      if (!noBackList.has(userId)) {
        return message.reply(':warning: غلطان يالاخو.');
      }

      noBackList.delete(userId);
      saveData();

      return message.reply(
        `✅ تم إزالة <@${userId}> انفك الـ No-Back.`
      );
    }

    const userId = args[1];

    if (!ID_PATTERN.test(userId || '')) {
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

      return message.reply(
        `✅ <@${userId}> تم شقه بنجاح.\n📝 السبب: \`${banReason}\``
      );
    } catch (error) {
      console.error(error);

      return message.reply(
        `✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً.`
      );
    }
  }

  if (command === '!noback_protection') {
    if (!isAllowed(message)) {
      return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    }

    const status = args[1]?.toLowerCase();

    if (status === 'on') {
      isNoBackEnabled = true;
      saveData();
      return message.reply(
        ':green_circle: تم تفعيل نظام No-Back.'
      );
    }

    if (status === 'off') {
      isNoBackEnabled = false;
      saveData();
      return message.reply(
        ':red_circle: تم إيقاف نظام No-Back.'
      );
    }

    return message.reply(
      `⚠️ الحالة الحالية للنظام: **${
        isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'
      }**`
    );
  }
});

// التعامل مع التفاعلات (Interactions) الخاصة القائمة التفاعلية (!menu / !panel)
client.on('interactionCreate', async interaction => {
  if (!PANEL_ALLOWED_USERS.includes(interaction.user.id)) {
    return interaction.reply({
      content: ':x: ليس لديك صلاحية لاستخدام لوحة القوائم.',
      ephemeral: true
    });
  }

  if (
    interaction.isButton() &&
    interaction.customId === 'panel_refresh'
  ) {
    return interaction.update({
      content:
        '⚙️ **لوحة التحكم التفاعلية بالأوامر:**\nاختر العملية التي تريد تنفيذها دون الحاجة لكتابة أي أمر:',
      components: createPanelComponents()
    });
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'panel_select'
  ) {
    const selected = interaction.values[0];

    // خيارات السبام القائمة التفاعلية
    if (selected === 'action_spam_add') {
      return showSpamModal(interaction);
    }

    if (selected === 'action_spam_remove') {
      return showIdModal(
        interaction,
        'modal_spam_remove',
        'إيقاف السبام عن شخص',
        'أدخل ID الشخص:'
      );
    }

    if (selected === 'action_spam_list') {
      if (activeSpams.size === 0) {
        return interaction.reply({
          content: '📋 لا يوجد أحد قيد الإزعاج حالياً.',
          ephemeral: true
        });
      }

      const list = [...activeSpams.keys()]
        .map(id => `- <@${id}> (${id})`)
        .join('\n');

      return interaction.reply({
        content: `📋 **قائمة المزعج عليهم حالياً (${activeSpams.size}):**\n${list}`,
        ephemeral: true
      });
    }

    if (selected === 'action_bv_add') {
      return showIdModal(
        interaction,
        'modal_bv_add',
        'إضافة شخص إلى Black Voice',
        'أدخل ID الشخص أو المنشن:'
      );
    }

    if (selected === 'action_bv_remove') {
      return showIdModal(
        interaction,
        'modal_bv_remove',
        'إزالة شخص من Black Voice',
        'أدخل ID الشخص:'
      );
    }

    if (selected === 'action_bv_list') {
      if (voiceBlockList.size === 0) {
        return interaction.reply({
          content: '📋 قائمة الممنوعين من الفويس فارغة حالياً.',
          ephemeral: true
        });
      }

      const list = [...voiceBlockList]
        .map(id => `- <@${id}> (${id})`)
        .join('\n');

      return interaction.reply({
        content: `📋 **قائمة الممنوعين من الفويس (${voiceBlockList.size}):**\n${list}`,
        ephemeral: true
      });
    }

    if (selected === 'action_noback_add') {
      return showIdModal(
        interaction,
        'modal_noback_add',
        'إضافة شخص ونظامه إلى No-Back',
        'أدخل ID الشخص المستهدف:'
      );
    }

    if (selected === 'action_noback_remove') {
      return showIdModal(
        interaction,
        'modal_noback_remove',
        'إزالة شخص من نظام No-Back',
        'أدخل ID الشخص:'
      );
    }

    if (selected === 'action_noback_list') {
      if (noBackList.size === 0) {
        return interaction.reply({
          content: ':clipboard: قائمة No-Back فارغة حالياً.',
          ephemeral: true
        });
      }

      const list = [...noBackList.keys()]
        .map(id => `- <@${id}> (${id})`)
        .join('\n');

      return interaction.reply({
        content: `📋 **قائمة المحظورين No-Back (${noBackList.size}):**\n${list}`,
        ephemeral: true
      });
    }

    if (selected === 'action_noback_toggle') {
      isNoBackEnabled = !isNoBackEnabled;
      saveData();

      return interaction.reply({
        content: `✅ تم تغيير حالة حماية No-Back إلى: **${
          isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'
        }**`,
        ephemeral: true
      });
    }
  }

  // استقبال البيانات من Modal
  if (interaction.isModalSubmit()) {
    const rawInput = interaction.fields.getTextInputValue('target_id');
    const userId = cleanId(rawInput);

    if (!ID_PATTERN.test(userId || '')) {
      return interaction.reply({
        content: ':warning: يرجى كتابة الـ ID بشكل صحيح.',
        ephemeral: true
      });
    }

    if (interaction.customId === 'modal_spam_add') {
      if (activeSpams.has(userId)) {
        return interaction.reply({
          content: '⚠️ هذا الشخص يتم إزعاجه حالياً بالفعل!',
          ephemeral: true
        });
      }

      const spamText = interaction.fields
        .getTextInputValue('spam_text')
        .trim();

      if (!spamText || spamText.length > 1900) {
        return interaction.reply({
          content: ':warning: اكتب رسالة صحيحة لا تتجاوز 1900 حرف.',
          ephemeral: true
        });
      }

      const channel = interaction.channel ||
        await client.channels.fetch(interaction.channelId).catch(() => null);

      if (!channel?.isTextBased()) {
        return interaction.reply({
          content: '⚠️ لا يمكن بدء السبام في هذا الروم.',
          ephemeral: true
        });
      }

      await interaction.reply({
        content: `🔥 بدأ الإزعاج المستمر لـ <@${userId}>...`
      });

      startSpam(userId, channel, spamText);
      return;
    }

    if (interaction.customId === 'modal_spam_remove') {
      if (!stopSpam(userId)) {
        return interaction.reply({
          content: '⚠️ هذا الشخص ليس في قائمة الإزعاج.',
          ephemeral: true
        });
      }

      return interaction.reply({
        content: `✅ تم إيقاف الإزعاج عن <@${userId}>.`
      });
    }

    if (interaction.customId === 'modal_bv_add') {
      if (voiceBlockList.has(userId)) {
        return interaction.reply({
          content: '⚠️ هذا الشخص محظور بالفعل من دخول الرومات الصوتية.',
          ephemeral: true
        });
      }

      voiceBlockList.add(userId);
      saveVoiceBlockData();

      try {
        const member = await interaction.guild.members
          .fetch(userId)
          .catch(() => null);

        if (member?.voice.channel) {
          await member.voice.disconnect(
            'ممنوع من دخول الرومات الصوتية (Black Voice)'
          );

          return interaction.reply({
            content: `✅ تم طرد <@${userId}> من الفويس وإضافته لقائمة المنع.`
          });
        }
      } catch (error) {
        console.error('[BlackVoice] تعذر طرد العضو:', error);
      }

      return interaction.reply({
        content: `✅ تم إضافة <@${userId}> لقائمة المنع من الفويس.`
      });
    }

    if (interaction.customId === 'modal_bv_remove') {
      if (!voiceBlockList.has(userId)) {
        return interaction.reply({
          content: '⚠️ هذا الشخص غير موجود في قائمة المنع من الفويس.',
          ephemeral: true
        });
      }

      voiceBlockList.delete(userId);
      saveVoiceBlockData();

      return interaction.reply({
        content: `✅ تم إزالة <@${userId}> من قائمة المنع من الفويس.`
      });
    }

    if (interaction.customId === 'modal_noback_add') {
      const executorId = interaction.user.id;
      const banReason = getBanReason(executorId);

      noBackList.set(userId, executorId);
      saveData();

      try {
        await interaction.guild.members.ban(userId, {
          reason: banReason
        });

        return interaction.reply({
          content: `✅ <@${userId}> تم شقه بنجاح.\n📝 السبب: \`${banReason}\``
        });
      } catch (error) {
        console.error(error);

        return interaction.reply({
          content: `✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً.`
        });
      }
    }

    if (interaction.customId === 'modal_noback_remove') {
      if (!noBackList.has(userId)) {
        return interaction.reply({
          content: ':warning: غلطان يالاخو، الشخص ليس في القائمة.',
          ephemeral: true
        });
      }

      noBackList.delete(userId);
      saveData();

      return interaction.reply({
        content: `✅ تم إزالة <@${userId}> انفك الـ No-Back.`
      });
    }
  }
});

// طرد الشخص تلقائياً عند محاولته دخول روم صوتي
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (
    newState.channelId &&
    voiceBlockList.has(newState.id)
  ) {
    try {
      await newState.disconnect(
        'ممنوع من دخول الرومات الصوتية (Black Voice)'
      );

      console.log(
        `[BlackVoice] تم طرد ${newState.id} تلقائياً عند دخوله الروم.`
      );
    } catch (error) {
      console.error(
        `[BlackVoice] تعذر طرد العضو ${newState.id}:`,
        error
      );
    }
  }
});

// إعادة الحظر التلقائي بنفس السبب المخزن
client.on('guildBanRemove', async ban => {
  if (
    !isNoBackEnabled ||
    !noBackList.has(ban.user.id)
  ) {
    return;
  }

  const executorId = noBackList.get(ban.user.id);
  const banReason = getBanReason(executorId);

  try {
    await ban.guild.bans.create(ban.user.id, {
      reason: `حظر دائم - ${banReason}`
    });
  } catch (error) {
    console.error(
      '[No-Back] يتعذر إعادة الحظر:',
      error
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
