import { serialize } from 'cookie';

export default async function handler(req, res) {
    res.setHeader('Set-Cookie', serialize('session', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: new Date(0) // Expire immediately
    }));

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['host'];

    return res.redirect(302, `${protocol}://${host}/`);
}
