from aiogram import Router, types
from aiogram.filters import CommandStart
from config import Config
from keyboards.inline import main_menu

start_router = Router()


@start_router.message(CommandStart())
async def send_webapp(message: types.Message, config: Config):
    await message.answer(
        "Welcome to Game!",
        reply_markup=main_menu(domain=config.tg_bot.web_app_domain),
    )
