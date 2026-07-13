import os
import json
import re
import math
import logging
import asyncio
import discord
from discord import app_commands
from discord.ext import commands
from flask import Flask, jsonify
from threading import Thread

# ==================== ตั้งค่า ====================
TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "YOUR_BOT_TOKEN_HERE")
SONGS_FILE = "songs.json"
QUEUE_FILE = "queue.json"
CONFIG_FILE = "config.json"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("karaoke-bot")

# ==================== Flask Server (สำหรับ Roblox) ====================
app = Flask(__name__)

# In-memory state
_current_song = None
_is_playing = False

@app.route('/')
def home():
    return "🎤 Karaoke Bot is running!"

@app.route('/api/songs')
def get_songs():
    songs = load_songs()
    return jsonify(songs)

@app.route('/api/songs/<song_id>')
def get_song(song_id):
    songs = load_songs()
    return jsonify(songs.get(song_id, {}))

@app.route('/api/queue')
def get_queue():
    return jsonify(load_queue())

@app.route('/api/current')
def get_current():
    if _current_song:
        return jsonify(_current_song)
    return jsonify({"message": "No song playing", "playing": False})

@app.route('/api/lyrics/<song_id>/<int:time_pos>')
def get_lyric_at_time(song_id, time_pos):
    songs = load_songs()
    song = songs.get(song_id)
    if not song or not song.get("Lyrics"):
        return jsonify({"Current": "", "Previous": "", "Next": "", "Progress": 0})

    lyrics = song["Lyrics"]
    current, previous, next_text = "", "", ""
    progress = 0

    for i, line in enumerate(lyrics):
        if line["time"] <= time_pos:
            previous = current
            current = line.get("text", "")
            next_time = lyrics[i + 1]["time"] if i + 1 < len(lyrics) else (song.get("Duration", 999))
            progress = min(1.0, max(0.0, (time_pos - line["time"]) / max(next_time - line["time"], 1)))

    for line in lyrics:
        if line["time"] > time_pos:
            next_text = line.get("text", "")
            break

    return jsonify({
        "Current": current,
        "Previous": previous,
        "Next": next_text,
        "Progress": progress
    })

def run_flask():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port, debug=False)

# ==================== ฟังก์ชันช่วยเหลือ ====================
def load_songs():
    if not os.path.exists(SONGS_FILE):
        return {}
    with open(SONGS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_songs(songs):
    with open(SONGS_FILE, "w", encoding="utf-8") as f:
        json.dump(songs, f, ensure_ascii=False, indent=2)

def load_queue():
    if not os.path.exists(QUEUE_FILE):
        return []
    with open(QUEUE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_queue(queue):
    with open(QUEUE_FILE, "w", encoding="utf-8") as f:
        json.dump(queue, f, ensure_ascii=False, indent=2)

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return {}
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_config(cfg):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

def extract_roblox_id(url_or_id):
    if url_or_id.isdigit():
        return url_or_id
    patterns = [
        r"roblox\.com/library/(\d+)",
        r"roblox\.com/catalog/(\d+)",
        r"create\.roblox\.com/store/asset/(\d+)",
    ]
    for pattern in patterns:
        m = re.search(pattern, url_or_id)
        if m:
            return m.group(1)
    return None

def fmt_duration(secs):
    m, s = divmod(int(secs), 60)
    return f"{m}:{s:02d}"

# ==================== Voice & Queue Helper ====================
async def play_next_in_queue(guild):
    global _current_song, _is_playing
    queue = load_queue()
    if not queue:
        _current_song = None
        _is_playing = False
        return

    next_item = queue.pop(0)
    save_queue(queue)

    song_id = next_item.get("song_id")
    songs = load_songs()
    song = songs.get(song_id)
    if not song:
        return await play_next_in_queue(guild)

    _current_song = {
        "SongId": song_id,
        "SongName": song["SongName"],
        "Artist": song.get("Artist", "ไม่ระบุ"),
        "Duration": song.get("Duration", 180),
        "Lyrics": song.get("Lyrics", []),
        "RequestedBy": next_item.get("requested_by", "?"),
        "StartedAt": discord.utils.utcnow().isoformat(),
        "playing": True
    }

    voice_client = guild.voice_client
    audio_url = next_item.get("audio_url") or song.get("AudioUrl")

    if voice_client and audio_url:
        try:
            # ใช้ FFmpeg ถ้ามี (Render อาจไม่มีติดตั้งมา แต่ลองก่อน)
            import subprocess
            subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)

            source = discord.FFmpegPCMAudio(audio_url)
            voice_client.play(source, after=lambda e: asyncio.run_coroutine_threadsafe(play_next_in_queue(guild), bot.loop))
            _is_playing = True
            logger.info(f"Playing audio: {song['SongName']}")
        except Exception as e:
            logger.warning(f"Cannot play audio (ffmpeg missing or error): {e}")
            _is_playing = True
            await asyncio.sleep(song.get("Duration", 180))
            await play_next_in_queue(guild)
    else:
        _is_playing = True
        if not voice_client:
            logger.info(f"Playing (no voice): {song['SongName']}")
        await asyncio.sleep(song.get("Duration", 180))
        await play_next_in_queue(guild)

# ==================== Discord Bot ====================
intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True

bot = discord.Client(intents=intents)
tree = app_commands.CommandTree(bot)

@bot.event
async def on_ready():
    logger.info(f"Logged in as {bot.user} (ID: {bot.user.id})")
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.listening, name="คาราโอเกะ"))
    try:
        synced = await tree.sync()
        logger.info(f"Synced {len(synced)} slash command(s)")
    except Exception as e:
        logger.error(f"Failed to sync: {e}")

