import os
import json
import re
import math
import logging
import random
import datetime
import hashlib
import urllib.request
import urllib.parse
import threading
import time
import asyncio
import discord
from discord import app_commands
from discord.ui import View, Button
from collections import defaultdict
from flask import Flask

# ──────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("discord-bot")

# ──────────────────────────────────────────────
# Config & Paths
# ──────────────────────────────────────────────
TOKEN       = os.environ.get("DISCORD_BOT_TOKEN")
SONGS_FILE  = os.path.join(os.path.dirname(__file__), "songs.json")
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")
QUEUE_FILE  = os.path.join(os.path.dirname(__file__), "queue.json")
RATINGS_FILE = os.path.join(os.path.dirname(__file__), "ratings.json")
COVERS_DIR  = os.path.join(os.path.dirname(__file__), "covers")

# ──────────────────────────────────────────────
# Flask Web Server (สำหรับ Render port binding)
# ──────────────────────────────────────────────
app = Flask(__name__)

@app.route("/")
def home():
    return "Karaoke Bot is running!", 200

@app.route("/health")
def health():
    return {"status": "ok", "bot": str(bot.user) if bot.user else "offline"}, 200

@app.route("/api/songs")
def api_songs():
    """API สำหรับ Roblox ดึงข้อมูลเพลง"""
    songs = load_songs()
    return songs, 200, {"Content-Type": "application/json"}

@app.route("/api/queue")
def api_queue():
    """API สำหรับดูคิวปัจจุบัน"""
    return load_queue(), 200, {"Content-Type": "application/json"}

def run_flask():
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, threaded=True)

# ──────────────────────────────────────────────
# Data helpers (with caching)
# ──────────────────────────────────────────────

_songs_cache = None
_songs_mtime = 0
_config_cache = None
_config_mtime = 0
_ratings_cache = None
_ratings_mtime = 0

def load_songs() -> dict:
    global _songs_cache, _songs_mtime
    try:
        mtime = os.path.getmtime(SONGS_FILE)
        if _songs_cache is not None and mtime == _songs_mtime:
            return _songs_cache
    except OSError:
        return {}
    if not os.path.exists(SONGS_FILE):
        return {}
    with open(SONGS_FILE, "r", encoding="utf-8") as f:
        _songs_cache = json.load(f)
    _songs_mtime = os.path.getmtime(SONGS_FILE)
    return _songs_cache

def save_songs(songs: dict) -> None:
    global _songs_cache, _songs_mtime
    with open(SONGS_FILE, "w", encoding="utf-8") as f:
        json.dump(songs, f, ensure_ascii=False, indent=2)
    _songs_cache = songs
    _songs_mtime = os.path.getmtime(SONGS_FILE)

def load_config() -> dict:
    global _config_cache, _config_mtime
    try:
        mtime = os.path.getmtime(CONFIG_FILE)
        if _config_cache is not None and mtime == _config_mtime:
            return _config_cache
    except OSError:
        return {}
    if not os.path.exists(CONFIG_FILE):
        return {}
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        _config_cache = json.load(f)
    _config_mtime = os.path.getmtime(CONFIG_FILE)
    return _config_cache

def save_config(cfg: dict) -> None:
    global _config_cache, _config_mtime
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    _config_cache = cfg
    _config_mtime = os.path.getmtime(CONFIG_FILE)

