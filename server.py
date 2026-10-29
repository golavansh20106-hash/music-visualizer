#!/usr/bin/env python3
"""
SONIC // Local Server & Real-Time WASAPI Audio Loopback Bridge
Serves the web visualizer on http://127.0.0.1:3000 and streams
direct Windows WASAPI loopback audio to ws://127.0.0.1:3001.

Bypasses all browser permission popups and screen-sharing limits.
Directly captures whatever plays through your earphones or speakers
with zero microphone bleed.
"""

import asyncio
import http.server
import json
import os
import socketserver
import sys
import threading
import time
import webbrowser
import numpy as np

try:
    import soundcard as sc
    import websockets
except ImportError:
    print("[!] Installing required dependencies: soundcard, websockets, numpy...")
    os.system(f'"{sys.executable}" -m pip install soundcard websockets numpy')
    import soundcard as sc
    import websockets

# --------------------------------------------------------------------------
# Optional: Windows Media Session API (winsdk) for Now-Playing info
# --------------------------------------------------------------------------
_winsdk_available = False
try:
    import asyncio as _asyncio
    from winsdk.windows.media.control import (
        GlobalSystemMediaTransportControlsSessionManager as MediaManager,
    )
    _winsdk_available = True
    print("[*] Windows Media Session API available — track names will be fetched.")
except Exception:
    print("[i] winsdk not installed. Track names unavailable.")
    print("    To enable: pip install winsdk")

HTTP_PORT = 3000
WS_PORT = 3001
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

connected_clients = set()
clients_lock = threading.Lock()
running = True
async_loop = None

# Shared now-playing state (updated by the media poller thread)
_now_playing = {"title": "", "artist": "", "source": ""}

# --------------------------------------------------------------------------
# HTTP Static File Server (Port 3000)
# --------------------------------------------------------------------------
class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        # Keep terminal output minimal
        pass

def start_http_server(port):
    socketserver.TCPServer.allow_reuse_address = True
    server = None
    for p in range(port, port + 20):
        try:
            server = socketserver.TCPServer(('127.0.0.1', p), QuietHTTPHandler)
            return server, p
        except OSError:
            continue
    return None, None

# --------------------------------------------------------------------------
# Real-Time WASAPI Audio Capture Loop (Runs in dedicated background thread)
# --------------------------------------------------------------------------
async def broadcast_bytes(data):
    with clients_lock:
        if not connected_clients:
            return
        clients_copy = list(connected_clients)

    coros = [c.send(data) for c in clients_copy]
    await asyncio.gather(*coros, return_exceptions=True)


# --------------------------------------------------------------------------
# Windows Media Session Now-Playing Poller (async, runs on the event loop)
# --------------------------------------------------------------------------
async def _fetch_now_playing_winsdk():
    """Fetch current media info from Windows SMTC via winsdk."""
    if not _winsdk_available:
        return None
    try:
        sessions = await MediaManager.request_async()
        session = sessions.get_current_session()
        if not session:
            return None
        info = await session.try_get_media_properties_async()
        if not info:
            return None
        title = info.title or ""
        artist = info.artist or ""
        # Try to identify the source app
        app_id = session.source_app_user_model_id or ""
        source = ""
        app_id_lower = app_id.lower()
        if "spotify" in app_id_lower:
            source = "Spotify"
        elif "youtube" in app_id_lower or "chrome" in app_id_lower or "msedge" in app_id_lower:
            source = "Browser"
        elif "media" in app_id_lower or "groove" in app_id_lower:
            source = "Media Player"
        elif "vlc" in app_id_lower:
            source = "VLC"
        else:
            source = ""
        return {"title": title, "artist": artist, "source": source}
    except Exception:
        return None


async def now_playing_poller():
    """Poll Windows Media Session every 1s. Broadcast changes over WebSocket."""
    global _now_playing
    prev = {"title": "", "artist": "", "source": ""}

    while running:
        await asyncio.sleep(1.0)

        with clients_lock:
            if not connected_clients:
                continue

        result = await _fetch_now_playing_winsdk()
        if result is None:
            # winsdk unavailable or no session — nothing to broadcast
            continue

        if result["title"] != prev["title"] or result["artist"] != prev["artist"]:
            prev = result
            _now_playing = result
            msg = json.dumps({"type": "now_playing", **result})
            await broadcast_bytes(msg)