# ==================== คำสั่งหลัก ====================

@tree.command(name="auto", description="เพิ่มเพลงด้วย Roblox ID หรือ URL")
@app_commands.describe(
    url_or_id="Roblox ID หรือ URL",
    name="ชื่อเพลง",
    artist="ศิลปิน",
    duration="ความยาว (วินาที)",
)
async def cmd_auto(interaction: discord.Interaction, url_or_id: str, name: str = None, artist: str = "ไม่ระบุ", duration: int = 180):
    song_id = extract_roblox_id(url_or_id)
    if not song_id:
        await interaction.response.send_message("❌ แปลง ID ไม่ได้ ลองใส่ตัวเลขตรงๆ", ephemeral=True)
        return

    songs = load_songs()
    if song_id in songs:
        await interaction.response.send_message(f"⚠️ `{song_id}` มีอยู่แล้ว!", ephemeral=True)
        return

    songs[song_id] = {
        "SongId": song_id,
        "SongName": name or f"เพลง {song_id}",
        "Artist": artist,
        "Duration": duration,
        "BackgroundTextId": "0",
        "SkipRequired": 3,
        "Category": "pop",
        "Lyrics": [],
        "AddedBy": interaction.user.name,
        "Approved": False
    }
    save_songs(songs)

    embed = discord.Embed(title="✅ เพิ่มเพลงสำเร็จ!", color=0x2ecc71)
    embed.add_field(name="🎵 ชื่อ", value=songs[song_id]["SongName"], inline=False)
    embed.add_field(name="🎤 ศิลปิน", value=artist, inline=True)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(duration), inline=True)
    embed.add_field(name="🆔 ID", value=f"`{song_id}`", inline=False)
    embed.set_footer(text=f"เพิ่มโดย {interaction.user.name}")

    await interaction.response.send_message(embed=embed)

@tree.command(name="addurl", description="เพิ่มเพลงจาก URL เสียงโดยตรง")
@app_commands.describe(
    url="URL ของไฟล์เสียง",
    name="ชื่อเพลง",
    artist="ศิลปิน",
    duration="ความยาว (วินาที)",
)
async def cmd_addurl(interaction: discord.Interaction, url: str, name: str, artist: str = "ไม่ระบุ", duration: int = 180):
    song_id = str(abs(hash(url)) % 100000000)
    songs = load_songs()

    songs[song_id] = {
        "SongId": song_id,
        "SongName": name,
        "Artist": artist,
        "Duration": duration,
        "AudioUrl": url,
        "BackgroundTextId": "0",
        "SkipRequired": 3,
        "Category": "pop",
        "Lyrics": [],
        "AddedBy": interaction.user.name,
        "Approved": False
    }
    save_songs(songs)

    embed = discord.Embed(title="✅ เพิ่มเพลงจาก URL สำเร็จ!", color=0x2ecc71)
    embed.add_field(name="🎵 ชื่อ", value=name, inline=False)
    embed.add_field(name="🔗 URL", value=url[:50] + "...", inline=False)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(duration), inline=True)
    embed.set_footer(text=f"เพิ่มโดย {interaction.user.name}")

    await interaction.response.send_message(embed=embed)

