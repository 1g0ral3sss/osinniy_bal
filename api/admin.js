import { list, del } from '@vercel/blob';
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || process.env[Object.keys(process.env).find((k) => k.endsWith('READ_WRITE_TOKEN')) || ''];

const LOGIN = process.env.ADMIN_LOGIN || 'Loki';
const PASS = process.env.ADMIN_PASS || 'osinniy_bal';
const SECRET = process.env.ADMIN_SECRET || `${PASS}::osinniy-bal-secret`;

const token = () => createHmac('sha256', SECRET).update(`${LOGIN}:${PASS}`).digest('hex');
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const isAuthed = (req) => {
  const m = /(?:^|;\s*)adm=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return !!m && same(m[1], token());
};

async function allBlobs() {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix: 'members/', cursor, limit: 1000, token: TOKEN });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

function parse(pathname) {
  const f = pathname.replace(/^members\//, '').replace(/\.json$/, '').split('_');
  try {
    const [n1, c1, n2, c2] = JSON.parse(Buffer.from(f.slice(2).join('_'), 'base64url').toString('utf8'));
    return { id: pathname, name1: n1, class1: c1, name2: n2, class2: c2, createdAt: Number(f[0]) };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST') {
    const { login, pass } = req.body || {};
    if (same(login ?? '', LOGIN) && same(pass ?? '', PASS)) {
      res.setHeader('Set-Cookie', `adm=${token()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
      return res.status(200).json({ ok: true });
    }
    return res.status(401).json({ ok: false });
  }

  if (!isAuthed(req)) return res.status(401).json({ ok: false });

  if (req.method === 'GET') {
    try {
      const rows = (await allBlobs()).map((b) => parse(b.pathname)).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
      return res.status(200).json({ ok: true, rows });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, msg: 'Не вдалося прочитати список. Перевірте підключення Blob.' });
    }
  }

  if (req.method === 'DELETE') {
    const id = String((req.body || {}).id || '');
    const hit = (await allBlobs()).find((b) => b.pathname === id);
    if (hit) await del(hit.url, { token: TOKEN });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PUT') { // вихід
    res.setHeader('Set-Cookie', 'adm=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false });
}
