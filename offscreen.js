(function () {
    'use strict';

    let audioContext = null;
    let analyser = null;
    let micStream = null;
    let animationFrameId = null;

    const canvas = document.getElementById('notchCanvas');
    const ctx = canvas.getContext('2d');
    const pipVideo = document.getElementById('pipVideo');

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'START_NOTCH') {
            startNotchVisualizer().then(sendResponse);
            return true;
        }
        if (message.action === 'STOP_NOTCH') {
            stopNotchVisualizer().then(sendResponse);
            return true;
        }
    });

    async function startNotchVisualizer() {
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(micStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            // Bind canvas to video stream for Picture-in-Picture
            if (canvas.captureStream) {
                const stream = canvas.captureStream(30);
                pipVideo.srcObject = stream;
                await pipVideo.play();

                if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
                    try {
                        await pipVideo.requestPictureInPicture();
                    } catch (pipErr) {
                        console.warn('[Offscreen] PiP launch warning:', pipErr);
                    }
                }
            }

            drawWaveform();
            return { success: true };
        } catch (err) {
            console.error('[Offscreen] Error starting audio visualizer:', err);
            return { success: false, error: err.message };
        }
    }

    async function stopNotchVisualizer() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        if (document.pictureInPictureElement) {
            try {
                await document.exitPictureInPicture();
            } catch (e) {}
        }

        if (micStream) {
            micStream.getTracks().forEach(track => track.stop());
            micStream = null;
        }

        if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close();
            audioContext = null;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return { success: true };
    }

    function drawWaveform() {
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        // Draw Dark Slate Pill Outer Notch Container
        const pillWidth = 260;
        const pillHeight = 70;
        const pillX = (width - pillWidth) / 2;
        const pillY = (height - pillHeight) / 2;
        const radius = 35;

        // Background Glass Pill
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, radius);
        ctx.fillStyle = '#0f172a';
        ctx.shadowColor = 'rgba(59, 130, 246, 0.4)';
        ctx.shadowBlur = 16;
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#3b82f6';
        ctx.stroke();
        ctx.restore();

        // Draw Animated Sound Wave Bars
        const barCount = 18;
        const barWidth = 6;
        const gap = 6;
        const totalWaveWidth = (barCount * barWidth) + ((barCount - 1) * gap);
        const startX = (width - totalWaveWidth) / 2;
        const centerY = height / 2;

        const gradient = ctx.createLinearGradient(0, pillY, 0, pillY + pillHeight);
        gradient.addColorStop(0, '#60a5fa');
        gradient.addColorStop(0.5, '#3b82f6');
        gradient.addColorStop(1, '#a855f7');

        for (let i = 0; i < barCount; i++) {
            // Map bar index to frequency array index
            const index = Math.floor(i * (bufferLength / barCount));
            const value = dataArray[index] || 10;
            const percent = value / 255;
            const minHeight = 8;
            const maxHeight = 48;
            const barHeight = minHeight + (percent * (maxHeight - minHeight));

            const x = startX + i * (barWidth + gap);
            const y = centerY - (barHeight / 2);

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 3);
            ctx.fillStyle = gradient;
            ctx.shadowColor = '#60a5fa';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.restore();
        }

        animationFrameId = requestAnimationFrame(drawWaveform);
    }
})();
