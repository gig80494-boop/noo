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

const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    NoSubscriberBehavior, 
    VoiceConnectionStatus, 
    entersState, 
    getVoiceConnection 
} = require("@discordjs/voice");

const play = require("play-dl");

// ==================== CONFIGURATION & CONSTANTS ====================
const TOKEN = process.env.DISCORD_TOKEN?.trim();
const GUILD_ID = process.env.GUILD_ID?.trim() || "1500918222378106901";
const COMMANDS_CHANNEL_ID = process.env.COMMANDS_CHANNEL_ID?.trim() || "1545389147911626772";
const NO_BACK_CHANNEL_ID = process.env.NO_BACK_CHANNEL_ID?.trim() || "1545821612304244756";

if (!TOKEN) {
    console.error("❌ لم يتم العثور على DISCORD_TOKEN داخل متغيرات البيئة.");
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

// ==================== PERMISSIONS & AUTHORIZATIONS ====================
const COMMAND_PERMISSION_USERS = ["1518574556787249177", "1496923040985124905", "1422526730035396659", "974728425824727132"];
const PANEL_USERS = ["1496923040985124905", "1518574556787249177", "1422526730035396659", "974728425824727132"];
const BLACK_VOICE_USERS = ["1518574556787249177", "1496923040985124905", "1422526730035396659", "974728425824727132"];
const TICKET_DELETE_USERS = ["1496923040985124905", "1518574556787249177", "1422526730035396659", "1324690375000068106", "1443146259580977252", "974728425824727132"];
const CHANNEL_DELETE_USERS = ["1496923040985124905", "1518574556787249177", "974728425824727132"];

const AUTHORIZED_USERS = [...new Set([...COMMAND_PERMISSION_USERS, ...PANEL_USERS, ...BLACK_VOICE_USERS, ...TICKET_DELETE_USERS, ...CHANNEL_DELETE_USERS])];

const PROTECTED_ROLE_ID = "1539637652871979068";
const TICKET_CATEGORY_ID = "1544479850021134386";
const JAIL_ROLE_ID = "1546513583926550578";
const JAIL_MEMBER_ROLE_ID = "1546521568199446590";
const JAIL_PERMISSION_USERS = ["1518574556787249177", "1496923040985124905"];

const HIDE_CATEGORY_IDS = ["1545178947040583723", "1526683963907772426", "1544479850021134386", "1526587780786946159"];
const HIDE_CHANNEL_IDS = [];
const HIDE_EXCLUDED_CHANNEL_IDS = [];

const DATA_DIR = __dirname;
const COMMANDS_MESSAGE_FILE = path.join(DATA_DIR, "commands-message.json");
const ADMIN_ROLES_MESSAGE_FILE = path.join(DATA_DIR, "admin-roles-message.json");
const SERVER_MUTE_FILE = path.join(DATA_DIR, "servermute.json");
const SERVER_DEAFEN_FILE = path.join(DATA_DIR, "serverdeafen.json");
const PROTECTED_MEMBERS_FILE = path.join(DATA_DIR, "protected_members.json");
const VOICE_BLOCK_FILE = path.join(DATA_DIR, "voiceblock.json");
const NO_BACK_FILE = path.join(DATA_DIR, "noback.json");
const NO_BACK_MESSAGE_FILE = path.join(DATA_DIR, "noback-message.json");
const JAIL_FILE = path.join(DATA_DIR, "jail.json");

const spamJobs = new Map();
const snowflakePattern = /^\d{15,22}$/;

// ==================== JSON FILE SYSTEM HELPERS ====================
function readJson(e, a) {
    try {
        if (!fs.existsSync(e)) return fs.writeFileSync(e, JSON.stringify(a, null, 2), "utf8"), a;
        return JSON.parse(fs.readFileSync(e, "utf8")) ?? a;
    } catch (t) {
        console.error(`❌ تعذر قراءة الملف ${path.basename(e)}:`, t);
        return a;
    }
}

function writeJson(e, a) {
    try {
        fs.writeFileSync(e, JSON.stringify(a, null, 2), "utf8");
    } catch (a) {
        console.error(`❌ تعذر حفظ الملف ${path.basename(e)}:`, a);
    }
}

function readIdArray(e) {
    const a = readJson(e, []);
    return Array.isArray(a) ? a.filter((e => isValidId(e))) : [];
}

function removeMentionCharacters(e) { return String(e || "").replace(/[<@!>]/g, "").trim(); }
function isValidId(e) { return snowflakePattern.test(String(e || "")); }
function getActorId(e) { return e?.author?.id || e?.user?.id || ""; }
function canManageCommands(e) { return COMMAND_PERMISSION_USERS.includes(getActorId(e)); }
function canUsePanel(e) { return PANEL_USERS.includes(getActorId(e)); }
function canUseBlackVoice(e) { return BLACK_VOICE_USERS.includes(getActorId(e)); }
function canUseJail(e) { return JAIL_PERMISSION_USERS.includes(getActorId(e)) || Boolean(e?.member?.roles?.cache?.has(JAIL_ROLE_ID)); }

// ==================== MUSIC SYSTEM GLOBALS ====================
globalThis.__musicPlayers = globalThis.__musicPlayers || new Map();

function getGuildMusicPlayer(guildId) {
    let guildData = globalThis.__musicPlayers.get(guildId);
    if (!guildData) {
        guildData = {
            player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } }),
            connection: null,
            queue: [],
            isPlaying: false
        };
        globalThis.__musicPlayers.set(guildId, guildData);
    }
    return guildData;
}