def load_queue() -> list:
    if not os.path.exists(QUEUE_FILE):
        return []
    with open(QUEUE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_queue(q: list) -> None:
    with open(QUEUE_FILE, "w", encoding="utf-8") as f:
        json.dump(q, f, ensure_ascii=False, indent=2)

def load_ratings() -> dict:
    global _ratings_cache, _ratings_mtime
    try:
        mtime = os.path.getmtime(RATINGS_FILE)
        if _ratings_cache is not None and mtime == _ratings_mtime:
            return _ratings_cache
    except OSError:
        return {}
    if not os.path.exists(RATINGS_FILE):
        return {}
    with open(RATINGS_FILE, "r", encoding="utf-8") as f:
        _ratings_cache = json.load(f)
    _ratings_mtime = os.path.getmtime(RATINGS_FILE)
    return _ratings_cache

def save_ratings(r: dict) -> None:
    global _ratings_cache, _ratings_mtime
    with open(RATINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=2)
    _ratings_cache = r
    _ratings_mtime = os.path.getmtime(RATINGS_FILE)

def extract_roblox_id(url_or_id: str) -> str | None:
    if url_or_id.isdigit():
        return url_or_id
    for pattern in [
        r"roblox\.com/library/(\d+)",
        r"roblox\.com/catalog/(\d+)",
        r"create\.roblox\.com/store/asset/(\d+)",
    ]:
        m = re.search(pattern, url_or_id)
        if m:
            return m.group(1)
    return None

def fmt_duration(secs: int) -> str:
    m, s = divmod(int(secs), 60)
    return f"{m}:{s:02d}"

# ──────────────────────────────────────────────
# ดึงชื่อศิลปินจาก URL
# ──────────────────────────────────────────────

def extract_artist_from_url(url: str) -> str:
    try:
        if "youtube.com" in url or "youtu.be" in url:
            return "YouTube"
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.replace("www.", "").split(".")[0]
        return domain.capitalize()
    except:
        return "ไม่ระบุ"

# ──────────────────────────────────────────────
# ดาวน์โหลดปกเพลง
# ──────────────────────────────────────────────

def download_cover(cover_url: str, song_id: str) -> str | None:
    if not cover_url:
        return None
    try:
        os.makedirs(COVERS_DIR, exist_ok=True)
        ext = cover_url.split(".")[-1].split("?")[0][:4]
        if ext not in ["jpg", "jpeg", "png", "webp", "gif"]:
            ext = "jpg"
        filename = f"{song_id}.{ext}"
        filepath = os.path.join(COVERS_DIR, filename)
        req = urllib.request.Request(cover_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            with open(filepath, "wb") as f:
                f.write(response.read())
        return filepath
    except Exception as e:
        logger.warning(f"Failed to download cover: {e}")
        return None

# ──────────────────────────────────────────────
# กันซ้ำ - เช็คชื่อเพลง
# ──────────────────────────────────────────────

def find_duplicate_song(songs: dict, song_name: str) -> str | None:
    search_name = song_name.lower().strip()
    for sid, song in songs.items():
        if song.get("SongName", "").lower().strip() == search_name:
            return sid
    return None

# ──────────────────────────────────────────────
# Views (ปุ่มโต้ตอบ)
# ──────────────────────────────────────────────

class SongListView(View):
    def __init__(self, client: discord.Client):
        super().__init__(timeout=None)
        self.client = client

    @discord.ui.button(label="🎲 สุ่มเพลง", style=discord.ButtonStyle.green, custom_id="karaoke_btn_random")
    async def random_btn(self, interaction: discord.Interaction, button: Button):
        songs = load_songs()
        if not songs:
            return await interaction.response.send_message("📭 คลังเพลงว่างเปล่า", ephemeral=True)
        s = random.choice(list(songs.values()))
        e = discord.Embed(title="🎲 สุ่มเพลง", color=0xe74c3c)
        e.add_field(name="🎵 เพลง", value=s.get("SongName", "ไม่มีชื่อ"), inline=False)
        e.add_field(name="🎤 ศิลปิน", value=s.get("Artist", "ไม่ระบุ"), inline=True)
        e.add_field(name="⏱️ ความยาว", value=fmt_duration(s.get("Duration", 0)), inline=True)
        e.add_field(name="🆔 ID", value=f"`{s['SongId']}`", inline=True)
        if s.get("CoverUrl"):
            e.set_thumbnail(url=s["CoverUrl"])
        e.set_footer(text="กด 🎲 สุ่มอีกครั้ง!")
        await interaction.response.send_message(embed=e, ephemeral=True)

    @discord.ui.button(label="📋 คิวปัจจุบัน", style=discord.ButtonStyle.blurple, custom_id="karaoke_btn_queue")
    async def queue_btn(self, interaction: discord.Interaction, button: Button):
        queue = load_queue()
        if not queue:
            return await interaction.response.send_message(
                "📭 คิวว่างอยู่ — ใช้ `/karaoke queue add <song_id>`", ephemeral=True
            )
        songs = load_songs()
        lines = []
        for i, item in enumerate(queue[:15], 1):
            s = songs.get(item["song_id"], {})
            name = s.get("SongName", item["song_id"])
            lines.append(f"{i}. **{name}** — 🎤 {item['user']}")
        if len(queue) > 15:
            lines.append(f"...และอีก {len(queue)-15} เพลง")
        e = discord.Embed(title="📋 คิวร้องเพลง", description="\n".join(lines), color=0x3498db)
        e.set_footer(text=f"รวม {len(queue)} เพลงในคิว")
        await interaction.response.send_message(embed=e, ephemeral=True)

    @discord.ui.button(label="🔄 รีเฟรช", style=discord.ButtonStyle.grey, custom_id="karaoke_btn_refresh")
    async def refresh_btn(self, interaction: discord.Interaction, button: Button):
        await interaction.response.defer(ephemeral=True, thinking=True)
        await refresh_song_channel(self.client)
        await interaction.followup.send("✅ รีเฟรชรายการเพลงแล้ว!", ephemeral=True)

    @discord.ui.button(label="⭐ อันดับเพลงฮิต", style=discord.ButtonStyle.red, custom_id="karaoke_btn_top")
    async def top_btn(self, interaction: discord.Interaction, button: Button):
        ratings = load_ratings()
        songs = load_songs()
        if not ratings:
            return await interaction.response.send_message(
                "ยังไม่มีคะแนน — ใช้ `/karaoke like <id>`", ephemeral=True
            )
        sorted_ratings = sorted(ratings.items(), key=lambda x: x[1], reverse=True)[:10]
        lines = []
        for i, (sid, score) in enumerate(sorted_ratings, 1):
            s = songs.get(sid, {})
            name = s.get("SongName", sid)
            lines.append(f"{i}. **{name}** — ⭐ {score} คะแนน")
        e = discord.Embed(title="🏆 เพลงยอดนิยม", description="\n".join(lines), color=0xf1c40f)
        await interaction.response.send_message(embed=e, ephemeral=True)

# ──────────────────────────────────────────────
# Song-list channel: build embeds
# ──────────────────────────────────────────────

SONGS_PER_PAGE = 10
CAT_EMOJI = {"pop": "🎵", "rock": "🎸", "thai": "🇹🇭", "hiphop": "🎤", "ost": "🎬", "inter": "🌏", "kpop": "🇰🇷", "other": "🎹"}

def build_song_list_embeds(songs: dict) -> list[discord.Embed]:
    if not songs:
        e = discord.Embed(
            title="🎤 รายการเพลง Karaoke",
            description="*ยังไม่มีเพลง — ใช้ `/karaoke auto <URL>` เพื่อเพิ่มเพลงแรก*",
            color=0x1a1a2e,
        )
        e.set_footer(text="อัปเดตอัตโนมัติทุกครั้งที่มีการเปลี่ยนแปลง")
        return [e]

    items = sorted(songs.values(), key=lambda s: s.get("SongName", ""))
    pages = math.ceil(len(items) / SONGS_PER_PAGE)
    embeds = []

    ratings = load_ratings()

    for page in range(pages):
        chunk = items[page * SONGS_PER_PAGE:(page + 1) * SONGS_PER_PAGE]
        e = discord.Embed(title="🎤 รายการเพลง Karaoke", color=0x1e1e2e)
        if pages > 1:
            e.title += f" ({page + 1}/{pages})"

        lines = []
        for s in chunk:
            has_lyrics = len(s.get("Lyrics", [])) > 0
            cat = s.get("Category", "pop")
            icon = CAT_EMOJI.get(cat, "🎵")
            dur = fmt_duration(s.get("Duration", 0))
            name = s.get("SongName", "ไม่มีชื่อ")
            artist = s.get("Artist", "ไม่ระบุ")
            sid = s.get("SongId", "?")
            mark = "✅" if has_lyrics else "⏳"
            likes = ratings.get(sid, 0)
            like_str = f" · ⭐ {likes}" if likes else ""
            cover_info = "🖼️" if s.get("CoverUrl") else ""

            lines.append(
                f"{mark} {icon} **{name}** {cover_info}\n"
                f"　🎤 {artist} · ⏱ {dur} · 🆔 `{sid}`{like_str}"
            )

        e.description = "\n\n".join(lines)
        e.set_footer(text=f"รวม {len(songs)} เพลง · ✅ มีซับ ⏳ ยังไม่มีซับ · อัปเดตอัตโนมัติ")
        embeds.append(e)

    return embeds

# ──────────────────────────────────────────────
# Refresh song-list channel (with rate limit protection)
# ──────────────────────────────────────────────

_refresh_lock = False

async def refresh_song_channel(client: discord.Client) -> None:
    global _refresh_lock
    if _refresh_lock:
        logger.warning("Refresh already in progress, skipping...")
        return
    _refresh_lock = True
    try:
        cfg = load_config()
        channel_id = cfg.get("song_channel_id")
        message_ids = cfg.get("song_message_ids", [])

        if not channel_id:
            return

        channel = client.get_channel(int(channel_id))
        if not channel:
            return

        songs = load_songs()
        embeds = build_song_list_embeds(songs)
        view = SongListView(client)

        edited = []
        for i, mid in enumerate(message_ids):
            if i >= len(embeds):
                break
            try:
                msg = await channel.fetch_message(int(mid))
                await msg.edit(embed=embeds[i], view=view if i == 0 else None)
                edited.append(mid)
                if i < len(message_ids) - 1:
                    await asyncio.sleep(0.5)
            except (discord.NotFound, discord.HTTPException):
                pass

        new_ids = list(edited)
        start = len(edited)
        for i, embed in enumerate(embeds[start:], start=start):
            try:
                msg = await channel.send(embed=embed, view=view if i == 0 else None)
                new_ids.append(msg.id)
                if i < len(embeds) - 1:
                    await asyncio.sleep(1.0)
            except discord.HTTPException as e:
                if e.status == 429:
                    logger.warning("Rate limited while sending embeds, waiting 5s...")
                    await asyncio.sleep(5)
                    msg = await channel.send(embed=embed, view=view if i == 0 else None)
                    new_ids.append(msg.id)
                else:
                    raise

        for mid in message_ids[len(embeds):]:
            try:
                msg = await channel.fetch_message(int(mid))
                await msg.delete()
                await asyncio.sleep(0.5)
            except Exception:
                pass

        cfg["song_message_ids"] = new_ids
        save_config(cfg)
    finally:
        _refresh_lock = False

# ──────────────────────────────────────────────
# Bot
# ──────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True

bot = discord.Client(intents=intents)
tree = app_commands.CommandTree(bot)

_synced = False
_sync_retry_count = 0
MAX_SYNC_RETRIES = 5

@bot.event
async def on_ready():
    global _synced, _sync_retry_count
    logger.info(f"Logged in as {bot.user} (ID: {bot.user.id})")
    await bot.change_presence(
        activity=discord.Activity(type=discord.ActivityType.listening, name="/karaoke auto")
    )

    if not _synced and _sync_retry_count < MAX_SYNC_RETRIES:
        for attempt in range(MAX_SYNC_RETRIES):
            try:
                synced = await tree.sync()
                logger.info(f"Synced {len(synced)} slash command(s)")
                _synced = True
                break
            except discord.HTTPException as e:
                if e.status == 429:
                    wait_time = 2 ** attempt
                    logger.warning(f"Rate limited by Discord (sync), waiting {wait_time}s... (attempt {attempt + 1}/{MAX_SYNC_RETRIES})")
                    await asyncio.sleep(wait_time)
                    _sync_retry_count += 1
                else:
                    logger.error(f"Failed to sync: {e}")
                    break
        if not _synced:
            logger.warning("Could not sync commands due to rate limits. Will retry on next restart.")

    bot.add_view(SongListView(bot))
    await refresh_song_channel(bot)

# ──────────────────────────────────────────────
# Modals
# ──────────────────────────────────────────────

class LyricsModal(discord.ui.Modal):
    lyrics_input = discord.ui.TextInput(
        label="เนื้อเพลง (แต่ละบรรทัด = 1 ท่อน)",
        style=discord.TextStyle.paragraph,
        placeholder="บรรทัดที่ 1\nบรรทัดที่ 2\n...",
        required=True,
        max_length=4000,
    )

    def __init__(self, song_id: str):
        super().__init__(title=f"เนื้อเพลง — {song_id[:40]}")
        self.song_id = song_id

    async def on_submit(self, interaction: discord.Interaction):
        songs = load_songs()
        if self.song_id not in songs:
            await interaction.response.send_message(f"❌ ไม่พบ `{self.song_id}`", ephemeral=True)
            return
        lines = [l.strip() for l in self.lyrics_input.value.strip().split("\n") if l.strip()]
        if not lines:
            await interaction.response.send_message("❌ ไม่พบเนื้อเพลง", ephemeral=True)
            return
        duration = songs[self.song_id]["Duration"]
        interval = duration / (len(lines) + 1)
        songs[self.song_id]["Lyrics"] = [
            {"Time": int((i + 1) * interval), "Text": line}
            for i, line in enumerate(lines)
        ]
        save_songs(songs)
        await interaction.response.send_message(
            f"✅ บันทึก **{len(lines)}** บรรทัดให้ `{self.song_id}` สำเร็จ!"
        )
        await refresh_song_channel(bot)

class EditSongModal(discord.ui.Modal):
    name_input = discord.ui.TextInput(label="ชื่อเพลง", required=False, max_length=100)
    artist_input = discord.ui.TextInput(label="ศิลปิน", required=False, max_length=100)
    duration_input = discord.ui.TextInput(label="ความยาว (วินาที)", required=False, max_length=6)
    category_input = discord.ui.TextInput(label="หมวดหมู่ (pop/rock/thai/hiphop/ost)", required=False, max_length=50)
    cover_input = discord.ui.TextInput(label="URL ปกเพลง (เว้นว่าง = ไม่เปลี่ยน)", required=False, max_length=500)

    def __init__(self, song_id: str, song: dict):
        super().__init__(title=f"แก้ไข — {song.get('SongName','')[:30]}")
        self.song_id = song_id
        self.name_input.default = song.get("SongName", "")
        self.artist_input.default = song.get("Artist", "")
        self.duration_input.default = str(song.get("Duration", 180))
        self.category_input.default = song.get("Category", "pop")
        self.cover_input.default = song.get("CoverUrl", "")

    async def on_submit(self, interaction: discord.Interaction):
        songs = load_songs()
        if self.song_id not in songs:
            await interaction.response.send_message("❌ ไม่พบเพลง", ephemeral=True)
            return

        new_name = self.name_input.value.strip() if self.name_input.value else songs[self.song_id]["SongName"]
        if new_name != songs[self.song_id]["SongName"]:
            dup = find_duplicate_song(songs, new_name)
            if dup and dup != self.song_id:
                await interaction.response.send_message(
                    f"⚠️ มีเพลงชื่อ **{new_name}** อยู่แล้ว (ID: `{dup}`)\nไม่สามารถใช้ชื่อซ้ำได้!", ephemeral=True
                )
                return

        if self.name_input.value:
            songs[self.song_id]["SongName"] = self.name_input.value
        if self.artist_input.value:
            songs[self.song_id]["Artist"] = self.artist_input.value
        if self.duration_input.value:
            try:
                songs[self.song_id]["Duration"] = int(self.duration_input.value)
            except ValueError:
                await interaction.response.send_message("❌ ความยาวต้องเป็นตัวเลข", ephemeral=True)
                return
        if self.category_input.value:
            songs[self.song_id]["Category"] = self.category_input.value
        if self.cover_input.value:
            songs[self.song_id]["CoverUrl"] = self.cover_input.value
            download_cover(self.cover_input.value, self.song_id)

        save_songs(songs)
        await interaction.response.send_message(f"✅ บันทึกข้อมูล `{self.song_id}` สำเร็จ!")
        await refresh_song_channel(bot)

# ──────────────────────────────────────────────
# /karaoke group
# ──────────────────────────────────────────────

karaoke = app_commands.Group(name="karaoke", description="จัดการเพลงคาราโอเกะ")

# ── /karaoke setchannel ───────────────────────

@karaoke.command(name="setchannel", description="กำหนดช่องที่จะแสดงรายการเพลงอัตโนมัติ")
@app_commands.describe(channel="ช่องที่ต้องการแสดงรายการเพลง")
@app_commands.checks.has_permissions(manage_channels=True)
async def karaoke_setchannel(interaction: discord.Interaction, channel: discord.TextChannel):
    await interaction.response.defer(ephemeral=True, thinking=True)
    cfg = load_config()
    cfg["song_channel_id"] = channel.id
    cfg["song_message_ids"] = []
    save_config(cfg)
    await interaction.followup.send(
        f"✅ ตั้งช่อง {channel.mention} เป็นช่องแสดงรายการเพลงแล้ว\nกำลังโพสต์รายการเพลง...", ephemeral=True
    )
    await refresh_song_channel(bot)

@karaoke_setchannel.error
async def setchannel_error(interaction: discord.Interaction, error):
    if isinstance(error, app_commands.MissingPermissions):
        await interaction.response.send_message("⛔ ต้องมีสิทธิ์ Manage Channels", ephemeral=True)

# ── /karaoke auto ─────────────────────────────

@karaoke.command(name="auto", description="เพิ่มเพลงจาก URL หรือ Roblox ID (กันซ้ำ + ดึงศิลปินอัตโนมัติ)")
@app_commands.describe(
    url="YouTube URL หรือ Roblox Asset URL",
    name="ชื่อเพลง (ถ้าไม่ใส่ จะดึงจาก URL)",
    artist="ชื่อศิลปิน (ถ้าไม่ใส่ จะดึงอัตโนมัติจาก URL)",
    duration="ความยาวเพลง วินาที (default 180)",
    category="หมวดหมู่: pop / rock / thai / hiphop / ost / inter / kpop",
    cover_url="URL ภาพปกเพลง (optional)",
)
async def karaoke_auto(
    interaction: discord.Interaction,
    url: str,
    name: str = None,
    artist: str = None,
    duration: int = 180,
    category: str = "pop",
    cover_url: str = None,
):
    await interaction.response.defer(thinking=True)

    songs = load_songs()
    auto_artist = artist or extract_artist_from_url(url)

    if name:
        dup = find_duplicate_song(songs, name)
        if dup:
            await interaction.followup.send(
                f"⚠️ **มีเพลงซ้ำ!**\nเพลง **{name}** มีอยู่แล้ว (ID: `{dup}`)\n"
                f"ใช้ `/karaoke edit {dup}` เพื่อแก้ไข หรือ `/karaoke info {dup}` เพื่อดูรายละเอียด",
                ephemeral=True
            )
            return

    roblox_id = extract_roblox_id(url)
    if roblox_id:
        song_id = roblox_id
        song_name = name or f"เพลง {roblox_id}"
    else:
        song_id = hashlib.md5(url.encode()).hexdigest()[:12]
        song_name = name or f"เพลงจาก URL"

    if song_id in songs:
        await interaction.followup.send(
            f"⚠️ เพลงนี้มีอยู่แล้ว (ID: `{song_id}`)\nชื่อ: **{songs[song_id]['SongName']}**\n"
            f"ใช้ `/karaoke info {song_id}` เพื่อดูรายละเอียด", ephemeral=True
        )
        return

    cover_path = None
    if cover_url:
        cover_path = download_cover(cover_url, song_id)

    songs[song_id] = {
        "SongId": song_id,
        "SongName": song_name,
        "Artist": auto_artist,
        "Duration": duration,
        "BackgroundTextId": "0",
        "SkipRequired": 3,
        "Category": category,
        "Lyrics": [],
        "AddedBy": interaction.user.name,
        "SourceUrl": url,
        "CoverUrl": cover_url if cover_url else None,
        "CoverPath": cover_path,
        "AddedAt": datetime.datetime.now().isoformat(),
    }
    save_songs(songs)
    await refresh_song_channel(bot)

    embed = discord.Embed(title="✅ เพิ่มเพลงสำเร็จ!", color=0x2ecc71)
    embed.add_field(name="🎵 ชื่อเพลง", value=song_name, inline=False)
    embed.add_field(name="🎤 ศิลปิน", value=auto_artist, inline=True)
    embed.add_field(name="🗂️ หมวดหมู่", value=category.upper(), inline=True)
    embed.add_field(name="⏱️ ความยาว", value=fmt_duration(duration), inline=True)
    embed.add_field(name="🆔 Song ID", value=f"`{song_id}`", inline=False)
    if cover_url:
        embed.set_thumbnail(url=cover_url)
    embed.add_field(
        name="📝 ขั้นตอนต่อไป",
        value=f"ใช้ `/karaoke lyrics {song_id}` เพื่อเพิ่มเนื้อเพลง\n"
              f"หรือ `/karaoke queue add {song_id}` เพื่อต่อคิวทันที!",
        inline=False,
    )
    embed.set_footer(text=f"เพิ่มโดย {interaction.user.name} · {url[:60]}")
    await interaction.followup.send(embed=embed)

# ── /karaoke add ──────────────────────────────

@karaoke.command(name="add", description="เพิ่มเพลงด้วย Roblox Asset ID (กันซ้ำ)")
@app_commands.describe(roblox_id="Roblox Asset ID (ตัวเลข)")
async def karaoke_add(interaction: discord.Interaction, roblox_id: str):
    song_id = extract_roblox_id(roblox_id)
    if not song_id:
        await interaction.response.send_message("❌ ใส่ ID ตัวเลขเท่านั้น", ephemeral=True)
        return

    songs = load_songs()
    if song_id in songs:
        await interaction.response.send_message(
            f"⚠️ `{song_id}` มีอยู่แล้ว!\nชื่อ: **{songs[song_id]['SongName']}**\n"
            f"ใช้ `/karaoke info {song_id}` หรือ `/karaoke edit {song_id}`", ephemeral=True
        )
        return

    songs[song_id] = {
        "SongId": song_id,
        "SongName": f"เพลง {song_id}",
        "Artist": "ไม่ระบุ",
        "Duration": 180,
        "BackgroundTextId": "0",
        "SkipRequired": 3,
        "Category": "pop",
        "Lyrics": [],
        "AddedBy": interaction.user.name,
        "AddedAt": datetime.datetime.now().isoformat(),
    }
    save_songs(songs)
    await interaction.response.send_message(
        f"✅ เพิ่ม `{song_id}` สำเร็จ\n📝 ใช้ `/karaoke edit {song_id}` ตั้งชื่อ และ `/karaoke lyrics {song_id}` เพิ่มซับ"
    )
    await refresh_song_channel(bot)

# ── /karaoke lyrics ───────────────────────────

@karaoke.command(name="lyrics", description="เพิ่ม/แก้ไขเนื้อเพลง")
@app_commands.describe(song_id="Roblox Asset ID หรือ Song ID")
async def karaoke_lyrics(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{song_id}`", ephemeral=True)
        return
    await interaction.response.send_modal(LyricsModal(song_id))

# ── /karaoke edit ─────────────────────────────

@karaoke.command(name="edit", description="แก้ไขชื่อ ศิลปิน ความยาว หมวดหมู่ ปก")
@app_commands.describe(song_id="Roblox Asset ID หรือ Song ID")
async def karaoke_edit(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{song_id}`", ephemeral=True)
        return
    await interaction.response.send_modal(EditSongModal(song_id, songs[song_id]))

# ── /karaoke remove ───────────────────────────

@karaoke.command(name="remove", description="ลบเพลงออกจากรายการ")
@app_commands.describe(song_id="Roblox Asset ID หรือ Song ID")
async def karaoke_remove(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message("❌ ไม่พบเพลง", ephemeral=True)
        return
    name = songs[song_id]["SongName"]
    cover_path = songs[song_id].get("CoverPath")
    del songs[song_id]
    ratings = load_ratings()
    if song_id in ratings:
        del ratings[song_id]
        save_ratings(ratings)
    save_songs(songs)
    if cover_path and os.path.exists(cover_path):
        os.remove(cover_path)
    await interaction.response.send_message(f"🗑️ ลบ **{name}** (`{song_id}`) สำเร็จ")
    await refresh_song_channel(bot)

# ── /karaoke info ─────────────────────────────

@karaoke.command(name="info", description="ดูข้อมูลเพลง")
@app_commands.describe(song_id="Roblox Asset ID หรือ Song ID")
async def karaoke_info(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{song_id}`", ephemeral=True)
        return
    s = songs[song_id]
    lc = len(s.get("Lyrics", []))
    likes = load_ratings().get(song_id, 0)
    e = discord.Embed(title=s["SongName"], color=0x3498db)
    if s.get("CoverUrl"):
        e.set_thumbnail(url=s["CoverUrl"])
    e.add_field(name="🆔 Sound ID", value=f"`{s['SongId']}`", inline=True)
    e.add_field(name="🎤 ศิลปิน", value=s.get("Artist", "ไม่ระบุ"), inline=True)
    e.add_field(name="⏱️ ความยาว", value=fmt_duration(s.get("Duration", 0)), inline=True)
    e.add_field(name="📝 ซับ", value=f"{lc} บรรทัด", inline=True)
    e.add_field(name="🗂️ หมวดหมู่", value=s.get("Category", "pop").upper(), inline=True)
    e.add_field(name="⭐ คะแนน", value=str(likes), inline=True)
    e.add_field(name="➕ เพิ่มโดย", value=s.get("AddedBy", "?"), inline=True)
    e.add_field(name="📅 เพิ่กเมื่อ", value=s.get("AddedAt", "ไม่ระบุ")[:10], inline=True)
    if s.get("SourceUrl"):
        e.add_field(name="🔗 ลิงก์", value=s["SourceUrl"], inline=False)
    await interaction.response.send_message(embed=e)

# ── /karaoke list ─────────────────────────────

@karaoke.command(name="list", description="แสดงรายการเพลงทั้งหมดในแชทนี้")
async def karaoke_list(interaction: discord.Interaction):
    songs = load_songs()
    embeds = build_song_list_embeds(songs)
    await interaction.response.send_message(embed=embeds[0])
    for e in embeds[1:]:
        await interaction.followup.send(embed=e)

# ── /karaoke refresh ──────────────────────────

@karaoke.command(name="refresh", description="รีเฟรชช่องรายการเพลงด้วยตัวเอง")
@app_commands.checks.has_permissions(manage_messages=True)
async def karaoke_refresh(interaction: discord.Interaction):
    cfg = load_config()
    if not cfg.get("song_channel_id"):
        await interaction.response.send_message(
            "❌ ยังไม่ได้ตั้งช่อง ใช้ `/karaoke setchannel` ก่อน", ephemeral=True
        )
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    await refresh_song_channel(bot)
    await interaction.followup.send("✅ รีเฟรชรายการเพลงสำเร็จ!", ephemeral=True)

# ── /karaoke export ───────────────────────────

@karaoke.command(name="export", description="ส่งออกไฟล์ songs.json")
async def karaoke_export(interaction: discord.Interaction):
    if not os.path.exists(SONGS_FILE):
        await interaction.response.send_message("📭 ยังไม่มีข้อมูลเพลง", ephemeral=True)
        return
    await interaction.response.send_message(
        "📦 ไฟล์เพลงทั้งหมด",
        file=discord.File(SONGS_FILE, filename="songs.json"),
    )

# ── /karaoke random ───────────────────────────

@karaoke.command(name="random", description="สุ่มเพลงจากคลังทั้งหมด")
async def karaoke_random_cmd(interaction: discord.Interaction):
    songs = load_songs()
    if not songs:
        await interaction.response.send_message("📭 คลังเพลงว่างเปล่า", ephemeral=True)
        return
    s = random.choice(list(songs.values()))
    e = discord.Embed(title="🎲 สุ่มเพลง", color=0xe74c3c)
    e.add_field(name="🎵 เพลง", value=s.get("SongName", "ไม่มีชื่อ"), inline=False)
    e.add_field(name="🎤 ศิลปิน", value=s.get("Artist", "ไม่ระบุ"), inline=True)
    e.add_field(name="⏱️ ความยาว", value=fmt_duration(s.get("Duration", 0)), inline=True)
    e.add_field(name="🆔 ID", value=f"`{s['SongId']}`", inline=True)
    if s.get("CoverUrl"):
        e.set_thumbnail(url=s["CoverUrl"])
    e.add_field(name="📝 ต่อคิวเลย?", value=f"`/karaoke queue add {s['SongId']}`", inline=False)
    await interaction.response.send_message(embed=e)

# ── /karaoke like ─────────────────────────────

@karaoke.command(name="like", description="ให้คะแนนเพลง (กดไลก์)")
@app_commands.describe(song_id="Roblox Asset ID หรือ Song ID")
async def karaoke_like(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message(f"❌ ไม่พบ `{song_id}`", ephemeral=True)
        return
    ratings = load_ratings()
    ratings[song_id] = ratings.get(song_id, 0) + 1
    save_ratings(ratings)
    await interaction.response.send_message(
        f"⭐ ให้คะแนน **{songs[song_id]['SongName']}** แล้ว! (ตอนนี้มี {ratings[song_id]} คะแนน)"
    )
    await refresh_song_channel(bot)

# ── /karaoke top ─────────────────────────────

@karaoke.command(name="top", description="อันดับเพลงยอดนิยม")
async def karaoke_top(interaction: discord.Interaction):
    ratings = load_ratings()
    songs = load_songs()
    if not ratings:
        await interaction.response.send_message(
            "ยังไม่มีคะแนน — ใช้ `/karaoke like <id>` เพื่อให้คะแนน", ephemeral=True
        )
        return
    sorted_ratings = sorted(ratings.items(), key=lambda x: x[1], reverse=True)[:10]
    lines = []
    medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
    for i, (sid, score) in enumerate(sorted_ratings):
        s = songs.get(sid, {})
        name = s.get("SongName", sid)
        medal = medals[i] if i < len(medals) else f"{i+1}."
        lines.append(f"{medal} **{name}** — ⭐ {score} คะแนน")
    e = discord.Embed(title="🏆 เพลงยอดนิยม", description="\n".join(lines), color=0xf1c40f)
    await interaction.response.send_message(embed=e)

# ── /karaoke nowplaying ───────────────────────

@karaoke.command(name="nowplaying", description="ดูเพลงที่กำลังร้อง / คิวถัดไป")
async def karaoke_nowplaying(interaction: discord.Interaction):
    queue = load_queue()
    if not queue:
        await interaction.response.send_message(
            "📭 ไม่มีคิว — ใช้ `/karaoke queue add <id>` เพื่อต่อคิว", ephemeral=True
        )
        return
    current = queue[0]
    songs = load_songs()
    s = songs.get(current["song_id"], {})
    e = discord.Embed(title="🎤 กำลังร้อง / คิวถัดไป", color=0x9b59b6)
    e.add_field(name="🎵 เพลง", value=s.get("SongName", current["song_id"]), inline=False)
    e.add_field(name="🎤 ผู้ร้อง", value=current["user"], inline=True)
    e.add_field(name="⏱️ ความยาว", value=fmt_duration(s.get("Duration", 180)), inline=True)
    if s.get("CoverUrl"):
        e.set_thumbnail(url=s["CoverUrl"])
    if len(queue) > 1:
        next_up = queue[1]
        ns = songs.get(next_up["song_id"], {})
        e.add_field(name="⏭️ ถัดไป", value=f"{ns.get('SongName', next_up['song_id'])} — {next_up['user']}", inline=False)
    e.set_footer(text=f"เหลือ {len(queue)} เพลงในคิว")
    await interaction.response.send_message(embed=e)

# ──────────────────────────────────────────────
# /karaoke queue subgroup
# ──────────────────────────────────────────────

queue_group = app_commands.Group(name="queue", description="จัดการคิวร้องเพลง", parent=karaoke)

@queue_group.command(name="add", description="ต่อคิวร้องเพลง")
@app_commands.describe(song_id="Roblox Asset ID หรือ Song ID")
async def queue_add(interaction: discord.Interaction, song_id: str):
    songs = load_songs()
    if song_id not in songs:
        await interaction.response.send_message(f"❌ ไม่พบเพลง `{song_id}`", ephemeral=True)
        return
    q = load_queue()
    q.append({
        "song_id": song_id,
        "user": interaction.user.display_name,
        "user_id": interaction.user.id,
        "timestamp": datetime.datetime.now().isoformat()
    })
    save_queue(q)
    await interaction.response.send_message(
        f"🎵 เพิ่ม **{songs[song_id]['SongName']}** เข้าคิวแล้ว! (คิวที่ {len(q)})"
    )

@queue_group.command(name="list", description="ดูคิวร้องเพลงทั้งหมด")
async def queue_list(interaction: discord.Interaction):
    queue = load_queue()
    if not queue:
        await interaction.response.send_message("📭 คิวว่างอยู่", ephemeral=True)
        return
    songs = load_songs()
    lines = []
    for i, item in enumerate(queue[:15], 1):
        s = songs.get(item["song_id"], {})
        name = s.get("SongName", item["song_id"])
        lines.append(f"{i}. **{name}** — 🎤 {item['user']}")
    if len(queue) > 15:
        lines.append(f"...และอีก {len(queue)-15} เพลง")
    e = discord.Embed(title="📋 คิวร้องเพลง", description="\n".join(lines), color=0x3498db)
    e.set_footer(text=f"รวม {len(queue)} เพลงในคิว")
    await interaction.response.send_message(embed=e)

@queue_group.command(name="skip", description="ข้ามเพลงปัจจุบัน (ลบออกจากคิว)")
async def queue_skip(interaction: discord.Interaction):
    q = load_queue()
    if not q:
        await interaction.response.send_message("📭 ไม่มีคิวให้ข้าม", ephemeral=True)
        return
    removed = q.pop(0)
    save_queue(q)
    songs = load_songs()
    name = songs.get(removed["song_id"], {}).get("SongName", removed["song_id"])
    await interaction.response.send_message(f"⏭️ ข้าม **{name}** แล้ว — เหลือ {len(q)} เพลงในคิว")

@queue_group.command(name="clear", description="ล้างคิวทั้งหมด")
@app_commands.checks.has_permissions(manage_messages=True)
async def queue_clear(interaction: discord.Interaction):
    save_queue([])
    await interaction.response.send_message("🗑️ ล้างคิวทั้งหมดแล้ว!")

tree.add_command(karaoke)

# ──────────────────────────────────────────────
# General commands
# ──────────────────────────────────────────────

@tree.command(name="ping", description="Check bot latency")
async def slash_ping(interaction: discord.Interaction):
    await interaction.response.send_message(f"🏓 Pong! **{round(bot.latency * 1000)} ms**")

@tree.command(name="serverinfo", description="ข้อมูลเซิร์ฟเวอร์")
async def slash_serverinfo(interaction: discord.Interaction):
    g = interaction.guild
    if not g:
        await interaction.response.send_message("⚠️ ใช้ในเซิร์ฟเวอร์เท่านั้น", ephemeral=True)
        return
    e = discord.Embed(title=g.name, color=discord.Color.blurple())
    e.add_field(name="💬 Channels", value=len(g.channels), inline=True)
    e.add_field(name="🎭 Roles", value=len(g.roles), inline=True)
    e.add_field(name="📅 Created", value=discord.utils.format_dt(g.created_at, "D"), inline=False)
    e.set_footer(text=f"ID: {g.id}")
    if g.icon:
        e.set_thumbnail(url=g.icon.url)
    await interaction.response.send_message(embed=e)

@tree.command(name="userinfo", description="ข้อมูล user")
@app_commands.describe(member="สมาชิกที่ต้องการดู")
async def slash_userinfo(interaction: discord.Interaction, member: discord.Member = None):
    member = member or interaction.user
    roles = [r.mention for r in reversed(member.roles) if r.name != "@everyone"]
    e = discord.Embed(title=str(member), color=member.color)
    e.set_thumbnail(url=member.display_avatar.url)
    e.add_field(name="🏷️ Display Name", value=member.display_name, inline=True)
    e.add_field(name="🆔 ID", value=str(member.id), inline=True)
    e.add_field(name="📅 Created", value=discord.utils.format_dt(member.created_at, "D"), inline=False)
    if hasattr(member, "joined_at") and member.joined_at:
        e.add_field(name="📥 Joined", value=discord.utils.format_dt(member.joined_at, "D"), inline=False)
    if roles:
        e.add_field(name=f"🎭 Roles ({len(roles)})", value=", ".join(roles[:5]), inline=False)
    await interaction.response.send_message(embed=e)

@tree.command(name="roll", description="ทอยเต๋า เช่น 1d6, 2d20")
@app_commands.describe(dice="เช่น 1d6 หรือ 2d20")
async def slash_roll(interaction: discord.Interaction, dice: str = "1d6"):
    try:
        parts = dice.lower().split("d")
        count, sides = int(parts[0] or 1), int(parts[1])
        if not (1 <= count <= 100 and 2 <= sides <= 1000):
            raise ValueError
        rolls = [random.randint(1, sides) for _ in range(count)]
        await interaction.response.send_message(f"🎲 **{dice}**: [{', '.join(map(str, rolls))}] = **{sum(rolls)}**")
    except (ValueError, IndexError):
        await interaction.response.send_message("⚠️ รูปแบบไม่ถูกต้อง ใช้ `1d6` หรือ `2d20`")

@tree.command(name="coinflip", description="เสี่ยงเหรียญ")
async def slash_coinflip(interaction: discord.Interaction):
    await interaction.response.send_message(f"เหรียญออก **{'หัว 🪙' if random.random() > 0.5 else 'ก้อย 🪙'}**!")

@tree.command(name="8ball", description="ถามลูกแก้ว")
@app_commands.describe(question="คำถามของคุณ")
async def slash_8ball(interaction: discord.Interaction, question: str):
    answers = [
        "แน่นอนมาก!", "ใช่เลย!", "ค่อนข้างใช่", "น่าจะใช่", "ลองดูสิ",
        "ไม่แน่ใจ ลองใหม่", "ถามทีหลังดีกว่า", "ไม่แน่นะ", "ไม่เลย", "แน่ใจเลยว่าไม่",
    ]
    e = discord.Embed(color=0x1a1a2e)
    e.add_field(name="❓ คำถาม", value=question, inline=False)
    e.add_field(name="🎱 คำตอบ", value=random.choice(answers), inline=False)
    await interaction.response.send_message(embed=e)

@tree.command(name="clear", description="ลบข้อความ (ต้องมีสิทธิ์ Manage Messages)")
@app_commands.describe(amount="จำนวนข้อความที่ต้องการลบ (1-100)")
@app_commands.checks.has_permissions(manage_messages=True)
async def slash_clear(interaction: discord.Interaction, amount: app_commands.Range[int, 1, 100] = 10):
    await interaction.response.defer(ephemeral=True)
    deleted = await interaction.channel.purge(limit=amount)
    await interaction.followup.send(f"🗑️ ลบ **{len(deleted)}** ข้อความสำเร็จ", ephemeral=True)

@slash_clear.error
async def clear_error(interaction: discord.Interaction, error):
    if isinstance(error, app_commands.MissingPermissions):
        await interaction.response.send_message("⛔ ต้องมีสิทธิ์ Manage Messages", ephemeral=True)

# ──────────────────────────────────────────────
# Run (แก้ไขสำคัญ: ใช้ reconnect=True + รอนานขึ้น)
# ──────────────────────────────────────────────

async def main():
    if not TOKEN:
        logger.error("DISCORD_BOT_TOKEN not set.")
        raise SystemExit(1)

    # รอ 30 วินาทีก่อน login (ป้องกัน rate limit ตอน deploy)
    logger.info("Waiting 30 seconds before Discord login to avoid rate limits...")
    await asyncio.sleep(30)

    # รัน Flask ใน thread แยก
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    logger.info(f"Flask server started on port {os.environ.get('PORT', 10000)}")

    # ใช้ reconnect=True และ handle rate limit อย่างระมัดระวัง
    async with bot:
        try:
            await bot.start(TOKEN, reconnect=True)
        except discord.HTTPException as e:
            if e.status == 429:
                logger.error(f"Rate limited on startup: {e}")
                # รอ 60 วินาทีแล้วลองใหม่
                await asyncio.sleep(60)
                await bot.start(TOKEN, reconnect=True)
            else:
                raise

if __name__ == "__main__":
    asyncio.run(main())
