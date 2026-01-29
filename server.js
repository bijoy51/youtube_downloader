const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Cobalt API endpoint
const COBALT_API = 'https://api.cobalt.tools/api/json';

// Get video info and download link
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }

        // Validate YouTube URL
        const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
        if (!ytRegex.test(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        // Get video info using oEmbed
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const infoResponse = await fetch(oembedUrl);

        if (!infoResponse.ok) {
            throw new Error('Could not fetch video info');
        }

        const videoInfo = await infoResponse.json();

        // Extract video ID for thumbnail
        let videoId = '';
        if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1].split('?')[0];
        } else if (url.includes('v=')) {
            videoId = url.split('v=')[1].split('&')[0];
        }

        res.json({
            title: videoInfo.title,
            author: videoInfo.author_name,
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            url: url
        });
    } catch (error) {
        console.error('Info error:', error.message);
        res.status(500).json({ error: 'Failed to get video info. Check the URL.' });
    }
});

// Get download link from Cobalt
app.post('/api/download', async (req, res) => {
    try {
        const { url, type } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }

        const response = await fetch(COBALT_API, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: url,
                vCodec: 'h264',
                vQuality: '1080',
                aFormat: 'mp3',
                isAudioOnly: type === 'audio',
                filenamePattern: 'basic'
            })
        });

        const data = await response.json();

        if (data.status === 'error') {
            throw new Error(data.text || 'Download failed');
        }

        if (data.status === 'redirect' || data.status === 'stream') {
            res.json({ downloadUrl: data.url });
        } else if (data.status === 'picker') {
            // Multiple options available
            res.json({
                downloadUrl: data.picker[0]?.url || data.audio,
                options: data.picker
            });
        } else {
            throw new Error('Unexpected response from server');
        }
    } catch (error) {
        console.error('Download error:', error.message);
        res.status(500).json({ error: error.message || 'Download failed. Try again.' });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