// ==================== COMMANDS LIST CONFIG ====================
const DEFAULT_COMMANDS = [
    { command: "!p <اسم/رابط>", description: "تشغيل أضنية أو المقطع الصوتي" },
    { command: "!stop", description: "إيقاف التشغيل وإخراج البوت" },
    { command: "!join", description: "دخول البوت إلى الروم الصوتي" },
    { command: "delete_ticket.byowner", description: "حذف التذكرة الحالية" },
    { command: "!deletechannel", description: "حذف الروم الحالي فورًا - للمصرح لهم فقط" },
    { command: "!muteall", description: "كتم كل الموجودين في الروم الصوتي الحالي ما عداك" },
    { command: "!unmuteall <روم صوتي>", description: "فك الميوت عن كل الموجودين في روم صوتي محدد ما عداك" },
    { command: "!moveall <روم صوتي>", description: "نقل كل الموجودين في رومك الصوتي إلى روم صوتي آخر" },
    { command: "سجن <ID>", description: "فتح قائمة عقوبات السجن للشخص" },
    { command: "فك-السجن <ID>", description: "فك سجن الشخص فورًا" },
    { command: "!blackmute <ID>", description: "تفعيل ميوت صوتي دائم" },
    { command: "!unblackmute <ID>", description: "إلغاء الميوت الصوتي الدائم" },
    { command: "!blackdeafen <ID>", description: "تفعيل ديفن صوتي دائم" },
    { command: "!unblackdeafen <ID>", description: "إلغاء الديفن الصوتي الدائم" },
    { command: "!spam <@user> <النص>", description: "إرسال منشن متكرر إلى مستخدم" },
    { command: "!unspam <ID>", description: "إيقاف الإرسال المتكرر" },
    { command: "!spamlist", description: "عرض الأشخاص الموجودين في القائمة" },
    { command: "!send <روم> <النص>", description: "إرسال رسالة عن طريق البوت" },
    { command: "!menu", description: "فتح لوحة التحكم" },
    { command: "!blackvoice <ID>", description: "منع شخص من دخول الصوتي" },
    { command: "!unblackvoice <ID>", description: "إلغاء منع الصوتي" },
    { command: "!bvlist", description: "عرض قائمة منع الصوتي" },
    { command: "!noback <ID>", description: "إضافة حظر دائم" },
    { command: "!noback list", description: "عرض قائمة الحظر الدائم" },
    { command: "!noback remove <ID>", description: "إزالة شخص من الحظر الدائم" },
    { command: "!hide", description: "إخفاء الكاتجوريات والرومات المحددة" },
    { command: "!unhide", description: "إظهار الكاتجوريات والرومات المحددة" }
];

function loadCommandCatalog() {
    const e = readJson(COMMANDS_MESSAGE_FILE, {});
    const a = Array.isArray(e?.commands) ? e.commands : [];
    const t = [...a];
    for (const e of DEFAULT_COMMANDS) t.some((a => a?.command === e.command)) || t.push(e);
    const n = t.filter((e => e && "string" == typeof e.command && "string" == typeof e.description));
    if (JSON.stringify(a) !== JSON.stringify(n) || "string" != typeof e?.messageId) {
        writeJson(COMMANDS_MESSAGE_FILE, { messageId: e?.messageId || null, commands: n, signature: e?.signature || null });
    }
    return n;
}

let commandCatalog = loadCommandCatalog();

function getHighestAdministratorRoles(e) {
    return [...e.roles.cache.values()].filter((e => !e.managed && e.permissions.has(PermissionsBitField.Flags.Administrator))).sort(((e, a) => a.position - e.position));
}

function buildCommandsMessage(e) {
    const a = getHighestAdministratorRoles(e);
    const t = 0 === a.length ? "📋 لا توجد رتب لديها صلاحية Administrator حاليًا." : a.map((e => `• <@&${e.id}>`)).join("\n");
    const n = t.length > 1024 ? `${t.slice(0, 990)}\n… توجد رتب إضافية.` : t;
    return {
        embeds: [(new EmbedBuilder).setColor(6448295).setTitle("📋 الأوامر").setDescription("هذه قائمة أوامر البوت.").addFields([...commandCatalog.map((e => ({ name: `\`${e.command}\``, value: `> ${e.description}`, inline: !1 }))), { name: "🛡️ الرتب التي لديها صلاحية Administrator", value: n, inline: !1 }]).setFooter({ text: "استخدم الأمر كما هو مكتوب في القائمة" })],
        allowedMentions: { roles: a.map((e => e.id)) }
    };
}

