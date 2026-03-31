#!/usr/bin/env python3
import sys
import json
import struct
import time
import keyboard  # pip install keyboard

try:
    import win32gui
    import win32con
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        sys.exit(0)
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def send_message(message_dict):
    encoded_content = json.dumps(message_dict).encode('utf-8')
    encoded_length = struct.pack('@I', len(encoded_content))
    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()

def find_window_by_title(title_keyword):
    """Return the HWND of the first visible window whose title contains title_keyword."""
    if not HAS_WIN32 or not title_keyword:
        return None
    found = [None]
    def cb(hwnd, _):
        if found[0]: return
        if not win32gui.IsWindowVisible(hwnd): return
        if title_keyword.lower() in win32gui.GetWindowText(hwnd).lower():
            found[0] = hwnd
    win32gui.EnumWindows(cb, None)
    return found[0]

def focus_window(title_keyword):
    """Restore and bring a window to the foreground by its title keyword.
    Uses SetForegroundWindow which works reliably when called from a process
    that was launched by the current foreground process (i.e., the browser)."""
    hwnd = find_window_by_title(title_keyword)
    if not hwnd:
        return False
    # Restore if minimized, then force to foreground
    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    win32gui.SetForegroundWindow(hwnd)
    return True

def minimize_window(title_keyword):
    """Minimize a window by its title keyword, causing OS to restore focus
    to the previously active window."""
    hwnd = find_window_by_title(title_keyword)
    if not hwnd:
        return False
    win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
    return True

if __name__ == '__main__':
    while True:
        try:
            msg = get_message()
            action     = msg.get('action', 'paste')   # 'focus' | 'paste'
            window_title = msg.get('windowTitle', '')
            text       = msg.get('text', '')

            # ── FOCUS ACTION ────────────────────────────────────────────────
            # Called before dictation starts: bring ChatGPT/Grok PWA to front
            if action == 'focus':
                focused = focus_window(window_title)
                send_message({'status': 'success', 'focused': focused})

            # ── PASTE ACTION (default) ───────────────────────────────────────
            # Called after dictation ends: minimize source window, Ctrl+V
            elif action == 'paste' and text:
                minimized = minimize_window(window_title)
                # Wait for OS to restore focus to the previously active window
                time.sleep(0.25 if minimized else 0.4)
                keyboard.send('ctrl+v')
                send_message({'status': 'success', 'minimized': minimized})

            else:
                send_message({'status': 'error', 'message': 'Unknown action or missing text'})

        except Exception as e:
            send_message({'status': 'error', 'error': str(e)})
            sys.exit(1)
