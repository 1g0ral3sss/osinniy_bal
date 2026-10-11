import { put } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || process.env[Object.keys(process.env).find((k) => k.endsWith('READ_WRITE_TOKEN')) || ''];

const LIMITS = [80, 10, 80, 10]; // name1, class1, name2, class2

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const b = req.body || {};
  const vals = [b.name1, b.class1, b.name2, b.class2].map((v, i) => {
    const t = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return t.length > 0 && t.length <= LIMITS[i] ? t : null;
  });
  if (vals.some((v) => v === null)) {
    return res.status(400).json({ ok: false, error: 'invalid', msg: 'Перевірте, будь ласка, заповнені поля.' });
  }

  const ts = Date.now();
  const rand = randomBytes(3).toString('hex');
  const payload = Buffer.from(JSON.stringify(vals), 'utf8').toString('base64url');
  const pathname = `members/${ts}_${rand}_${payload}.json`;
  const body = JSON.stringify(
    { name1: vals[0], class1: vals[1], name2: vals[2], class2: vals[3], createdAt: new Date(ts).toISOString() },
    null, 2
  );

  let lastErr;
  for (const access of ['private', 'public']) {
    try {
      await put(pathname, body, { access, token: TOKEN, contentType: 'application/json', addRandomSuffix: false });
      return res.status(200).json({ ok: true });
    } catch (e) {
      lastErr = e;
    }
  }
  console.error('save failed', lastErr && lastErr.message);
  const noStore = !TOKEN;
  return res.status(500).json({
    ok: false,
    error: 'storage',
    msg: noStore ? 'Сховище Blob не підключено до проєкту (у Vercel додайте Blob до проєкту й зробіть Redeploy).' : 'Помилка сховища: ' + String((lastErr && lastErr.message) || '').slice(0, 120)
  });
}
