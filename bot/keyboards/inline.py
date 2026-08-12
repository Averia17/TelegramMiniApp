from aiogram.types import WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder


def main_menu(domain: str):
    keyboard = InlineKeyboardBuilder()
    keyboard.button(text="Main Page", web_app=WebAppInfo(url=domain))
    keyboard.adjust(1)
    return keyboard.as_markup()
