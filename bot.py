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
import tempfile
import requests
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
ROBLOX_API_KEY = os.environ.get("ROBLOX_API_KEY")
ROBLOX_USER_ID = os.environ.get("ROBLOX_USER_ID")
SONGS_FILE  = os.path.join(os.path.dirname(__file__), "songs.json")
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")
QUEUE_FILE  = os.path.join(os.path.dirname(__file__), "queue.json")
RATINGS_FILE = os.path.join(os.path.dirname(__file__), "ratings.json")
COVERS_DIR  = os.path.join(os.path.dirname(__file__), "covers")

# ──────────────────────────────────────────────
# Flask Web Server
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
    songs = load_songs()
    return songs, 200, {"Content-Type": "application/json"}

@app.route("/api/queue")
def api_queue():
    return load_queue(), 200, {"Content-Type": "application/json"}

def run_flask():
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, threaded=True)

# ──────────────────────────────────────────────
# YouTube + Cobalt API Functions (แก้ไขหลัก)
# ──────────────────────────────────────────────

# อัปเดต yt-dlp อัตโนมัติตอนเริ่ม (ถ้าใช้ fallback)
try:
    import subprocess, sys
    subprocess.run([sys.executable, "-m", "pip", "install", "-U", "yt-dlp"], 
                   capture_output=True, timeout=60)
    logger.info("yt-dlp updated successfully")
except Exception as e:
    logger.warning(f"yt-dlp auto-update failed: {e}")


def download_youtube_info(url: str) -> dict | None:
    """
    ดึงข้อมูล YouTube โดยใช้ Cobalt API เป็นหลัก
    ถ้า Cobalt ล่ม จะ fallback ไปใช้ yt-dlp
    """
    # ลอง Cobalt API ก่อน (เหมาะกับ Render ที่โดน YouTube บล็อก)
    cobalt_result = _try_cobalt_api(url)
    if cobalt_result:
        return cobalt_result

    # Fallback ไป yt-dlp (ถ้า IP ไม่โดนบล็อก)
    logger.warning("Cobalt API failed, trying yt-dlp fallback...")
    return _try_ytdlp_info(url)


def _try_cobalt_api(url: str) -> dict | None:
    """ใช้ Cobalt API ดึงข้อมูล YouTube — เหมาะกับ cloud hosting"""
    try:
        response = requests.post(
            "https://api.cobalt.tools/api/json",
            json={"url": url, "isAudioOnly": True},
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=30
        )
        data = response.json()

        if data.get("status") == "tunnel" or data.get("status") == "picker":
            # Cobalt สำเร็จ — ดึงชื่อจาก URL หรือ filename
            audio_url = data.get("url") or data.get("audio", "")
            filename = data.get("filename", "Unknown")

            # พยายามดึง title จาก URL ถ้า filename เป็น Unknown
            title = filename if filename != "Unknown" else _extract_title_from_url(url)

            return {
                "id": _extract_video_id(url),
                "title": title,
                "uploader": "Unknown",
                "duration": 0,  # Cobalt ไม่ส่ง duration
                "thumbnail": f"https://img.youtube.com/vi/{_extract_video_id(url)}/maxresdefault.jpg",
                "original_url": url,
                "cobalt_audio_url": audio_url,
                "extractor": "cobalt"
            }
        else:
            logger.warning(f"Cobalt API returned status: {data.get('status')}, text: {data.get('text', 'unknown')}")
            return None

    except requests.exceptions.Timeout:
        logger.error("Cobalt API timeout")
        return None
    except Exception as e:
        logger.error(f"Cobalt API error: {e}")
        return None


def _try_ytdlp_info(url: str) -> dict | None:
    """Fallback ใช้ yt-dlp ถ้า IP ไม่โดนบล็อก"""
    try:
        import yt_dlp
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'geo_bypass': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            info["extractor"] = "yt-dlp"
            return info
    except Exception as e:
        logger.error(f"yt-dlp fallback failed: {e}")
        return None


def download_youtube_audio(url: str, output_path: str) -> bool:
    """
    ดาวน์โหลดเสียงจาก YouTube
    ใช้ Cobalt API เป็นหลัก ถ้าไม่ได้ fallback yt-dlp
    """
    # ลอง Cobalt ก่อน
    if _download_via_cobalt(url, output_path):
        return True

    # Fallback yt-dlp
    logger.warning("Cobalt download failed, trying yt-dlp...")
    return _download_via_ytdlp(url, output_path)


