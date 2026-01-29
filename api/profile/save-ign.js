import { getUser, transact } from '../_utils';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { ign } = req.body;
        if (!ign) return res.status(400).json({ error: 'IGN required' });

        // Success: Update user profile and status
        await transact([
            ["update", "users", user.id, {
                ign: ign,
                status: 'earlyAccess',
                lastSeen: Date.now()
            }]
        ]);

        return res.status(200).json({ ok: true });

    } catch (error) {
        console.error('Save IGN Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
