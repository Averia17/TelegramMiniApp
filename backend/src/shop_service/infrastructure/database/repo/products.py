from sqlalchemy import insert, select

from infrastructure.database.models.products import OrderedProduct, Product
from infrastructure.database.repo.base import BaseRepo


class ProductRepo(BaseRepo):
    async def get_all(self):
        result = await self.session.execute(
            select(Product.product_id, Product.name, Product.price, Product.description)
        )
        return result.mappings().all()


class OrderedProductRepo(BaseRepo):
    async def create(self, user_id: int, product_id: int):
        result = await self.session.execute(
            insert(OrderedProduct).values(user_id=user_id, product_id=product_id).returning(OrderedProduct)
        )
        await self.session.commit()
        return result.scalar_one()