function commandsMessageSignature(e) { return JSON.stringify(e.embeds.map((e => e.toJSON()))); }

let updatingCommandsMessage = !1;
async function updateCommandsMessage(e) {
    if (!updatingCommandsMessage && e && e.id === GUILD_ID) {
        updatingCommandsMessage = !0;
        try {
            commandCatalog = loadCommandCatalog();
            const a = await e.channels.fetch(COMMANDS_CHANNEL_ID).catch((() => null));
            if (!a?.isTextBased?.() || "function" != typeof a.send) return console.error(`❌ لم أجد روم الأوامر: ${COMMANDS_CHANNEL_ID}`);
            const t = buildCommandsMessage(e), n = commandsMessageSignature(t), r = readJson(COMMANDS_MESSAGE_FILE, {}), o = readJson(ADMIN_ROLES_MESSAGE_FILE, {});
            if (o?.messageId && o.messageId !== r?.messageId) {
                const e = await a.messages.fetch(o.messageId).catch((() => null));
                e?.author?.id === client.user?.id && await e.delete().catch((() => { }));
                writeJson(ADMIN_ROLES_MESSAGE_FILE, { messageId: null });
            }
            let s = null;
            if ("string" == typeof r?.messageId) s = await a.messages.fetch(r.messageId).catch((() => null));
            if (s?.author?.id === client.user?.id) {
                if (r.signature !== n) {
                    await s.edit(t);
                    writeJson(COMMANDS_MESSAGE_FILE, { messageId: s.id, commands: commandCatalog, signature: n });
                }
            } else {
                s = await a.send(t);
                writeJson(COMMANDS_MESSAGE_FILE, { messageId: s.id, commands: commandCatalog, signature: n });
            }
        } catch (e) { console.error("❌ تعذر تحديث رسالة الأوامر:", e); } finally { updatingCommandsMessage = !1; }
    }
}

// ==================== STATE MANAGEMENT ====================
const serverMuteUsers = new Set(readIdArray(SERVER_MUTE_FILE));
const serverDeafenUsers = new Set(readIdArray(SERVER_DEAFEN_FILE));
const protectedMembers = new Set(readIdArray(PROTECTED_MEMBERS_FILE));
const voiceBlockedUsers = new Set(readIdArray(VOICE_BLOCK_FILE));
const savedNoBack = readJson(NO_BACK_FILE, { enabled: !0, users: {} });
let noBackEnabled = !1 !== savedNoBack?.enabled;
const noBackUsers = new Map();

if (savedNoBack?.users && "object" == typeof savedNoBack.users && !Array.isArray(savedNoBack.users)) {
    for (const [e, a] of Object.entries(savedNoBack.users)) isValidId(e) && noBackUsers.set(e, String(a || "system"));
}

function saveServerMuteUsers() { writeJson(SERVER_MUTE_FILE, [...serverMuteUsers]); }
function saveServerDeafenUsers() { writeJson(SERVER_DEAFEN_FILE, [...serverDeafenUsers]); }
function saveProtectedMembers() { writeJson(PROTECTED_MEMBERS_FILE, [...protectedMembers]); }
function saveVoiceBlockedUsers() { writeJson(VOICE_BLOCK_FILE, [...voiceBlockedUsers]); }
function saveNoBack() { writeJson(NO_BACK_FILE, { enabled: noBackEnabled, users: Object.fromEntries(noBackUsers) }); }

let updatingNoBackMessage = !1;
async function updateNoBackMessage() {
    if (updatingNoBackMessage) return;
    updatingNoBackMessage = !0;
    try {
        const e = await client.channels.fetch(NO_BACK_CHANNEL_ID).catch((() => null));
        if (!e?.isTextBased?.() || "function" != typeof e.send) return;
        const a = [...noBackUsers.keys()], t = 0 === a.length ? "📋 قائمة No-Back فارغة حاليًا." : a.map((e => `• <@${e}>`)).join("\n"), n = t.length > 4096 ? `${t.slice(0, 4050)}\n… توجد أسماء إضافية.` : t, r = { embeds: [(new EmbedBuilder).setColor(6448295).setTitle("📋 قائمة No-Back").setDescription(n).setFooter({ text: `العدد: ${a.length}` })], allowedMentions: { users: a.slice(0, 100) } };
        const s = readJson(NO_BACK_MESSAGE_FILE, {});
        let o = "string" == typeof s?.messageId ? await e.messages.fetch(s.messageId).catch((() => null)) : null;
        if (o?.author?.id === client.user?.id) await o.edit(r);
        else { o = await e.send(r); writeJson(NO_BACK_MESSAGE_FILE, { messageId: o.id }); }
    } catch (e) { console.error("❌ تعذر تحديث قائمة No-Back:", e); } finally { updatingNoBackMessage = !1; }
}

