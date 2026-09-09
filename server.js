const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Express Server
const app = express();
app.get('/', (req, res) => {
    res.send('Bot is running!');
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

// Roblox Config
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ROBLOX_USER_ID = process.env.ROBLOX_USER_ID;

let songs = {};
let autoTask = null;
let songChannelId = null;

// ระบบคัดกรองเนื้อหา
const BANNED_WORDS = [
    "กู", "มึง", "เหี้ย", "สัส", "ไอ้", "xxx", "porn", "sex", "18+",
    "การเมือง", "รัฐบาล", "ทหาร", "ประท้วง", "บูลลี่", "bully",
    "เหยียด", "ชาติพันธุ์", "ยิง", "ฆ่า", "ตาย", "ฆาตกรรม", "ข่มขืน"
];

function isBanned(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    for (const word of BANNED_WORDS) {
        if (text.includes(word.toLowerCase())) return true;
    }
    return false;
}

function fmtDuration(secs) {
    if (!secs) return "ไม่ทราบ";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ★★★ GD Studio Music API Functions ★★★
const API_BASE = "https://music-api.gdstudio.xyz/api.php";

async function searchSongs(query, source = 'joox', count = 15) {
    try {
        const response = await axios.get(API_BASE, {
            params: {
                types: 'search',
                source: source,
                name: query,
                count: count
            },
            timeout: 15000
        });
        return response.data;
    } catch (error) {
        console.error('Error searching songs via API:', error);
        return [];
    }
}

// ดึง URL ดาวน์โหลด MP3
async function getDownloadUrl(songId) {
    try {
        const response = await axios.get(API_BASE, {
            params: {
                types: 'url',
                source: 'joox',
                id: songId,
                quality: '128'
            },
            timeout: 15000
        });
        return response.data.url || response.data;
    } catch (error) {
        console.error('Error getting download URL:', error);
        return null;
    }
}

// ★★★ ฟังก์ชันดาวน์โหลด + อัปโหลด Roblox ★★★
async function addSongFromAPI(query, interaction = null) {
    try {
        // 1. ค้นหาเพลง
        const results = await searchSongs(query);
        if (!results || results.length === 0) return 'failed';

        const song = results[0];
        const title = song.title || 'Unknown';
        const artist = song.singer || song.artist || 'Unknown';
        const songId = song.id || song.songId || null;

        if (isBanned(title, artist)) return 'banned';
        if (!songId) return 'failed';

        // 2. ดึง URL ดาวน์โหลด
        const downloadUrl = await getDownloadUrl(songId);
        if (!downloadUrl) return 'failed';

        // 3. ดาวน์โหลดไฟล์เสียง
        const tempDir = path.join(__dirname, 'temp_audio');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        const outputPath = path.join(tempDir, `${songId}.mp3`);

        const fileResponse = await axios.get(downloadUrl, { responseType: 'stream', timeout: 60000 });
        const writer = fs.createWriteStream(outputPath);
        fileResponse.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 4. อัปโหลดขึ้น Roblox อัตโนมัติ
        let assetId = null;
        if (ROBLOX_API_KEY && ROBLOX_USER_ID) {
            const fileBuffer = fs.readFileSync(outputPath);
            const fileSize = fileBuffer.length;

            if (fileSize <= 20 * 1024 * 1024) {
                try {
                    const payload = {
                        "assetType": "Audio",
                        "displayName": title.slice(0, 50),
                        "description": `Karaoke: ${title} โดย ${artist}`,
                        "creationContext": {
                            "creator": {
                                "userId": parseInt(ROBLOX_USER_ID)
                            }
                        }
                    };

                    const formData = new FormData();
                    formData.append('request', JSON.stringify(payload));
                    formData.append('fileContent', new Blob([fileBuffer], { type: 'audio/mpeg' }), `${songId}.mp3`);

                    const robResponse = await fetch("https://apis.roblox.com/assets/v1/assets", {
                        method: 'POST',
                        headers: { 'x-api-key': ROBLOX_API_KEY },
                        body: formData
                    });

                    const robData = await robResponse.json();
                    assetId = robData.assetId ? String(robData.assetId) : null;
                } catch (e) {
                    console.error('Roblox upload error:', e);
                }
            }
        }

        // 5. บันทึกเพลงลงระบบ
        songs[songId] = {
            id: songId,
            title: title,
            artist: artist,
            url: downloadUrl,
            duration: song.duration || 0,
            thumbnail: song.pic || song.img || null,
            robloxAssetId: assetId
        };
        await refreshMessage();
        return 'success';
    } catch (error) {
        console.error('Error in addSongFromAPI:', error);
        return 'failed';
    }
}

// ★★★ ฟังก์ชันค้นหาศิลปินทั้งหมด ★★★
async function syncArtistSongs(artistName, interaction) {
    const startTime = Date.now();
    try {
        const results = await searchSongs(artistName, 'joox', 50);
        const totalSongs = results.length;
        const added = [];
        const banned = [];
        const failed = [];

        if (totalSongs === 0) {
            await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ **ไม่พบเพลงของ ${artistName}!**`).setColor(0xe74c3c)] });
            return;
        }

        // เริ่มโหลดทีละเพลง (5 วิ/เพลง)
        for (let i = 0; i < results.length; i++) {
            const song = results[i];

            // บอกว่าเพลงที่เท่าไหร่กำลังโหลด
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`⏳ กำลังโหลดเพลงที่ ${i + 1}/${totalSongs}`)
                    .setDescription(`🎵 **${song.title || 'Unknown'}**`)
                    .setColor(0xf1c40f)
                    .setThumbnail(song.pic || '')
                ]
            });

            // เริ่มดึง (ตรวจคัดกรอง + ดึงไฟล์)
            const startTrack = Date.now();
            const result = await addSongFromAPI(song.title + ' ' + (song.singer || ''), null);
            const elapsed = ((Date.now() - startTrack) / 1000).toFixed(1);

            if (result === 'success') {
                added.push(song);
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`✅ เพลง ${i + 1}/${totalSongs} สำเร็จ!`)
                        .setDescription(`🎵 **${song.title}**\n🎤 ${song.singer || 'Unknown'}\n\n⏱️ ใช้เวลา: **${elapsed} วินาที**`)
                        .setColor(0x57F287)
                        .setThumbnail(song.pic || '')
                    ]
                });
            } else if (result === 'banned') {
                banned.push(song);
            } else {
                failed.push(song);
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // สรุปผล
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const addedList = added.map(s => `- **${s.title}** (🎤 ${s.singer || 'Unknown'})`).join('\n') || 'ไม่มีเพลงที่เพิ่ม';

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ ดึงเพลงของศิลปินสำเร็จ!')
                .setDescription(`🎤 ศิลปิน: **${artistName}**\n\n**รายชื่อเพลงที่เพิ่ม:**\n${addedList}`)
                .addFields(
                    { name: '➕ เพิ่มแล้ว', value: `${added.length} เพลง`, inline: true },
                    { name: '⛔ ถูกคัดกรอง', value: `${banned.length} เพลง`, inline: true },
                    { name: '⏱️ เวลารวม', value: `${totalTime} วินาที`, inline: true }
                )
                .setColor(0x57F287)
                .setThumbnail('https://i.imgur.com/4rqM0lD.png')
            ]
        });
    } catch (error) {
        console.error('Error syncing artist:', error);
        await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`).setColor(0xe74c3c)] });
    }
}

