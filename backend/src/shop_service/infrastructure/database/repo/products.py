from sqlalchemy import insert, select

from infrastructure.database.models.products import OrderedProduct, Product
from infrastructure.database.repo.base import BaseRepo


class ProductRepo(BaseRepo):
    async def get_all(self):
        result = await self.session.execute(
            select(Product.product_id, Product.name, Product.price, Product.description)
        )
        return result.mappings().all()

    async def get_by_id(self, product_id: int):
        result = await self.session.execute(select(Product).where(Product.product_id == product_id))
        await self.session.commit()
        return result.scalar_one_or_none()

class OrderedProductRepo(BaseRepo):
    async def create(self, user_id: int, product_id: int, commit=True):
        result = await self.session.execute(
            insert(OrderedProduct).values(user_id=user_id, product_id=product_id).returning(OrderedProduct)
        )
        if commit:
            await self.session.commit()
        return result.scalar_one()