function getNoBackReason(e) {
    return "1518574556787249177" === e ? "lbnani say no" : "1496923040985124905" === e ? "Abu Khalid say no" : "1422526730035396659" === e ? "Saud say no" : "نظام حماية No-Back";
}

// Panel Setup
function buildPanelComponents() {
    const e = (new StringSelectMenuBuilder).setCustomId("panel_select").setPlaceholder("اختر الإجراء المطلوب...").addOptions([
        ["action_spam_add", "بدء منشن متكرر", "🔥"], ["action_spam_remove", "إيقاف المنشن المتكرر", "🛑"],
        ["action_spam_list", "عرض قائمة المنشن", "🔔"], ["action_muteall", "كتم كل الموجودين في الروم الحالي", "🔇"],
        ["action_unmuteall", "فك الميوت عن كل الموجودين في الروم الحالي", "🔊"], ["action_servermute_add", "إضافة Server Mute دائم", "🔇"],
        ["action_servermute_remove", "فك Server Mute", "🔊"], ["action_serverdeafen_add", "إضافة Black Deafen دائم", "🔇"],
        ["action_serverdeafen_remove", "فك Black Deafen", "🔊"], ["action_bv_add", "إضافة شخص إلى Black Voice", "🎙️"],
        ["action_bv_remove", "إزالة شخص من Black Voice", "🔊"], ["action_bv_list", "عرض قائمة Black Voice", "📋"],
        ["action_noback_add", "إضافة شخص إلى No-Back", "⛔"], ["action_noback_remove", "إزالة شخص من No-Back", "🟢"],
        ["action_noback_list", "عرض قائمة No-Back", "📜"], ["action_noback_toggle", "تغيير حالة No-Back", "⚙️"]
    ].map((([e, a, t]) => ({ value: e, label: a, emoji: t }))));
    return [(new ActionRowBuilder).addComponents(e), (new ActionRowBuilder).addComponents((new ButtonBuilder).setCustomId("panel_refresh").setLabel("تحديث اللوحة").setStyle(ButtonStyle.Secondary))];
}

function showTargetModal(e, a, t, n) {
    return e.showModal((new ModalBuilder).setCustomId(a).setTitle(t).addComponents((new ActionRowBuilder).addComponents((new TextInputBuilder).setCustomId("target_id").setLabel(n).setStyle(TextInputStyle.Short).setRequired(!0))));
}

function startSpam(e, a, t) {
    stopSpam(e);
    const n = setInterval((async () => {
        try { if (a?.isTextBased?.()) await a.send({ content: `<@${e}> ${t}`, allowedMentions: { users: [e] } }); } catch (e) { }
    }), 1500);
    spamJobs.set(e, { interval: n, channelId: a.id, text: t });
}

function stopSpam(e) {
    const a = spamJobs.get(e);
    return !!a && (clearInterval(a.interval), spamJobs.delete(e), !0);
}

function getSpamListText() { return 0 === spamJobs.size ? "📋 لا يوجد أحد في قائمة المنشن حاليًا." : `📋 **قائمة المنشن الحالية (${spamJobs.size}):**\n${[...spamJobs.keys()].map((e => `• <@${e}> (${e})`)).join("\n")}`; }
function getVoiceBlockListText() { return 0 === voiceBlockedUsers.size ? "📋 قائمة Black Voice فارغة حاليًا." : `📋 **قائمة Black Voice (${voiceBlockedUsers.size}):**\n${[...voiceBlockedUsers].map((e => `• <@${e}> (${e})`)).join("\n")}`; }
function getNoBackListText() { return 0 === noBackUsers.size ? "📋 قائمة No-Back فارغة حاليًا." : `📋 **قائمة No-Back (${noBackUsers.size}):**\n${[...noBackUsers.keys()].map((e => `• <@${e}> (${e})`)).join("\n")}`; }

async function setConfiguredVisibility(e, a) {
    const t = new Map(), n = HIDE_CATEGORY_IDS;
    for (const r of n) { const s = await e.channels.fetch(r).catch((() => null)); s && t.set(s.id, { channel: s, visible: !a }); }
    const r = await e.channels.fetch().catch((() => null));
    if (r) for (const e of r.values()) e.parentId && n.includes(e.parentId) && !HIDE_EXCLUDED_CHANNEL_IDS.includes(e.id) && t.set(e.id, { channel: e, visible: !a });
    for (const r of HIDE_CHANNEL_IDS) { const s = await e.channels.fetch(r).catch((() => null)); s && !HIDE_EXCLUDED_CHANNEL_IDS.includes(r) && t.set(r, { channel: s, visible: !a }); }
    for (const r of HIDE_EXCLUDED_CHANNEL_IDS) { const s = await e.channels.fetch(r).catch((() => null)); s && t.set(r, { channel: s, visible: !0 }); }
    let s = 0;
    for (const [r, n] of t) try { await n.channel.permissionOverwrites.edit(e.roles.everyone, { ViewChannel: n.visible }, { reason: a ? "إخفاء الكاتجوريات والرومات المحددة" : "إظهار الكاتجوريات والرومات المحددة" }), s++; } catch (e) { }
    return { updated: s, total: t.size };
}

