import { serialize } from 'cookie';
import { v4 as uuidv4 } from 'uuid';

const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const INSTANT_ADMIN_TOKEN = process.env.INSTANTDB_ADMIN_TOKEN;

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

    const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1466307300024123627';
    const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

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

        const avatarUrl = userData.avatar
            ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
            : '';

        // --- INSTANTDB UPSERT ---
        const query = {
            users: {
                $: {
                    where: { discordId: userData.id }
                }
            }
        };

        const queryRes = await fetch(`https://api.instantdb.com/admin/apps/${APP_ID}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${INSTANT_ADMIN_TOKEN}`
            },
            body: JSON.stringify(query)
        });

        const queryData = await queryRes.json();
        let user = queryData.users?.[0];
        let userId;

        if (user) {
            userId = user.id;
            await fetch(`https://api.instantdb.com/admin/apps/${APP_ID}/transact`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${INSTANT_ADMIN_TOKEN}`
                },
                body: JSON.stringify({
                    ops: [
                        ["update", "users", userId, {
                            lastLoginAt: Date.now(),
                            discordUsername: userData.username,
                            discordAvatarUrl: avatarUrl
                        }]
                    ]
                })
            });
        } else {
            userId = uuidv4();
            await fetch(`https://api.instantdb.com/admin/apps/${APP_ID}/transact`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${INSTANT_ADMIN_TOKEN}`
                },
                body: JSON.stringify({
                    ops: [
                        ["set", "users", userId, {
                            id: userId,
                            discordId: userData.id,
                            discordUsername: userData.username,
                            discordAvatarUrl: avatarUrl,
                            email: userData.email || '',
                            status: userData.email ? 'needsIGN' : 'needsEmail',
                            createdAt: Date.now(),
                            lastLoginAt: Date.now()
                        }]
                    ]
                })
            });
        }

        // --- SESSION COOKIE (PLAIN) ---
        res.setHeader('Set-Cookie', serialize('session', userId, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        }));

        return res.redirect(302, `${protocol}://${host}/`);

    } catch (error) {
        console.error('Auth Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