@tree.command(name="lyrics", description="เพิ่มเนื้อเพลง (เวลาคำนวณอัตโนมัติ)")
@app_commands.describe(song_id="Roblox Asset ID หรือ Song ID", lyrics="เนื้อเพลง (บรรทัดละท่อน)")
async def cmd_lyrics(interaction: discord.Interaction, song_id: str, lyrics: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{song_id}`", ephemeral=True)
        return

    lines = [l.strip() for l in lyrics.strip().split("\n") if l.strip()]
    if not lines:
        await interaction.response.send_message("❌ ไม่พบเนื้อเพลง", ephemeral=True)
        return

    duration = songs[song_id]["Duration"]
    interval = duration / (len(lines) + 1)

    songs[song_id]["Lyrics"] = [
        {"time": int((i + 1) * interval), "text": line}
        for i, line in enumerate(lines)
    ]
    save_songs(songs)

    await interaction.response.send_message(f"✅ เพิ่มเนื้อเพลง `{len(lines)}` บรรทัดสำเร็จ!")

@tree.command(name="play", description="เพิ่มเพลงเข้าคิว")
@app_commands.describe(song_id="ID ของเพลง", audio_url="URL เสียง (ถ้ามี)")
async def cmd_play(interaction: discord.Interaction, song_id: str, audio_url: str = None):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{song_id}`", ephemeral=True)
        return

    queue = load_queue()
    queue.append({
        "song_id": song_id,
        "requested_by": interaction.user.name,
        "audio_url": audio_url or songs[song_id].get("AudioUrl"),
        "timestamp": discord.utils.utcnow().isoformat()
    })
    save_queue(queue)

    song = songs[song_id]
    embed = discord.Embed(title="🎵 เพิ่มเข้าคิวแล้ว!", color=0x3498db)
    embed.add_field(name="ชื่อ", value=song["SongName"], inline=False)
    embed.add_field(name="🎤 ศิลปิน", value=song.get("Artist", "ไม่ระบุ"), inline=True)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(song.get("Duration", 0)), inline=True)
    embed.add_field(name="📋 คิวที่", value=str(len(queue)), inline=True)
    embed.set_footer(text=f"ขอโดย {interaction.user.name}")

    await interaction.response.send_message(embed=embed)

    global _is_playing
    if not _is_playing and interaction.guild:
        await play_next_in_queue(interaction.guild)

@tree.command(name="queue", description="ดูคิวเพลงปัจจุบัน")
async def cmd_queue(interaction: discord.Interaction):
    queue = load_queue()
    songs = load_songs()

    if not queue:
        await interaction.response.send_message("📭 คิวว่างอยู่", ephemeral=True)
        return

    embed = discord.Embed(title="📋 คิวเพลง", color=0x9b59b6)
    for i, item in enumerate(queue[:10], 1):
        song = songs.get(item["song_id"], {})
        name = song.get("SongName", "ไม่พบ")
        req = item.get("requested_by", "?")
        embed.add_field(name=f"{i}. {name}", value=f"ขอโดย {req}", inline=False)

    await interaction.response.send_message(embed=embed)

@tree.command(name="skip", description="ข้ามเพลงปัจจุบัน")
async def cmd_skip(interaction: discord.Interaction):
    voice_client = interaction.guild.voice_client if interaction.guild else None
    if voice_client and voice_client.is_playing():
        voice_client.stop()

    global _is_playing
    _is_playing = False

    if interaction.guild:
        await play_next_in_queue(interaction.guild)

    await interaction.response.send_message("⏭️ ข้ามเพลงแล้ว!")