async function fetchMember(e, a) { return e.members.fetch(a).catch((() => null)); }

async function applyServerMute(e, a, t) {
    const n = await fetchMember(e, a);
    if (n?.voice?.channel) try { await n.voice.setMute(t, t ? "Server Mute دائم" : "إزالة Server Mute"); } catch (e) { }
}

async function applyServerDeafen(e, a, t) {
    const n = await fetchMember(e, a);
    if (n?.voice?.channel) try { await n.voice.setDeaf(t, t ? "Black Deafen دائم" : "إزالة Black Deafen"); } catch (e) { }
}

async function addNoBackUser(e, a, t) {
    const n = getNoBackReason(t);
    noBackUsers.set(a, t); saveNoBack(); await updateNoBackMessage();
    try {
        await e.members.ban(a, { reason: n });
        return `✅ تم حظر <@${a}> وإضافته إلى No-Back.\n📝 السبب: \`${n}\``;
    } catch (e) { return `✅ تمت إضافة <@${a}> إلى No-Back، لكن تعذر حظره الآن.`; }
}

async function removeNoBackUser(e) {
    if (!noBackUsers.has(e)) return "⚠️ الشخص غير موجود في قائمة No-Back.";
    noBackUsers.delete(e); saveNoBack(); await updateNoBackMessage();
    return `✅ تم إزالة <@${e}> من No-Back.`;
}

// Jail System
const jailedUsers = readJson(JAIL_FILE, {});
const jailTimers = new Map();
function saveJailedUsers() { writeJson(JAIL_FILE, jailedUsers); }

function scheduleJail(e) {
    const a = jailedUsers[e]; if (!a) return;
    const t = jailTimers.get(e); t && clearTimeout(t);
    const n = Math.max(0, Number(a.expiresAt) - Date.now());
    const r = setTimeout((() => unjailUser(e).catch((e => console.error("❌ تعذر فك السجن تلقائيًا:", e)))), Math.min(n, 2147483647));
    jailTimers.set(e, r);
}

async function jailUser(e, a, t, n) {
    if (jailedUsers[a]) return { ok: !1, message: "⚠️ هذا الشخص مسجون بالفعل." };
    const r = await e.members.fetch(a).catch((() => null));
    if (!r) return { ok: !1, message: "⚠️ لم أجد هذا العضو في السيرفر." };
    const s = await e.roles.fetch(JAIL_MEMBER_ROLE_ID).catch((() => null));
    if (!s) return { ok: !1, message: "❌ لم أجد رتبة السجن المحددة." };
    try {
        if (!r.roles.cache.has(s.id)) await r.roles.add(s, `سجن بسبب ${t}`);
    } catch (e) { return { ok: !1, message: "❌ تعذر إعطاء رتبة السجن." }; }
    jailedUsers[a] = { guildId: e.id, reason: t, expiresAt: Date.now() + n, roleId: s.id };
    saveJailedUsers(); scheduleJail(a);
    return { ok: !0, expiresAt: jailedUsers[a].expiresAt };
}

async function unjailUser(e, f = !1) {
    const a = jailedUsers[e]; if (!a) return !1;
    if (!f && Number(a.expiresAt) > Date.now()) return !1;
    const t = client.guilds.cache.get(a.guildId) || await client.guilds.fetch(a.guildId).catch((() => null));
    if (t) {
        const n = await t.members.fetch(e).catch((() => null));
        const r = await t.roles.fetch(a.roleId || JAIL_MEMBER_ROLE_ID).catch((() => null));
        if (n && r && n.roles.cache.has(r.id)) await n.roles.remove(r, "انتهاء مدة السجن").catch((() => { }));
    }
    const n = jailTimers.get(e); n && clearTimeout(n); jailTimers.delete(e);
    delete jailedUsers[e]; saveJailedUsers();
    return !0;
}

async function initializeJails() {
    for (const e of Object.keys(jailedUsers)) {
        const a = jailedUsers[e];
        if (!a?.guildId || Number(a.expiresAt) <= Date.now()) { await unjailUser(e); continue; }
        const t = client.guilds.cache.get(a.guildId) || await client.guilds.fetch(a.guildId).catch((() => null));
        if (t) {
            const n = await t.members.fetch(e).catch((() => null));
            const r = await t.roles.fetch(a.roleId || JAIL_MEMBER_ROLE_ID).catch((() => null));
            if (n && r && !n.roles.cache.has(r.id)) await n.roles.add(r, `إعادة تطبيق سجن ${a.reason}`).catch((() => { }));
        }
        scheduleJail(e);
    }
}

function buildJailComponents(e) {
    return [(new ActionRowBuilder).addComponents((new StringSelectMenuBuilder).setCustomId(`jail_reason:${e}`).setPlaceholder("اختر العقوبة...").addOptions([{ value: "qadhf", label: "قذف - 3 ساعات", description: "السجن لمدة ثلاث ساعات", emoji: "🔒" }, { value: "insult", label: "سب - ساعتان", description: "السجن لمدة ساعتين", emoji: "🔒" }]))];
}

