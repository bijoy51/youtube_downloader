const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create agent with cookies for better reliability
const agent = ytdl.createAgent(JSON.parse(process.env.YT_COOKIES || '[]'));

// Get video info
app.get('/api/info', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }

        if (!ytdl.validateURL(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const info = await ytdl.getInfo(url, {
            agent,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
            }
        });

        const formats = info.formats
            .filter(f => f.hasVideo || f.hasAudio)
            .map(f => ({
                itag: f.itag,
                quality: f.qualityLabel || f.audioQuality || 'Unknown',
                container: f.container,
                hasVideo: f.hasVideo,
                hasAudio: f.hasAudio,
                contentLength: f.contentLength,
                mimeType: f.mimeType
            }));

        const videoFormats = formats.filter(f => f.hasVideo && f.hasAudio);
        const audioFormats = formats.filter(f => f.hasAudio && !f.hasVideo);

        res.json({
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1]?.url,
            duration: info.videoDetails.lengthSeconds,
            author: info.videoDetails.author.name,
            videoFormats,
            audioFormats
        });
    } catch (error) {
        console.error('Info error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to get video info.' });
    }
});

// Download video/audio
app.get('/api/download', async (req, res) => {
    try {
        const { url, itag, type } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }

        if (!ytdl.validateURL(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const info = await ytdl.getInfo(url, { agent });
        const title = info.videoDetails.title.replace(/[^\w\s-]/g, '').substring(0, 50);

        let options = { agent };
        let ext = 'mp4';

        if (type === 'audio') {
            options = {
                ...options,
                quality: 'highestaudio',
                filter: 'audioonly'
            };
            ext = 'mp3';
        } else if (itag) {
            options = { ...options, quality: itag };
        } else {
            options = {
                ...options,
                quality: 'highest',
                filter: 'audioandvideo'
            };
        }

        res.header('Content-Disposition', `attachment; filename="${title}.${ext}"`);

        ytdl(url, options).pipe(res);
    } catch (error) {
        console.error('Download error:', error.message);
        res.status(500).json({ error: 'Download failed. Try again.' });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
