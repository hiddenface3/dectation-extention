#!/usr/bin/env python3
import sys
import json
import struct
import time
import ctypes
import keyboard  # pip install keyboard

try:
    import win32gui
    import win32con
    import win32process
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
    """Force a window to the foreground using AttachThreadInput trick.
    This bypasses Windows focus-stealing prevention, which blocks a plain
    SetForegroundWindow call when the caller isn't the foreground process."""
    hwnd = find_window_by_title(title_keyword)
    if not hwnd:
        return False
    try:
        # Get foreground window + thread IDs
        fg_hwnd = win32gui.GetForegroundWindow()
        fg_thread_id = win32process.GetWindowThreadProcessId(fg_hwnd)[0]
        my_thread_id = ctypes.windll.kernel32.GetCurrentThreadId()

        # Attach our thread to the foreground thread's input queue.
        # This grants us foreground rights so SetForegroundWindow succeeds.
        attached = False
        if fg_thread_id != my_thread_id:
            ctypes.windll.user32.AttachThreadInput(my_thread_id, fg_thread_id, True)
            attached = True

        # Restore if minimized, then bring to front
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.BringWindowToTop(hwnd)
        win32gui.SetForegroundWindow(hwnd)

        if attached:
            ctypes.windll.user32.AttachThreadInput(my_thread_id, fg_thread_id, False)

        return True
    except Exception as e:
        # Fallback: plain restore + focus attempt
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.SetForegroundWindow(hwnd)
            return True
        except:
            return False

def minimize_window(title_keyword):
    """Minimize a window — OS then restores focus to the previously active window."""
    hwnd = find_window_by_title(title_keyword)
    if not hwnd:
        return False
    win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
    return True

if __name__ == '__main__':
    while True:
        try:
            msg = get_message()
            action       = msg.get('action', 'paste')
            window_title = msg.get('windowTitle', '')
            text         = msg.get('text', '')

            # ── FOCUS: bring the dictation PWA window to the front ───────────
            if action == 'focus':
                focused = focus_window(window_title)
                send_message({'status': 'success', 'focused': focused})

            # ── PASTE: minimize window then Ctrl+V ───────────────────────────
            elif action == 'paste' and text:
                minimized = minimize_window(window_title)
                time.sleep(0.25 if minimized else 0.4)
                keyboard.send('ctrl+v')
                send_message({'status': 'success', 'minimized': minimized})

            else:
                send_message({'status': 'error', 'message': 'Unknown action or missing text'})

        except Exception as e:
            send_message({'status': 'error', 'error': str(e)})
            sys.exit(1)