async function moveMembersToVoice(e, a) {
    let t = 0, n = 0;
    for (const r of e.members.values()) try { await r.voice.setChannel(a, "نقل العضو بواسطة moveall"); t++; } catch (e) { n++; }
    return { moved: t, failed: n };
}

async function setVoiceMuteForOthers(e, a, t, n) {
    let r = 0, s = 0;
    for (const o of e.members.values()) {
        if (o.id === a || (t && o.voice.serverMute) || (!t && !o.voice.serverMute)) continue;
        try { await o.voice.setMute(t, n); r++; } catch (e) { s++; }
    }
    return { changed: r, failed: s };
}

// Slash Commands setup
const slashCommand = (e, a, t = []) => ({ name: e, description: a, options: t, default_member_permissions: "0" });
const slashUserOption = { type: 6, name: "user", description: "اختر العضو", required: !0 };
const SLASH_COMMANDS = [
    slashCommand("delete-ticket", "حذف التذكرة الحالية"), slashCommand("commands", "تحديث قائمة أوامر البوت"),
    slashCommand("deletechannel", "حذف الروم الحالي فورًا"), slashCommand("muteall", "كتم كل الموجودين في رومك الصوتي ما عداك"),
    slashCommand("unmuteall", "فك الميوت عن كل الموجودين في روم صوتي محدد ما عداك", [{ type: 7, name: "channel", description: "اختر الروم الصوتي", required: !0 }]),
    slashCommand("moveall", "نقل كل الموجودين في رومك الصوتي إلى روم صوتي آخر", [{ type: 7, name: "channel", description: "الروم الصوتي الهدف", required: !0 }]),
    slashCommand("jail", "فتح قائمة عقوبات السجن", [slashUserOption]), slashCommand("unjail", "فك سجن العضو", [slashUserOption]),
    slashCommand("blackmute", "تفعيل Server Mute دائم", [slashUserOption]), slashCommand("unblackmute", "إلغاء Server Mute الدائم", [slashUserOption]),
    slashCommand("blackdeafen", "تفعيل Black Deafen دائم", [slashUserOption]), slashCommand("unblackdeafen", "إلغاء Black Deafen الدائم", [slashUserOption]),
    slashCommand("spam", "إرسال منشن متكرر", [slashUserOption, { type: 3, name: "text", description: "النص الذي سيتم إرساله", required: !0 }]),
    slashCommand("unspam", "إيقاف المنشن المتكرر", [slashUserOption]), slashCommand("spamlist", "عرض قائمة المنشن"),
    slashCommand("send", "إرسال رسالة عن طريق البوت", [{ type: 7, name: "channel", description: "الروم الكتابي", required: !0 }, { type: 3, name: "text", description: "الرسالة", required: !0 }]),
    slashCommand("menu", "فتح لوحة التحكم"), slashCommand("blackvoice", "منع عضو من دخول الصوتي", [slashUserOption]),
    slashCommand("unblackvoice", "إلغاء منع الصوتي", [slashUserOption]), slashCommand("bvlist", "عرض قائمة Black Voice"),
    slashCommand("noback", "إدارة قائمة No-Back", [{ type: 1, name: "add", description: "إضافة عضو", options: [slashUserOption] }, { type: 1, name: "remove", description: "إزالة عضو", options: [slashUserOption] }, { type: 1, name: "list", description: "عرض القائمة" }]),
    slashCommand("noback_protection", "تفعيل أو تعطيل حماية No-Back", [{ type: 3, name: "mode", description: "الحالة", required: !0, choices: [{ name: "on", value: "on" }, { name: "off", value: "off" }] }]),
    slashCommand("hide", "إخفاء الكاتجوريات والرومات المحددة"), slashCommand("unhide", "إظهار الكاتجوريات والرومات المحددة")
];

const SLASH_PERMISSION_MAP = {
    "delete-ticket": TICKET_DELETE_USERS, commands: COMMAND_PERMISSION_USERS, deletechannel: CHANNEL_DELETE_USERS,
    muteall: COMMAND_PERMISSION_USERS, unmuteall: COMMAND_PERMISSION_USERS, moveall: COMMAND_PERMISSION_USERS,
    jail: [JAIL_ROLE_ID], unjail: [JAIL_ROLE_ID], blackmute: COMMAND_PERMISSION_USERS, unblackmute: COMMAND_PERMISSION_USERS,
    blackdeafen: COMMAND_PERMISSION_USERS, unblackdeafen: COMMAND_PERMISSION_USERS, spam: COMMAND_PERMISSION_USERS,
    unspam: COMMAND_PERMISSION_USERS, spamlist: COMMAND_PERMISSION_USERS, send: COMMAND_PERMISSION_USERS,
    menu: PANEL_USERS, blackvoice: BLACK_VOICE_USERS, unblackvoice: BLACK_VOICE_USERS, bvlist: BLACK_VOICE_USERS,
    noback: COMMAND_PERMISSION_USERS, noback_protection: COMMAND_PERMISSION_USERS, hide: COMMAND_PERMISSION_USERS, unhide: COMMAND_PERMISSION_USERS
};

