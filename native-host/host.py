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

def find_and_minimize_window(title_keyword):
    """Find a visible window whose title contains title_keyword and minimize it.
    This causes Windows to restore focus to the previously active window."""
    if not HAS_WIN32 or not title_keyword:
        return False

    found_hwnd = None

    def enum_callback(hwnd, _):
        nonlocal found_hwnd
        if found_hwnd:
            return  # already found one
        if not win32gui.IsWindowVisible(hwnd):
            return
        title = win32gui.GetWindowText(hwnd)
        if title_keyword.lower() in title.lower():
            found_hwnd = hwnd

    win32gui.EnumWindows(enum_callback, None)

    if found_hwnd:
        win32gui.ShowWindow(found_hwnd, win32con.SW_MINIMIZE)
        return True
    return False

if __name__ == '__main__':
    while True:
        try:
            msg = get_message()
            text = msg.get('text', '')
            # windowTitle: name of the PWA window to minimize before pasting
            # e.g. "ChatGPT" or "Grok"
            window_title = msg.get('windowTitle', '')

            if text:
                # Step 1: Minimize the source dictation window (ChatGPT or Grok PWA)
                # so Windows restores focus to whatever window/app was focused before
                minimized = find_and_minimize_window(window_title)

                # Step 2: Wait for OS to finish refocusing the previous window
                # 250ms is enough when minimized; 400ms fallback
                time.sleep(0.25 if minimized else 0.4)

                # Step 3: Ctrl+V at OS level — pastes into wherever the cursor is
                keyboard.send('ctrl+v')

                send_message({
                    'status': 'success',
                    'minimized': minimized,
                    'windowTitle': window_title
                })
            else:
                send_message({'status': 'error', 'message': 'No text provided'})

        except Exception as e:
            send_message({'status': 'error', 'error': str(e)})
            sys.exit(1)
