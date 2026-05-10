const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@taller.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const enviarNotificacion = async (subscription, payload) => {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  if (!subscription || !subscription.endpoint) return;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    // 410 Gone = suscripción expirada, no es un error crítico
    if (err.statusCode !== 410) {
      console.error(`[PUSH] Error enviando notificación: ${err.message}`);
    }
  }
};

module.exports = { enviarNotificacion };
