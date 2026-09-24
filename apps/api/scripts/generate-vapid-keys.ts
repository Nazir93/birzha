/**
 * Генерация VAPID-ключей для Web Push.
 * Запуск: `pnpm --filter @birzha/api exec tsx scripts/generate-vapid-keys.ts`
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("Добавьте в apps/api/.env:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:admin@24birzha.ru");
