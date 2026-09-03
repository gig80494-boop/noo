// منع شخص من دخول الرومات الصوتية
  if (command === '!kickvoice' || command === '!kv') {
    if (!isKickVoiceAllowed(message)) {
      return message.reply(':x: ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    const userId = args[1]?.replace(/[<@!>]/g, '');

    if (!/^\d+$/.test(userId || '')) {
      return message.reply(
        ':warning: يرجى كتابة الـ ID الصحيح أو المنشن. مثال: `!kickvoice 123456789`'
      );
    }

    if (voiceBlockList.has(userId)) {
      return message.reply(
        '⚠️ هذا الشخص محظور بالفعل من دخول الرومات الصوتية.'
      );
    }
    
    voiceBlockList.add(userId);
    saveVoiceBlockData();

    let wasInVoice = false;
    try {
      const member = await message.guild.members.fetch(userId).catch(() => null);

      if (member?.voice?.channel) {
        await member.voice.disconnect('ممنوع من دخول الرومات الصوتية (Kick Voice)');
        wasInVoice = true;
      }
    } catch (error) {
      console.error('[KickVoice] تعذر طرد العضو:', error);
    }

    if (wasInVoice) {
      return message.reply(`✅ تم طرد <@${userId}> من الفويس وإضافته لقائمة المنع من الدخول.`);
    } else {
      return message.reply(`✅ تم إضافة <@${userId}> لقائمة المنع من الفويس (سبيتم طرده فور دخوله).`);
    }
  }