async function registerSlashCommands() {
    try {
        const e = new REST({ version: "10" }).setToken(TOKEN);
        const a = await e.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: SLASH_COMMANDS });
        console.log(`✅ تم تسجيل ${a.length} أمر Slash بنجاح.`);
    } catch (e) { console.error("❌ تعذر تسجيل أوامر Slash:", e); }
}

// ==================== EVENTS & BOT LOGIC ====================
client.once("ready", (async () => {
    console.log(`✅ البوت يعمل الآن باسم ${client.user.tag}`);
    try {
        const e = await client.guilds.fetch(GUILD_ID);
        await e.roles.fetch();
        await updateCommandsMessage(e);
        await updateNoBackMessage();
        await registerSlashCommands();
        await initializeJails();
        const a = await e.members.fetch().catch((() => null));
        if (a) {
            a.forEach((e => { e.roles.cache.has(PROTECTED_ROLE_ID) && protectedMembers.add(e.id); }));
            saveProtectedMembers();
        }
    } catch (e) { console.error("❌ تعذر تجهيز البوت:", e); }
}));

// Command logic: Music, Text commands & Panel
client.on("messageCreate", (async message => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const args = content.split(/\s+/);
    const command = args[0]?.toLowerCase();

    // =============== MUSIC COMMANDS ===============
    if (["!p", "!play", "!stop", "!join", "!leave"].includes(command)) {
        if (!AUTHORIZED_USERS.includes(message.author.id)) {
            return message.reply("❌ ليس لديك صلاحية لاستخدام أوامر الموسيقى.");
        }

        if (command === "!join") {
            const voiceChannel = message.member?.voice?.channel;
            if (!voiceChannel) return message.reply("⚠️ يجب أن تكون داخل روم صوتي أولًا.");
            try {
                joinVoiceChannel({ channelId: voiceChannel.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator, selfDeaf: false });
                return message.reply(`✅ دخل البوت الروم الصوتي: <#${voiceChannel.id}>`);
            } catch (e) {
                return message.reply("❌ تعذر دخول الروم الصوتي.");
            }
        }

        if (command === "!stop" || command === "!leave") {
            const player = globalThis.__musicPlayers?.get(message.guild.id);
            if (!player) return message.reply("⚠️ لا توجد أغنية تعمل حاليًا.");
            try {
                player.player.stop(true);
                if (player.connection) player.connection.destroy();
                globalThis.__musicPlayers.delete(message.guild.id);
                return message.reply("⏹️ تم إيقاف التشغيل وإخراج البوت.");
            } catch (e) {
                return message.reply("❌ تعذر إيقاف التشغيل.");
            }
        }

        if (command === "!p" || command === "!play") {
            const query = args.slice(1).join(" ").trim();
            if (!query) return message.reply("⚠️ الاستخدام: !p <رابط أو اسم الأغنية>");
            const voiceChannel = message.member?.voice?.channel;
            if (!voiceChannel) return message.reply("⚠️ يجب أن تكون داخل روم صوتي أولًا.");

            try {
                let trackUrl = query;
                let trackTitle = query;

                if (!/^https?:\/\//i.test(query)) {
                    const searchRes = await play.search(query, { limit: 1 });
                    if (!searchRes || !searchRes.length) return message.reply("⚠️ لم أجد أغنية بهذا الاسم.");
                    trackUrl = searchRes[0].url;
                    trackTitle = searchRes[0].title || query;
                }

                const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator, selfDeaf: false });
                await entersState(connection, VoiceConnectionStatus.Ready, 30000);

                const stream = await play.stream(trackUrl, { discordPlayerCompatibility: true });
                const guildMusicPlayer = getGuildMusicPlayer(message.guild.id);
                const resource = createAudioResource(stream.stream, { inputType: stream.type });

                guildMusicPlayer.connection = connection;
                guildMusicPlayer.player.play(resource);
                connection.subscribe(guildMusicPlayer.player);

                guildMusicPlayer.player.once(AudioPlayerStatus.Idle, () => {
                    connection.destroy();
                    globalThis.__musicPlayers.delete(message.guild.id);
                });

                return message.reply(`▶️ جاري تشغيل: **${trackTitle}**`);
            } catch (e) {
                console.error("Music Error:", e);
                return message.reply("❌ تعذر تشغيل الأغنية. تأكد من ثبات الاتصال والمكتبات.");
            }
        }
    }

    // =============== UTILITY & MANAGEMENT COMMANDS ===============
    if (!AUTHORIZED_USERS.includes(message.author.id) && !message.member?.roles.cache.has(JAIL_ROLE_ID)) return;

    if (command === "delete_ticket.byowner") {
        if (!TICKET_DELETE_USERS.includes(message.author.id)) return message.reply("❌ ليس لديك صلاحية حذف التذاكر.");
        if (message.channel.parentId !== TICKET_CATEGORY_ID) return message.reply("❌ هذا الأمر يعمل داخل روم التذكرة فقط.");
        return message.channel.delete("حذف التذكرة").catch(() => { });
    }

    if (command === "!deletechannel" || command === "!delchannel") {
        if (!CHANNEL_DELETE_USERS.includes(message.author.id)) return message.reply("❌ ليس لديك صلاحية استخدام الأمر.");
        return message.channel.delete(`حذف بواسطة ${message.author.id}`).catch(() => { });
    }

    if (["!hide", "!hidechannels", "!unhide", "!showchannels"].includes(command)) {
        if (!canManageCommands(message)) return message.reply("❌ ليس لديك صلاحية لاستخدام الأمر.");
        const isHide = ["!hide", "!hidechannels"].includes(command);
        const res = await setConfiguredVisibility(message.guild, isHide);
        return message.reply(`✅ تم ${isHide ? "إخفاء" : "إظهار"} ${res.updated} من أصل ${res.total} أهداف.`);
    }

    if (command === "!jail" || command === "سجن") {
        if (!canUseJail(message)) return message.reply("❌ ليس لديك صلاحية أمر السجن.");
        const targetId = removeMentionCharacters(args[1]);
        if (!isValidId(targetId)) return message.reply("⚠️ الاستخدام: سجن <user_id>");
        return message.reply({ content: `🔒 اختر العقوبة للشخص <@${targetId}>:`, components: buildJailComponents(targetId) });
    }

    if (["فك-السجن", "فكسجن"].includes(command) || (command === "فك" && args[1]?.toLowerCase() === "السجن")) {
        if (!canUseJail(message)) return message.reply("❌ ليس لديك صلاحية استخدام هذا الأمر.");
        const targetId = removeMentionCharacters(command === "فك" ? args[2] : args[1]);
        if (!isValidId(targetId)) return message.reply("⚠️ الاستخدام: فك-السجن <user_id>");
        const res = await unjailUser(targetId, true);
        return message.reply(res ? `✅ تم فك السجن وإزالة الرتبة عن <@${targetId}>.` : "⚠️ هذا الشخص غير مسجون حاليًا.");
    }

    if (command === "!panel" || command === "!menu") {
        if (!canUsePanel(message)) return message.reply("❌ ليس لديك صلاحية استخدام لوحة التحكم.");
        return message.reply({ content: "⚙️ **لوحة التحكم:** اختر العملية المطلوبة من القائمة.", components: buildPanelComponents() });
    }
}));

