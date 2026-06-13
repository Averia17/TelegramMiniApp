from aiogram.exceptions import TelegramAPIError
from aiogram.types import LabeledPrice, Message


# @router.message(Command("start"))
async def process_pay_command(message: Message) -> None:
    bot = None
    try:
        prices = [LabeledPrice(label="Stars Payment", amount=10)]
        await bot.send_invoice(
            chat_id=message.chat.id,
            title="Stars Payment Example",
            description="Payment for services via Stars.",
            provider_token="",
            currency="XTR",
            prices=prices,
            start_parameter="stars-payment",
            payload="stars-payment-payload",
        )
        await message.delete()
    except TelegramAPIError:
        await message.answer("❌ <b>Failed to create payment invoice</b>")


# @router.message(F.successful_payment)
# async def process_successful_payment(message: Message) -> None:
#     payment_info = message.successful_payment
#     transaction_id = payment_info.telegram_payment_charge_id
#
#     await message.answer(
#         MESSAGES['payment_success'].format(
#             amount=payment_info.total_amount,
#             transaction_id=html.quote(transaction_id)
#         )
#     )
