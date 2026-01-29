import { getUser, transact } from '../_utils';
import crypto from 'crypto';

const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const INSTANT_ADMIN_TOKEN = process.env.INSTANTDB_ADMIN_TOKEN;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Code required' });

        // Fetch latest code for user
        const query = {
            emailVerificationCodes: {
                $: {
                    where: { userId: user.id },
                    order: { serverCreatedAt: 'desc' },
                    limit: 1
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
        const latestCode = data.emailVerificationCodes?.[0];

        if (!latestCode) return res.status(400).json({ error: 'No code found' });
        if (latestCode.expiresAt < Date.now()) return res.status(400).json({ error: 'Code expired' });

        const hashedInput = crypto.createHash('sha256').update(code).digest('hex');

        if (hashedInput !== latestCode.code) {
            return res.status(400).json({ error: 'Invalid code' });
        }

        // Success: Update user status
        await transact([
            ["update", "users", user.id, { status: 'needsIGN' }],
            ["delete", "emailVerificationCodes", latestCode.id] // Clean up
        ]);

        return res.status(200).json({ ok: true });

    } catch (error) {
        console.error('Email Verify Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