def _download_via_cobalt(url: str, output_path: str) -> bool:
    """ดาวน์โหลดผ่าน Cobalt API"""
    try:
        # ขอ audio URL จาก Cobalt
        response = requests.post(
            "https://api.cobalt.tools/api/json",
            json={"url": url, "isAudioOnly": True, "audioFormat": "mp3"},
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=30
        )
        data = response.json()

        if data.get("status") != "tunnel" and data.get("status") != "picker":
            return False

        audio_url = data.get("url") or data.get("audio", "")
        if not audio_url:
            return False

        # ดาวน์โหลดไฟล์เสียง
        audio_response = requests.get(audio_url, timeout=60, stream=True)
        audio_response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in audio_response.iter_content(chunk_size=8192):
                f.write(chunk)

        logger.info(f"Downloaded via Cobalt: {output_path}")
        return True

    except Exception as e:
        logger.error(f"Cobalt download error: {e}")
        return False


def _download_via_ytdlp(url: str, output_path: str) -> bool:
    """Fallback ดาวน์โหลดผ่าน yt-dlp"""
    try:
        import yt_dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': output_path,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return True
    except Exception as e:
        logger.error(f"yt-dlp download failed: {e}")
        return False


def _extract_video_id(url: str) -> str:
    """ดึง YouTube video ID จาก URL"""
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return hashlib.md5(url.encode()).hexdigest()[:11]


