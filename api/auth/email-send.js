import Mailjet from 'node-mailjet';
import { getUser, transact } from '../_utils';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// HARDCODED CREDENTIALS (Sourced from user request for zero-dependency deployment)
const MAILJET_API_KEY = '5f9057b9843cc2d807fc9f49120d27d8';
const MAILJET_API_SECRET = '594ab471ff6a527950953e67270c2724';

const mailjet = Mailjet.apiConnect(MAILJET_API_KEY, MAILJET_API_SECRET);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { email } = req.body;
        const targetEmail = email || user.email;

        if (!targetEmail) return res.status(400).json({ error: 'Email required' });

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
        const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

        const codeId = uuidv4();

        // Save to InstantDB
        await transact([
            ["set", "emailVerificationCodes", codeId, {
                id: codeId,
                userId: user.id,
                code: hashedCode,
                expiresAt: expiry,
                createdAt: Date.now()
            }],
            ["update", "users", user.id, { email: targetEmail }]
        ]);

        // Send Email
        await mailjet.post('send', { version: 'v3.1' }).request({
            Messages: [
                {
                    From: {
                        Email: 'no-reply@mcsr-ranked.com',
                        Name: 'MCBE Ranked'
                    },
                    To: [
                        {
                            Email: targetEmail,
                            Name: user.discordUsername
                        }
                    ],
                    Subject: 'Your Verification Code',
                    TextPart: `Your verification code is: ${code}. It expires in 10 minutes.`,
                    HTMLPart: `<h3>Welcome to MCBE Ranked!</h3><p>Your verification code is: <strong>${code}</strong></p><p>It expires in 10 minutes.</p>`
                }
            ]
        });

        return res.status(200).json({ ok: true });

    } catch (error) {
        console.error('Email Send Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
