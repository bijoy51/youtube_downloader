const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Get yt-dlp path
const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';

// Extract video ID from YouTube URL
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&?\s]+)/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// Get video info using yt-dlp
app.get('/api/info', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }

        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Use yt-dlp to get video info
        const { stdout } = await execAsync(
            `${ytdlpPath} --dump-json --no-download "${videoUrl}"`,
            { timeout: 30000 }
        );

        const info = JSON.parse(stdout);

        res.json({
            title: info.title || 'YouTube Video',
            author: info.uploader || info.channel || 'Unknown',
            thumbnail: info.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            duration: info.duration || 0,
            videoId: videoId
        });
    } catch (error) {
        console.error('Info error:', error.message);

        // Fallback: Return basic info with thumbnail
        const videoId = extractVideoId(req.query.url);
        if (videoId) {
            res.json({
                title: 'YouTube Video',
                author: 'Unknown',
                thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                duration: 0,
                videoId: videoId
            });
        } else {
            res.status(500).json({ error: 'Failed to get video info' });
        }
    }
});

// Download video/audio using yt-dlp
app.get('/api/download', async (req, res) => {
    try {
        const { url, type } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }

        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Get video title first
        let title = 'video';
        try {
            const { stdout } = await execAsync(
                `${ytdlpPath} --get-title "${videoUrl}"`,
                { timeout: 15000 }
            );
            title = stdout.trim().replace(/[^\w\s-]/g, '').substring(0, 50) || 'video';
        } catch (e) {
            console.error('Title fetch error:', e.message);
        }

        let format, ext;
        if (type === 'audio') {
            format = 'bestaudio';
            ext = 'mp3';
        } else {
            format = 'best[ext=mp4]/best';
            ext = 'mp4';
        }

        res.header('Content-Disposition', `attachment; filename="${title}.${ext}"`);
        res.header('Content-Type', type === 'audio' ? 'audio/mpeg' : 'video/mp4');

        // Stream the download
        const args = [
            '-f', format,
            '-o', '-',
            '--no-playlist',
            videoUrl
        ];

        if (type === 'audio') {
            args.splice(2, 0, '-x', '--audio-format', 'mp3');
        }

        const ytdlp = spawn(ytdlpPath, args);

        ytdlp.stdout.pipe(res);

        ytdlp.stderr.on('data', (data) => {
            console.error('yt-dlp stderr:', data.toString());
        });

        ytdlp.on('error', (error) => {
            console.error('yt-dlp spawn error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed' });
            }
        });

        ytdlp.on('close', (code) => {
            if (code !== 0) {
                console.error('yt-dlp exited with code:', code);
            }
        });

        req.on('close', () => {
            ytdlp.kill();
        });

    } catch (error) {
        console.error('Download error:', error.message);
        res.status(500).json({ error: 'Download failed: ' + error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