// รีเฟรชข้อความสวยงาม
async function refreshMessage() {
    if (!songChannelId) return;
    const channel = client.channels.cache.get(songChannelId);
    if (!channel) return;

    const songList = Object.values(songs);
    const uniqueArtists = [...new Set(songList.map(s => s.artist))].length;

    const embed = new EmbedBuilder()
        .setTitle('🎤 รายการเพลง Karaoke')
        .setDescription(songList.length === 0 ? 'ยังไม่มีเพลงในคลัง' : songList.map(s => `**${s.title}**\n🎤 ${s.artist} · ⏱ ${fmtDuration(s.duration)} · \`${s.id}\`\n🟢 Roblox: ${s.robloxAssetId ? `✅ (${s.robloxAssetId})` : 'ยังไม่ทำ'}`).join('\n\n'))
        .setColor(0x000000)
        .setFooter({ text: `รวม ${songList.length} เพลง · ศิลปิน ${uniqueArtists} คน` });

    const existingMessages = await channel.messages.fetch({ limit: 5 }).catch(() => []);
    for (const msg of existingMessages.values()) {
        if (msg.author.id === client.user.id && msg.embeds.length > 0) {
            await msg.edit({ embeds: [embed] }).catch(() => {});
            return;
        }
    }
    await channel.send({ embeds: [embed] });
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    if (ROBLOX_API_KEY && ROBLOX_USER_ID) console.log(`Roblox upload ready!`);

    const commands = [
        new SlashCommandBuilder().setName('ตั้งค่า').setDescription('ตั้งค่าช่องสำหรับแสดงรายการเพลง'),
        new SlashCommandBuilder().setName('หาเพลง').setDescription('ค้นหาและเพิ่มเพลงจาก Joox โดยใช้ชื่อเพลง').addStringOption(option => option.setName('ชื่อเพลง').setDescription('ชื่อเพลงหรือชื่อศิลปิน').setRequired(true)),
        new SlashCommandBuilder().setName('ศิลปิน').setDescription('ดึงเพลงทั้งหมดของศิลปินที่ระบุ').addStringOption(option => option.setName('ชื่อศิลปิน').setDescription('ชื่อศิลปิน').setRequired(true)),
        new SlashCommandBuilder().setName('เพลงฮิต').setDescription('ดึงเพลงยอดนิยม 10 อันดับแรก'),
        new SlashCommandBuilder().setName('เริ่มหาเพลง').setDescription('เริ่มระบบหาเพลงอัตโนมัติ'),
        new SlashCommandBuilder().setName('หยุดหาเพลง').setDescription('หยุดระบบหาเพลงอัตโนมัติ'),
        new SlashCommandBuilder().setName('ลบเพลง').setDescription('ลบเพลงออกจากระบบ').addStringOption(option => option.setName('id').setDescription('ID ของเพลงที่ต้องการลบ').setRequired(true)),
        new SlashCommandBuilder().setName('ดูคลังเพลง').setDescription('ดูรายการเพลงทั้งหมดที่มีในระบบ'),
        new SlashCommandBuilder().setName('สุ่มเพลง').setDescription('สุ่มเพลงหนึ่งเพลงจากคลัง'),
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }

    refreshMessage();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;
    const replyEmbed = new EmbedBuilder().setColor(0x000000);

    if (commandName === 'ตั้งค่า') {
        songChannelId = interaction.channelId;
        process.env.SONG_CHANNEL_ID = interaction.channelId;
        await interaction.reply({ embeds: [replyEmbed.setDescription('✅ ตั้งค่าช่องเพลงเรียบร้อยแล้ว!')] });
        await refreshMessage();
    }

    if (commandName === 'หาเพลง') {
        const query = options.getString('ชื่อเพลง');
        await interaction.deferReply();
        await interaction.editReply({ embeds: [replyEmbed.setDescription(`⏳ **กำลังค้นหาเพลง:** ${query}...`)] });
        try {
            const result = await addSongFromAPI(query);
            if (result === 'success') {
                const addedSong = songs[Object.keys(songs).pop()];
                await interaction.editReply({
                    embeds: [replyEmbed
                        .setTitle('✅ เพิ่มเพลงสำเร็จ!')
                        .setThumbnail(addedSong.thumbnail)
                        .addFields(
                            { name: '🎵 ชื่อเพลง', value: addedSong.title, inline: true },
                            { name: '🎤 ศิลปิน', value: addedSong.artist, inline: true },
                            { name: '⏱️ ความยาว', value: fmtDuration(addedSong.duration), inline: true },
                            { name: '🟢 Roblox', value: addedSong.robloxAssetId ? `อัปโหลดสำเร็จ (ID: ${addedSong.robloxAssetId})` : 'ยังไม่ได้อัปโหลด', inline: true }
                        )
                    ]
                });
            } else if (result === 'banned') {
                await interaction.editReply({ embeds: [replyEmbed.setDescription('⛔ **เพลงนี้มีเนื้อหาต้องห้าม** ไม่สามารถเพิ่มได้!')] });
            } else {
                await interaction.editReply({ embeds: [replyEmbed.setDescription('❌ **หาเพลงไม่สำเร็จ!**')] });
            }
        } catch (error) {
            console.error('Error searching:', error);
            await interaction.editReply({ embeds: [replyEmbed.setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`)] });
        }
    }

    if (commandName === 'ศิลปิน') {
        const artist = options.getString('ชื่อศิลปิน');
        await interaction.deferReply();
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`🔍 กำลังค้นหาช่องของ: ${artist}`).setColor(0x000000)] });
        await syncArtistSongs(artist, interaction);
    }

    if (commandName === 'เพลงฮิต') {
        await interaction.deferReply();
        await interaction.editReply({ embeds: [new EmbedBuilder().setDescription('⏳ **กำลังดึงเพลงยอดนิยม...**').setColor(0xf1c40f)] });
        const startTime = Date.now();
        try {
            const results = await searchSongs('เพลงไทย', 'joox', 10);
            const added = [];
            const banned = [];

            for (let i = 0; i < results.length; i++) {
                const song = results[i];
                const startTrack = Date.now();
                const result = await addSongFromAPI(song.title + ' ' + (song.singer || ''), null);
                const elapsed = ((Date.now() - startTrack) / 1000).toFixed(1);

                if (result === 'success') added.push(song);
                if (result === 'banned') banned.push(song);

                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`✅ เพลง ${i + 1}/${results.length} สำเร็จ!`)
                        .setDescription(`🎵 **${song.title}**\n🎤 ${song.singer || 'Unknown'}\n\n⏱️ ใช้เวลา: **${elapsed} วินาที**`)
                        .setColor(0x57F287)
                        .setThumbnail(song.pic || '')
                    ]
                });

                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            const addedList = added.map(s => `- **${s.title}** (🎤 ${s.singer || 'Unknown'})`).join('\n') || 'ไม่มีเพลงที่เพิ่ม';

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ ดึงเพลงยอดนิยมสำเร็จ!')
                    .setDescription(`**รายชื่อเพลงที่เพิ่ม:**\n${addedList}`)
                    .addFields(
                        { name: '➕ เพิ่มแล้ว', value: `${added.length} เพลง`, inline: true },
                        { name: '⛔ ถูกคัดกรอง', value: `${banned.length} เพลง`, inline: true },
                        { name: '⏱️ เวลารวม', value: `${totalTime} วินาที`, inline: true }
                    )
                    .setColor(0x57F287)
                ]
            });
        } catch (error) {
            await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ **เกิดข้อผิดพลาด:** ${error.message}`).setColor(0xe74c3c)] });
        }
    }

    if (commandName === 'เริ่มหาเพลง') {
        if (autoTask) {
            await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ **ระบบหาเพลงอัตโนมัติกำลังทำงานอยู่แล้ว!**')] });
            return;
        }
        await interaction.reply({ embeds: [replyEmbed.setDescription('🚀 **เริ่มระบบหาเพลงอัตโนมัติแล้ว!**')] });
        autoTask = setInterval(async () => {
            try {
                const results = await searchSongs('เพลงไทย', 'joox', 5);
                if (results && results.length > 0) {
                    await addSongFromAPI(results[0].title + ' ' + (results[0].singer || ''));
                }
            } catch (error) {
                console.error('Auto add error:', error);
            }
        }, 60000);
    }

    if (commandName === 'หยุดหาเพลง') {
        if (autoTask) {
            clearInterval(autoTask);
            autoTask = null;
            await interaction.reply({ embeds: [replyEmbed.setDescription('⏹️ **หยุดระบบหาเพลงอัตโนมัติแล้ว!**')] });
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('⚠️ **ระบบหาเพลงอัตโนมัติไม่ได้ทำงานอยู่!**')] });
        }
    }

    if (commandName === 'ลบเพลง') {
        const songId = options.getString('id');
        if (songs[songId]) {
            delete songs[songId];
            await interaction.reply({ embeds: [replyEmbed.setDescription(`✅ **ลบเพลง ${songId} แล้ว!**`)] });
        } else {
            await interaction.reply({ embeds: [replyEmbed.setDescription('❌ **ไม่พบเพลงนี้!**')] });
        }
    }

    if (commandName === 'ดูคลังเพลง') {
        const songList = Object.values(songs);
        const uniqueArtists = [...new Set(songList.map(s => s.artist))].length;
        replyEmbed
            .setTitle('📂 สถิติคลังเพลง')
            .addFields(
                { name: '🎵 เพลงทั้งหมด', value: `${songList.length} เพลง`, inline: true },
                { name: '🎤 ศิลปินทั้งหมด', value: `${uniqueArtists} คน`, inline: true },
                { name: '🆔 ID ล่าสุด', value: songList.length > 0 ? songList[songList.length - 1].id : 'ไม่มี', inline: true }
            );
        await interaction.reply({ embeds: [replyEmbed] });
    }

    if (commandName === 'สุ่มเพลง') {
        const songList = Object.values(songs);
        if (songList.length === 0) {
            await interaction.reply({ embeds: [replyEmbed.setDescription('📭 **คลังเพลงว่างเปล่า!**')] });
            return;
        }
        const randomSong = songList[Math.floor(Math.random() * songList.length)];
        replyEmbed
            .setTitle('🎲 สุ่มได้เพลงนี้!')
            .addFields(
                { name: '🎵 ชื่อเพลง', value: randomSong.title, inline: true },
                { name: '🎤 ศิลปิน', value: randomSong.artist, inline: true },
                { name: '🆔 ID', value: randomSong.id, inline: true }
            )
            .setThumbnail(randomSong.thumbnail);
        await interaction.reply({ embeds: [replyEmbed] });
    }
});

client.login(token);
