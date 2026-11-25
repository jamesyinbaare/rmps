from app.services.sms.types import SmsDeliveryResult


class NoopSmsProvider:
    async def send_sms(self, msisdn: str, message: str) -> SmsDeliveryResult:
        return SmsDeliveryResult(sent=False, error="SMS is disabled")
