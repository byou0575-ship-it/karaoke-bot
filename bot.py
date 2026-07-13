import os
import json
import re
import math
import logging
import discord
from discord import app_commands
from discord.ext import commands
from flask import Flask
from threading import Thread

# ==================== ตั้งค่า ====================
TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "YOUR_BOT_TOKEN_HERE")
SONGS_FILE = "songs.json"
CONFIG_FILE = "config.json"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("karaoke-bot")

# ==================== Flask Server (สำหรับ Roblox ดึงข้อมูล) ====================
app = Flask(__name__)

@app.route('/')
def home():
    return "🎤 Karaoke Bot is running!"

@app.route('/api/songs')
def get_songs():
    songs = load_songs()
    return songs

@app.route('/api/songs/<song_id>')
def get_song(song_id):
    songs = load_songs()
    return songs.get(song_id, {})

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

# ==================== Discord Bot ====================
intents = discord.Intents.default()
intents.message_content = True
bot = discord.Client(intents=intents)
tree = app_commands.CommandTree(bot)

@bot.event
async def on_ready():
    logger.info(f"Logged in as {bot.user} (ID: {bot.user.id})")
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.listening, name="!karaoke"))
    try:
        synced = await tree.sync()
        logger.info(f"Synced {len(synced)} slash command(s)")
    except Exception as e:
        logger.error(f"Failed to sync: {e}")

# ==================== คำสั่งหลัก ====================

# /karaoke auto - เพิ่มเพลงอัตโนมัติ
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
    
    # ตรวจสอบซ้ำ
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
    }
    save_songs(songs)
    
    embed = discord.Embed(title="✅ เพิ่มเพลงสำเร็จ!", color=0x2ecc71)
    embed.add_field(name="🎵 ชื่อ", value=songs[song_id]["SongName"], inline=False)
    embed.add_field(name="🎤 ศิลปิน", value=artist, inline=True)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(duration), inline=True)
    embed.add_field(name="🆔 ID", value=f"`{song_id}`", inline=False)
    embed.set_footer(text=f"เพิ่มโดย {interaction.user.name}")
    
    await interaction.response.send_message(embed=embed)

# /karaoke lyrics - เพิ่มเนื้อเพลง
@tree.command(name="lyrics", description="เพิ่มเนื้อเพลง (เวลาคำนวณอัตโนมัติ)")
@app_commands.describe(song_id="Roblox Asset ID", lyrics="เนื้อเพลง (บรรทัดละท่อน)")
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
        {"Time": int((i + 1) * interval), "Text": line}
        for i, line in enumerate(lines)
    ]
    save_songs(songs)
    
    await interaction.response.send_message(f"✅ เพิ่มเนื้อเพลง `{len(lines)}` บรรทัดสำเร็จ!")

# /karaoke list - ดูรายการเพลง
@tree.command(name="list", description="ดูรายการเพลงทั้งหมด")
async def cmd_list(interaction: discord.Interaction):
    songs = load_songs()
    if not songs:
        await interaction.response.send_message("📭 ไม่มีเพลงในระบบ", ephemeral=True)
        return
    
    msg = "🎵 **รายการเพลง**\n"
    for sid, song in list(songs.items())[:15]:
        lyric_count = len(song.get("Lyrics", []))
        status = "✅" if lyric_count > 0 else "⏳"
        msg += f"{status} `{sid}` - {song['SongName']} ({song['Artist']})\n"
    
    await interaction.response.send_message(msg)

# /karaoke remove - ลบเพลง
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

# /karaoke info - ดูข้อมูลเพลง
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
    embed.add_field(name="➕ เพิ่มโดย", value=s.get("AddedBy", "?"), inline=True)
    
    await interaction.response.send_message(embed=embed)

# ==================== รัน ====================
if __name__ == "__main__":
    # รัน Flask ใน Thread แยก
    flask_thread = Thread(target=run_flask)
    flask_thread.start()
    
    if not TOKEN or TOKEN == "YOUR_BOT_TOKEN_HERE":
        logger.error("❌ ใส่ Discord Bot Token ใน Secrets ก่อน!")
        print("\n" + "="*50)
        print("วิธีใส่ Token:")
        print("1. กดแท็บ 'Secrets' (🔒 ด้านซ้าย)")
        print("2. สร้าง Key: DISCORD_BOT_TOKEN")
        print("3. Value: ใส่ Token ของคุณ")
        print("="*50)
        raise SystemExit(1)
    
    logger.info("🚀 กำลัง启动 Bot...")
    bot.run(TOKEN, log_handler=None)