// Handling Interactions (Panel Modals and Slash)
client.on("interactionCreate", (async interaction => {
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("jail_reason:")) {
        if (!canUseJail(interaction)) return interaction.reply({ content: "❌ ليس لديك صلاحية استخدام أمر السجن.", ephemeral: true });
        const targetId = interaction.customId.split(":")[1];
        const option = {
            qadhf: { reason: "قذف", duration: 10800000, label: "3 ساعات" },
            insult: { reason: "سب", duration: 7200000, label: "ساعتان" }
        }[interaction.values[0]];

        if (!option) return interaction.reply({ content: "⚠️ العقوبة غير صالحة.", ephemeral: true });
        const res = await jailUser(interaction.guild, targetId, option.reason, option.duration);
        if (!res.ok) return interaction.update({ content: res.message, components: [] });
        return interaction.update({ content: `✅ تم سجن <@${targetId}> بسبب **${option.reason}** لمدة **${option.label}**.`, components: [] });
    }
}));

// Automatic voice updates for muted/blocked users
client.on("voiceStateUpdate", (async (oldState, newState) => {
    if (serverMuteUsers.has(newState.id) && newState.channelId && !newState.serverMute) {
        await newState.setMute(true, "إعادة Server Mute الدائم").catch(() => { });
    }
    if (serverDeafenUsers.has(newState.id) && newState.channelId && !newState.serverDeaf) {
        await newState.setDeaf(true, "إعادة Black Deafen الدائم").catch(() => { });
    }
    if (newState.channelId && voiceBlockedUsers.has(newState.id)) {
        await newState.disconnect("ممنوع من دخول الرومات الصوتية").catch(() => { });
    }
}));

// Protected users ban protection & restore
client.on("guildBanRemove", (async ban => {
    if (!noBackEnabled || !noBackUsers.has(ban.user.id)) return;
    const reason = getNoBackReason(noBackUsers.get(ban.user.id));
    await ban.guild.bans.create(ban.user.id, { reason: `حظر دائم - ${reason}` }).catch(() => { });
}));

// ==================== BOT LOGIN ====================
client.login(TOKEN).catch((e) => {
    console.error("❌ فشل تسجيل الدخول. افحص DISCORD_TOKEN في Railway:", e);
    process.exitCode = 1;
});
