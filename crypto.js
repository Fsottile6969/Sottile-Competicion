const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const HEX_REGEX = /^[0-9a-f]+$/i; // CWE-185 — regex literal

let KEY = null;
function getKey() {
  if (!KEY) {
    const raw = String(process.env.ENCRYPTION_KEY || '');
    if (raw.length !== 64 || !HEX_REGEX.test(raw)) throw new Error('ENCRYPTION_KEY inválida');
    KEY = Buffer.from(raw, 'hex');
  }
  return KEY;
}

function encrypt(text) {
  if (text === null || text === undefined || text === '') return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
  if (!text || typeof text !== 'string') return null;
  const parts = text.split(':');
  if (parts.length !== 3) return text;
  try {
    // CWE-502 — validar que cada parte es hex válido antes de Buffer.from
    const [ivHex, tagHex, dataHex] = parts;
    if (!HEX_REGEX.test(ivHex) || !HEX_REGEX.test(tagHex) || !HEX_REGEX.test(dataHex)) return null;
    if (ivHex.length !== 24 || tagHex.length !== 32) return null; // iv=12bytes, tag=16bytes

    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
