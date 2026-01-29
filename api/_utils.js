import { parse } from 'cookie';

const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const INSTANT_ADMIN_TOKEN = process.env.INSTANTDB_ADMIN_TOKEN;

export async function getUser(req) {
    const cookies = parse(req.headers.cookie || '');
    const userId = cookies.session; // Now it's just the plain userId string

    if (!userId) return null;

    try {
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
        return data.users?.[0] || null;
    } catch (e) {
        return null;
    }
}

export async function transact(ops) {
    const response = await fetch(`https://api.instantdb.com/admin/apps/${APP_ID}/transact`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INSTANT_ADMIN_TOKEN}`
        },
        body: JSON.stringify({ ops })
    });
    return response.json();
}
