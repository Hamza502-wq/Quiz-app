import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { maskPhone } from '../../lib/phone';

export type MessageChannel = 'SMS' | 'WHATSAPP';

/**
 * Sends an SMS or WhatsApp message. With SMS_PROVIDER=console (default for
 * development) messages are written to the log instead of being sent.
 * Returns true when the provider accepted the message.
 */
export async function sendMessage(to: string, body: string, channel: MessageChannel = 'SMS'): Promise<boolean> {
  if (env.SMS_PROVIDER === 'console') {
    logger.info({ to: env.isProduction ? maskPhone(to) : to, channel }, `[${channel}] ${body}`);
    return true;
  }

  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_SMS_FROM, TWILIO_WHATSAPP_FROM } = env;
  const from = channel === 'WHATSAPP' ? TWILIO_WHATSAPP_FROM : TWILIO_SMS_FROM;
  if (!sid || !token || !from) {
    logger.error({ channel }, 'Twilio is not fully configured; message not sent');
    return false;
  }

  const params = new URLSearchParams({
    To: channel === 'WHATSAPP' ? `whatsapp:${to}` : to,
    From: channel === 'WHATSAPP' && !from.startsWith('whatsapp:') ? `whatsapp:${from}` : from,
    Body: body,
  });

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.error({ status: res.status, body: await res.text(), to: maskPhone(to), channel }, 'Twilio send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, to: maskPhone(to), channel }, 'Twilio request error');
    return false;
  }
}
