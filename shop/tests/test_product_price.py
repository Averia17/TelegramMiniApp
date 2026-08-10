import unittest
from types import SimpleNamespace

from auth import require_shop_service
from routes.products import get_product_price, router


class _Products:
    async def get_by_id(self, _product_id):
        return SimpleNamespace(product_id=1001, price=27)


class _Repo:
    products = _Products()


class ProductPriceRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_product_price_route_returns_catalog_price(self):
        self.assertEqual(
            await get_product_price(1001, _Repo()),
            {"product_id": 1001, "price": 27.0},
        )

    def test_product_price_route_requires_service_authentication(self):
        route = next(
            route
            for route in router.routes
            if route.path == "/products/{product_id}/price"
        )

        self.assertIn(
            require_shop_service,
            [dependency.call for dependency in route.dependant.dependencies],
        )
