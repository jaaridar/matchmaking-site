import { jwtVerify } from 'jsonwebtoken';
import { parse } from 'cookie';

const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const INSTANT_ADMIN_TOKEN = process.env.INSTANTDB_ADMIN_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        const cookies = parse(req.headers.cookie || '');
        const token = cookies.session;

        if (!token) {
            return res.status(401).json({ error: 'No session' });
        }

        let decoded;
        try {
            decoded = await new Promise((resolve, reject) => {
                require('jsonwebtoken').verify(token, JWT_SECRET, (err, payload) => {
                    if (err) reject(err);
                    else resolve(payload);
                });
            });
        } catch (e) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        const userId = decoded.userId;

        // Fetch user from InstantDB
        const query = {
            users: {
                $: {
                    where: { id: userId }
                }
            }
        };

        const response = await fetch(`https://api.instantdb.com/admin/apps/${APP_ID}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${INSTANT_ADMIN_TOKEN}`
            },
            body: JSON.stringify(query)
        });

        const data = await response.json();
        const user = data.users?.[0];

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.status(200).json({
            user: {
                id: user.id,
                status: user.status || 'needsEmail',
                discordUsername: user.discordUsername,
                email: user.email,
                ign: user.ign,
                avatar: user.discordAvatarUrl
            }
        });

    } catch (error) {
        console.error('Me Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