def _extract_title_from_url(url: str) -> str:
    """ดึงชื่อเพลงคร่าว ๆ จาก URL"""
    try:
        import yt_dlp
        ydl_opts = {'quiet': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get("title", "Unknown")
    except:
        return "Unknown"


def upload_audio_to_roblox(file_path: str, name: str) -> str | None:
    if not ROBLOX_API_KEY or not ROBLOX_USER_ID:
        logger.warning("ROBLOX_API_KEY or ROBLOX_USER_ID not set")
        return None

    url = "https://apis.roblox.com/assets/v1/assets"

    with open(file_path, "rb") as f:
        file_content = f.read()

    file_size = len(file_content)
    if file_size > 20 * 1024 * 1024:
        logger.error(f"File too large: {file_size} bytes")
        return None

    payload = {
        "assetType": "Audio",
        "displayName": name[:50],
        "description": f"Karaoke: {name}",
        "creationContext": {
            "creator": {
                "userId": int(ROBLOX_USER_ID)
            }
        }
    }

    files = {
        "request": (None, json.dumps(payload), "application/json"),
        "fileContent": (os.path.basename(file_path), file_content, "audio/mpeg")
    }

    headers = {"x-api-key": ROBLOX_API_KEY}

    try:
        response = requests.post(url, headers=headers, files=files, timeout=60)
        data = response.json()
        if "assetId" in data:
            logger.info(f"Uploaded to Roblox: {data['assetId']}")
            return str(data["assetId"])
        else:
            logger.error(f"Upload failed: {data}")
            return None
    except Exception as e:
        logger.error(f"Upload error: {e}")
        return None

def download_cover_image(cover_url: str, song_id: str) -> str | None:
    if not cover_url:
        return None
    try:
        os.makedirs(COVERS_DIR, exist_ok=True)
        ext = "jpg"
        filename = f"{song_id}.{ext}"
        filepath = os.path.join(COVERS_DIR, filename)

        req = urllib.request.Request(cover_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as response:
            with open(filepath, "wb") as f:
                f.write(response.read())
        return filepath
    except Exception as e:
        logger.warning(f"Failed to download cover: {e}")
        return None

# ──────────────────────────────────────────────
# Data helpers
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

def find_duplicate_song(songs: dict, song_name: str) -> str | None:
    search_name = song_name.lower().strip()
    for sid, song in songs.items():
        if song.get("SongName", "").lower().strip() == search_name:
            return sid
    return None

# ──────────────────────────────────────────────
# Views
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
# Song-list embeds
# ──────────────────────────────────────────────

SONGS_PER_PAGE = 10
CAT_EMOJI = {"pop": "🎵", "rock": "🎸", "thai": "🇹🇭", "hiphop": "🎤", "ost": "🎬", "inter": "🌏", "kpop": "🇰🇷", "other": "🎹"}

def build_song_list_embeds(songs: dict) -> list[discord.Embed]:
    if not songs:
        e = discord.Embed(
            title="🎤 รายการเพลง Karaoke",
            description="*ยังไม่มีเพลง — ใช้ `/karaoke auto <YouTube URL>` เพื่อเพิ่มเพลงแรก*",
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
            roblox_status = "🟢" if s.get("RobloxAssetId") else "🔴"

            lines.append(
                f"{mark} {icon} **{name}** {cover_info} {roblox_status}\n"
                f"　🎤 {artist} · ⏱ {dur} · 🆔 `{sid}`{like_str}"
            )

        e.description = "\n\n".join(lines)
        e.set_footer(text=f"รวม {len(songs)} เพลง · ✅ มีซับ ⏳ ยังไม่มีซับ · 🟢 อัปโหลด Roblox")
        embeds.append(e)

    return embeds

# ──────────────────────────────────────────────
# Refresh channel
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
import tempfile
import requests
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
ROBLOX_API_KEY = os.environ.get("ROBLOX_API_KEY")
ROBLOX_USER_ID = os.environ.get("ROBLOX_USER_ID")
SONGS_FILE  = os.path.join(os.path.dirname(__file__), "songs.json")
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")
QUEUE_FILE  = os.path.join(os.path.dirname(__file__), "queue.json")
RATINGS_FILE = os.path.join(os.path.dirname(__file__), "ratings.json")
COVERS_DIR  = os.path.join(os.path.dirname(__file__), "covers")

# ──────────────────────────────────────────────
# Flask Web Server
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
    songs = load_songs()
    return songs, 200, {"Content-Type": "application/json"}

@app.route("/api/queue")
def api_queue():
    return load_queue(), 200, {"Content-Type": "application/json"}

def run_flask():
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, threaded=True)

# ──────────────────────────────────────────────
# YouTube + Cobalt API Functions (แก้ไขหลัก)
# ──────────────────────────────────────────────

# อัปเดต yt-dlp อัตโนมัติตอนเริ่ม (ถ้าใช้ fallback)
try:
    import subprocess, sys
    subprocess.run([sys.executable, "-m", "pip", "install", "-U", "yt-dlp"], 
                   capture_output=True, timeout=60)
    logger.info("yt-dlp updated successfully")
except Exception as e:
    logger.warning(f"yt-dlp auto-update failed: {e}")


def download_youtube_info(url: str) -> dict | None:
    """
    ดึงข้อมูล YouTube โดยใช้ Cobalt API เป็นหลัก
    ถ้า Cobalt ล่ม จะ fallback ไปใช้ yt-dlp
    """
    # ลอง Cobalt API ก่อน (เหมาะกับ Render ที่โดน YouTube บล็อก)
    cobalt_result = _try_cobalt_api(url)
    if cobalt_result:
        return cobalt_result

    # Fallback ไป yt-dlp (ถ้า IP ไม่โดนบล็อก)
    logger.warning("Cobalt API failed, trying yt-dlp fallback...")
    return _try_ytdlp_info(url)


def _try_cobalt_api(url: str) -> dict | None:
    """ใช้ Cobalt API ดึงข้อมูล YouTube — เหมาะกับ cloud hosting"""
    try:
        response = requests.post(
            "https://api.cobalt.tools/api/json",
            json={"url": url, "isAudioOnly": True},
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=30
        )
        data = response.json()

        if data.get("status") == "tunnel" or data.get("status") == "picker":
            # Cobalt สำเร็จ — ดึงชื่อจาก URL หรือ filename
            audio_url = data.get("url") or data.get("audio", "")
            filename = data.get("filename", "Unknown")

            # พยายามดึง title จาก URL ถ้า filename เป็น Unknown
            title = filename if filename != "Unknown" else _extract_title_from_url(url)

            return {
                "id": _extract_video_id(url),
                "title": title,
                "uploader": "Unknown",
                "duration": 0,  # Cobalt ไม่ส่ง duration
                "thumbnail": f"https://img.youtube.com/vi/{_extract_video_id(url)}/maxresdefault.jpg",
                "original_url": url,
                "cobalt_audio_url": audio_url,
                "extractor": "cobalt"
            }
        else:
            logger.warning(f"Cobalt API returned status: {data.get('status')}, text: {data.get('text', 'unknown')}")
            return None

    except requests.exceptions.Timeout:
        logger.error("Cobalt API timeout")
        return None
    except Exception as e:
        logger.error(f"Cobalt API error: {e}")
        return None


def _try_ytdlp_info(url: str) -> dict | None:
    """Fallback ใช้ yt-dlp ถ้า IP ไม่โดนบล็อก"""
    try:
        import yt_dlp
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'geo_bypass': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            info["extractor"] = "yt-dlp"
            return info
    except Exception as e:
        logger.error(f"yt-dlp fallback failed: {e}")
        return None


def download_youtube_audio(url: str, output_path: str) -> bool:
    """
    ดาวน์โหลดเสียงจาก YouTube
    ใช้ Cobalt API เป็นหลัก ถ้าไม่ได้ fallback yt-dlp
    """
    # ลอง Cobalt ก่อน
    if _download_via_cobalt(url, output_path):
        return True

    # Fallback yt-dlp
    logger.warning("Cobalt download failed, trying yt-dlp...")
    return _download_via_ytdlp(url, output_path)


def _download_via_cobalt(url: str, output_path: str) -> bool:
    """ดาวน์โหลดผ่าน Cobalt API"""
    try:
        # ขอ audio URL จาก Cobalt
        response = requests.post(
            "https://api.cobalt.tools/api/json",
            json={"url": url, "isAudioOnly": True, "audioFormat": "mp3"},
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=30
        )
        data = response.json()

        if data.get("status") != "tunnel" and data.get("status") != "picker":
            return False

        audio_url = data.get("url") or data.get("audio", "")
        if not audio_url:
            return False

        # ดาวน์โหลดไฟล์เสียง
        audio_response = requests.get(audio_url, timeout=60, stream=True)
        audio_response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in audio_response.iter_content(chunk_size=8192):
                f.write(chunk)

        logger.info(f"Downloaded via Cobalt: {output_path}")
        return True

    except Exception as e:
        logger.error(f"Cobalt download error: {e}")
        return False


def _download_via_ytdlp(url: str, output_path: str) -> bool:
    """Fallback ดาวน์โหลดผ่าน yt-dlp"""
    try:
        import yt_dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': output_path,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return True
    except Exception as e:
        logger.error(f"yt-dlp download failed: {e}")
        return False


def _extract_video_id(url: str) -> str:
    """ดึง YouTube video ID จาก URL"""
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return hashlib.md5(url.encode()).hexdigest()[:11]


def _extract_title_from_url(url: str) -> str:
    """ดึงชื่อเพลงคร่าว ๆ จาก URL"""
    try:
        import yt_dlp
        ydl_opts = {'quiet': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get("title", "Unknown")
    except:
        return "Unknown"


def upload_audio_to_roblox(file_path: str, name: str) -> str | None:
    if not ROBLOX_API_KEY or not ROBLOX_USER_ID:
        logger.warning("ROBLOX_API_KEY or ROBLOX_USER_ID not set")
        return None

    url = "https://apis.roblox.com/assets/v1/assets"

    with open(file_path, "rb") as f:
        file_content = f.read()

    file_size = len(file_content)
    if file_size > 20 * 1024 * 1024:
        logger.error(f"File too large: {file_size} bytes")
        return None

    payload = {
        "assetType": "Audio",
        "displayName": name[:50],
        "description": f"Karaoke: {name}",
        "creationContext": {
            "creator": {
                "userId": int(ROBLOX_USER_ID)
            }
        }
    }

    files = {
        "request": (None, json.dumps(payload), "application/json"),
        "fileContent": (os.path.basename(file_path), file_content, "audio/mpeg")
    }

    headers = {"x-api-key": ROBLOX_API_KEY}

    try:
        response = requests.post(url, headers=headers, files=files, timeout=60)
        data = response.json()
        if "assetId" in data:
            logger.info(f"Uploaded to Roblox: {data['assetId']}")
            return str(data["assetId"])
        else:
            logger.error(f"Upload failed: {data}")
            return None
    except Exception as e:
        logger.error(f"Upload error: {e}")
        return None

def download_cover_image(cover_url: str, song_id: str) -> str | None:
    if not cover_url:
        return None
    try:
        os.makedirs(COVERS_DIR, exist_ok=True)
        ext = "jpg"
        filename = f"{song_id}.{ext}"
        filepath = os.path.join(COVERS_DIR, filename)

        req = urllib.request.Request(cover_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as response:
            with open(filepath, "wb") as f:
                f.write(response.read())
        return filepath
    except Exception as e:
        logger.warning(f"Failed to download cover: {e}")
        return None

# ──────────────────────────────────────────────
# Data helpers
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

def find_duplicate_song(songs: dict, song_name: str) -> str | None:
    search_name = song_name.lower().strip()
    for sid, song in songs.items():
        if song.get("SongName", "").lower().strip() == search_name:
            return sid
    return None

# ──────────────────────────────────────────────
# Views
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
# Song-list embeds
# ──────────────────────────────────────────────

SONGS_PER_PAGE = 10
CAT_EMOJI = {"pop": "🎵", "rock": "🎸", "thai": "🇹🇭", "hiphop": "🎤", "ost": "🎬", "inter": "🌏", "kpop": "🇰🇷", "other": "🎹"}

def build_song_list_embeds(songs: dict) -> list[discord.Embed]:
    if not songs:
        e = discord.Embed(
            title="🎤 รายการเพลง Karaoke",
            description="*ยังไม่มีเพลง — ใช้ `/karaoke auto <YouTube URL>` เพื่อเพิ่มเพลงแรก*",
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
            roblox_status = "🟢" if s.get("RobloxAssetId") else "🔴"

            lines.append(
                f"{mark} {icon} **{name}** {cover_info} {roblox_status}\n"
                f"　🎤 {artist} · ⏱ {dur} · 🆔 `{sid}`{like_str}"
            )

        e.description = "\n\n".join(lines)
        e.set_footer(text=f"รวม {len(songs)} เพลง · ✅ มีซับ ⏳ ยังไม่มีซับ · 🟢 อัปโหลด Roblox")
        embeds.append(e)

    return embeds

# ──────────────────────────────────────────────
# Refresh channel
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
     
