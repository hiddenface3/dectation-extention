#!/usr/bin/env python3
import sys
import json
import struct
import time
import keyboard # Note: pip install keyboard

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

if __name__ == '__main__':
    while True:
        try:
            msg = get_message()
            text = msg.get('text', '')
            
            if text:
                # The text is already in the clipboard because content.js saved it.
                # We just need to trigger a Ctrl+V command after a brief wait to ensure Chrome yields focus back
                time.sleep(0.5) 
                
                keyboard.send('ctrl+v')
                
                send_message({'status': 'success', 'message': 'Pasted successfully'})
            else:
                send_message({'status': 'error', 'message': 'No text provided'})
                
        except Exception as e:
            send_message({'status': 'error', 'error': str(e)})
            sys.exit(1)
