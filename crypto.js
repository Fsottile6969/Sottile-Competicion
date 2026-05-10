const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

// Lazy-load KEY para evitar crash si se importa antes de dotenv
let KEY = null;
function getKey() {
  if (!KEY) {
    KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
    if (KEY.length !== 32) throw new Error('ENCRYPTION_KEY inválida');
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
  if (parts.length !== 3) return text; // dato no cifrado (legacy)
  try {
    const key = getKey();
    const [ivHex, tagHex, dataHex] = parts;
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
