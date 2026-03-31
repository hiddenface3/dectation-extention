#!/usr/bin/env python3
import sys
import json
import struct
import time
import keyboard  # pip install keyboard

# Try to import pywin32 for window management
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

def find_and_minimize_grok():
    """Find the Grok PWA window and minimize it so the previous window regains focus."""
    if not HAS_WIN32:
        return False

    grok_hwnd = None

    def enum_windows_callback(hwnd, _):
        nonlocal grok_hwnd
        if not win32gui.IsWindowVisible(hwnd):
            return
        title = win32gui.GetWindowText(hwnd)
        # Match the Grok PWA window - it typically shows "Grok" in the title
        if 'grok' in title.lower() and grok_hwnd is None:
            grok_hwnd = hwnd

    win32gui.EnumWindows(enum_windows_callback, None)

    if grok_hwnd:
        win32gui.ShowWindow(grok_hwnd, win32con.SW_MINIMIZE)
        return True
    return False

if __name__ == '__main__':
    while True:
        try:
            msg = get_message()
            text = msg.get('text', '')
            minimize_grok = msg.get('minimizeGrok', False)

            if text:
                # Step 1: If requested, minimize the Grok PWA window
                # This causes Windows to refocus the previously active window
                if minimize_grok:
                    minimized = find_and_minimize_grok()
                else:
                    minimized = False

                # Step 2: Wait for OS to finish refocusing the previous window
                # 250ms is enough for Windows to restore focus
                if minimized:
                    time.sleep(0.25)
                else:
                    # Fallback: still wait a bit so Chrome yields focus
                    time.sleep(0.5)

                # Step 3: Send Ctrl+V at OS level — pastes wherever cursor is
                keyboard.send('ctrl+v')

                send_message({'status': 'success', 'message': 'Pasted successfully', 'minimized': minimized})
            else:
                send_message({'status': 'error', 'message': 'No text provided'})

        except Exception as e:
            send_message({'status': 'error', 'error': str(e)})
            sys.exit(1)
