const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

// Get video info
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

        // Try to get info using ytdl-core
        const info = await ytdl.getBasicInfo(videoUrl, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            }
        });

        res.json({
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            duration: info.videoDetails.lengthSeconds,
            videoId: videoId
        });
    } catch (error) {
        console.error('Info error:', error.message);

        // Fallback: Try to get basic info from video ID
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

// Download video/audio - Stream directly
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

        const info = await ytdl.getInfo(videoUrl, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
            }
        });

        const title = info.videoDetails.title.replace(/[^\w\s-]/g, '').substring(0, 50) || 'video';

        let format;
        let ext;

        if (type === 'audio') {
            format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
            ext = 'mp3';
        } else {
            // Try to get format with both audio and video
            format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' });
            ext = 'mp4';
        }

        res.header('Content-Disposition', `attachment; filename="${title}.${ext}"`);
        res.header('Content-Type', type === 'audio' ? 'audio/mpeg' : 'video/mp4');

        ytdl(videoUrl, { format }).pipe(res);
    } catch (error) {
        console.error('Download error:', error.message);
        res.status(500).json({ error: 'Download failed: ' + error.message });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
