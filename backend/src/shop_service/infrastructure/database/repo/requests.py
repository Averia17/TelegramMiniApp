from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from .products import ProductRepo, OrderedProductRepo


@dataclass
class RequestsRepo:
    session: AsyncSession

    @property
    def products(self) -> ProductRepo:
        return ProductRepo(self.session)

    @property
    def ordered_products(self) -> OrderedProductRepo:
        return OrderedProductRepo(self.session)