def audio_capture_worker(target_loop):
    global running
    blocksize = 1024
    samplerate = 48000
    window = np.hanning(blocksize)
    window_sum = np.sum(window) / 2.0

    print("[*] Audio loopback worker started.")

    while running:
        # Check if any browser client is connected. If not, sleep to save CPU.
        with clients_lock:
            active_clients = len(connected_clients)

        if active_clients == 0:
            time.sleep(0.12)
            continue

        try:
            spk = sc.default_speaker()
            loopback = sc.get_microphone(id=str(spk.id), include_loopback=True)
            device_name = spk.name

            # Notify clients of active device name
            info_msg = json.dumps({"type": "device_info", "name": device_name})
            asyncio.run_coroutine_threadsafe(broadcast_bytes(info_msg), target_loop)

            with loopback.recorder(samplerate=samplerate, blocksize=blocksize) as rec:
                while running:
                    with clients_lock:
                        if len(connected_clients) == 0:
                            break

                    data = rec.record(numframes=blocksize)
                    # Convert stereo to mono and apply Hanning window
                    mono = np.mean(data, axis=1) * window

                    # Real FFT
                    fft_vals = np.abs(np.fft.rfft(mono))
                    norm = fft_vals / window_sum

                    # Decibel mapping: -70 dB floor to 0 dB, mapped to 0-255 uint8
                    db = 20.0 * np.log10(np.maximum(norm, 1e-4))
                    scaled = np.clip((db + 70.0) / 70.0 * 255.0, 0, 255).astype(np.uint8)

                    # Send binary packet (513 bytes)
                    raw_bytes = scaled.tobytes()
                    asyncio.run_coroutine_threadsafe(broadcast_bytes(raw_bytes), target_loop)

        except Exception as e:
            # Handle device disconnect / reconnect
            time.sleep(0.5)

# --------------------------------------------------------------------------
# WebSocket Server Handler (Port 3001)
# --------------------------------------------------------------------------
async def ws_handler(websocket):
    with clients_lock:
        connected_clients.add(websocket)
    try:
        # Send current speaker name immediately
        try:
            spk = sc.default_speaker()
            await websocket.send(json.dumps({"type": "device_info", "name": spk.name}))
        except Exception:
            pass

        # Send current now-playing state if available
        if _now_playing.get("title"):
            await websocket.send(json.dumps({"type": "now_playing", **_now_playing}))

        await websocket.wait_closed()
    finally:
        with clients_lock:
            connected_clients.discard(websocket)

async def start_ws_server():
    global async_loop
    async_loop = asyncio.get_running_loop()

    # Start audio worker in a background daemon thread
    audio_thread = threading.Thread(target=audio_capture_worker, args=(async_loop,), daemon=True)
    audio_thread.start()

    async with websockets.serve(ws_handler, '127.0.0.1', WS_PORT):
        print(f"[*] WebSocket Audio Bridge active: ws://127.0.0.1:{WS_PORT}")
        # Start the now-playing poller as a concurrent task
        asyncio.ensure_future(now_playing_poller())
        while running:
            await asyncio.sleep(1)

# --------------------------------------------------------------------------
# Main Entry Point
# --------------------------------------------------------------------------
def main():
    global running
    os.chdir(DIRECTORY)

    http_server, port = start_http_server(HTTP_PORT)
    if not http_server:
        print("[!] Could not bind to an open HTTP port.")
        sys.exit(1)

    url = f"http://127.0.0.1:{port}"
    print("=" * 64)
    print("  SONIC // Minimalist Audio Spectrogram & Visualizer")
    print(f"  Web Interface:    {url}")
    print(f"  Audio Loopback:   ws://127.0.0.1:{WS_PORT}")
    print("=" * 64)

    try:
        spk = sc.default_speaker()
        print(f"  Detected Output Device: {spk.name}")
    except Exception:
        print("  Detected Output Device: Windows Default Playback")

    print("  - Direct hardware audio loopback (Zero browser popups needed)")
    print("  - Microphone input is 100% excluded")
    print("  - Press Ctrl+C in this terminal to stop.")
    print("=" * 64)

    # Start HTTP server in background thread
    http_thread = threading.Thread(target=http_server.serve_forever, daemon=True)
    http_thread.start()

    # Open browser automatically
    webbrowser.open(url)

    # Run WebSocket event loop on main thread
    try:
        asyncio.run(start_ws_server())
    except KeyboardInterrupt:
        print("\n[*] Stopping servers...")
        running = False
        http_server.shutdown()
        http_server.server_close()
        print("[*] Stopped cleanly.")

if __name__ == '__main__':
    main()
