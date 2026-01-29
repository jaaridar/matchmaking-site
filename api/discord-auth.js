export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'Missing code' });
    }

    const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

    // Determine redirect URI based on environment (local vs prod)
    // TRAP: This MUST match the Redirect URI used in the authorize step and portal.
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['host'];
    const REDIRECT_URI = `${protocol}://${host}/api/discord-auth`;

    try {
        // Exchange Code
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI,
                scope: 'identify email',
            }).toString(),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('Token Error:', tokenData);
            return res.status(400).json({ error: tokenData.error_description || 'Token exchange failed' });
        }

        // Get User Data
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                authorization: `${tokenData.token_type} ${tokenData.access_token}`,
            },
        });

        const userData = await userResponse.json();

        // INTENT: Redirect back to frontend with user data
        // Since the browser landed here, we must send it back to the UI.
        const avatarUrl = userData.avatar
            ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
            : '';

        const params = new URLSearchParams({
            discordId: userData.id,
            username: userData.username,
            avatar: avatarUrl,
            email: userData.email
        });

        // Redirect to Home with data
        return res.redirect(302, `${protocol}://${host}/?${params.toString()}`);

    } catch (error) {
        console.error('Auth Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