@tree.command(name="approve", description="อนุมัติเพลงให้เล่นใน Roblox (สำหรับแอดมิน)")
@app_commands.describe(song_id="ID เพลงที่จะอนุมัติ")
async def cmd_approve(interaction: discord.Interaction, song_id: str):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ ต้องเป็นแอดมินเท่านั้น!", ephemeral=True)
        return

    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{song_id}`", ephemeral=True)
        return

    songs[song_id]["Approved"] = True
    songs[song_id]["ApprovedBy"] = interaction.user.name
    save_songs(songs)

    queue = load_queue()
    if not any(q["song_id"] == song_id for q in queue):
        queue.append({
            "song_id": song_id,
            "requested_by": interaction.user.name,
            "audio_url": songs[song_id].get("AudioUrl"),
            "timestamp": discord.utils.utcnow().isoformat()
        })
        save_queue(queue)

    embed = discord.Embed(title="✅ อนุมัติเพลงแล้ว!", color=0x2ecc71)
    embed.add_field(name="🎵 เพลง", value=songs[song_id]["SongName"], inline=False)
    embed.add_field(name="🆔 ID", value=f"`{song_id}`", inline=True)
    embed.add_field(name="👤 อนุมัติโดย", value=interaction.user.name, inline=True)
    embed.set_footer(text="เพลงนี้จะถูกส่งไปยัง Roblox อัตโนมัติ")

    await interaction.response.send_message(embed=embed)

    global _is_playing
    if not _is_playing and interaction.guild:
        await play_next_in_queue(interaction.guild)

@tree.command(name="nowplaying", description="ดูเพลงที่กำลังเล่นอยู่")
async def cmd_nowplaying(interaction: discord.Interaction):
    global _current_song
    if not _current_song:
        await interaction.response.send_message("📭 ไม่มีเพลงกำลังเล่น", ephemeral=True)
        return

    embed = discord.Embed(title="🎵 กำลังเล่น", color=0xe74c3c)
    embed.add_field(name="ชื่อ", value=_current_song["SongName"], inline=False)
    embed.add_field(name="🎤 ศิลปิน", value=_current_song.get("Artist", "ไม่ระบุ"), inline=True)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(_current_song.get("Duration", 0)), inline=True)
    embed.add_field(name="🆔 ID", value=f"`{_current_song['SongId']}`", inline=False)
    if _current_song.get("RequestedBy"):
        embed.set_footer(text=f"ขอโดย {_current_song['RequestedBy']}")

    await interaction.response.send_message(embed=embed)

@tree.command(name="join", description="เข้าร่วม Voice Channel")
async def cmd_join(interaction: discord.Interaction):
    if not interaction.user.voice:
        await interaction.response.send_message("❌ คุณต้องอยู่ใน Voice Channel ก่อน!", ephemeral=True)
        return

    channel = interaction.user.voice.channel
    if interaction.guild.voice_client:
        await interaction.guild.voice_client.move_to(channel)
    else:
        await channel.connect()

    await interaction.response.send_message(f"🔊 เข้าร่วม {channel.name} แล้ว!")

@tree.command(name="leave", description="ออกจาก Voice Channel")
async def cmd_leave(interaction: discord.Interaction):
    if interaction.guild.voice_client:
        await interaction.guild.voice_client.disconnect()
        await interaction.response.send_message("👋 ออกจาก Voice Channel แล้ว")
    else:
        await interaction.response.send_message("❌ ไม่ได้อยู่ใน Voice Channel", ephemeral=True)

@tree.command(name="list", description="ดูรายการเพลงทั้งหมด")
async def cmd_list(interaction: discord.Interaction):
    songs = load_songs()
    if not songs:
        await interaction.response.send_message("📭 ไม่มีเพลงในระบบ", ephemeral=True)
        return

    msg = "🎵 **รายการเพลง**\n"
    for sid, song in list(songs.items())[:15]:
        lyric_count = len(song.get("Lyrics", []))
        approved = "✅" if song.get("Approved") else "⏳"
        status = "🎤" if lyric_count > 0 else "⏳"
        msg += f"{approved} {status} `{sid}` - {song['SongName']} ({song['Artist']})\n"

    await interaction.response.send_message(msg)

@tree.command(name="remove", description="ลบเพลง")
@app_commands.describe(song_id="Roblox Asset ID")
async def cmd_remove(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message("❌ ไม่พบเพลง", ephemeral=True)
        return

    name = songs[song_id]["SongName"]
    del songs[song_id]
    save_songs(songs)

    await interaction.response.send_message(f"🗑️ ลบ **{name}** (`{song_id}`) สำเร็จ")

@tree.command(name="info", description="ดูข้อมูลเพลง")
@app_commands.describe(song_id="Roblox Asset ID")
async def cmd_info(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{song_id}`", ephemeral=True)
        return

    s = songs[song_id]
    lc = len(s.get("Lyrics", []))

    embed = discord.Embed(title=s["SongName"], color=0x3498db)
    embed.add_field(name="🆔 ID", value=f"`{s['SongId']}`", inline=True)
    embed.add_field(name="🎤 ศิลปิน", value=s.get("Artist", "ไม่ระบุ"), inline=True)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(s.get("Duration", 0)), inline=True)
    embed.add_field(name="📝 ซับ", value=f"{lc} บรรทัด", inline=True)
    embed.add_field(name="✅ อนุมัติ", value="ใช่" if s.get("Approved") else "รออนุมัติ", inline=True)
    embed.add_field(name="➕ เพิ่มโดย", value=s.get("AddedBy", "?"), inline=True)
    if s.get("AudioUrl"):
        embed.add_field(name="🔗 Audio URL", value=s["AudioUrl"][:40] + "...", inline=False)

    await interaction.response.send_message(embed=embed)

# ==================== รัน ====================
if __name__ == "__main__":
    flask_thread = Thread(target=run_flask)
    flask_thread.start()

    if not TOKEN or TOKEN == "YOUR_BOT_TOKEN_HERE":
        logger.error("❌ ใส่ Discord Bot Token ใน Environment ก่อน!")
        raise SystemExit(1)

    logger.info("🚀 กำลัง启动 Bot...")
    bot.run(TOKEN, log_handler=None)
