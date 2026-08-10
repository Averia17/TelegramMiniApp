import unittest

import httpx
from services.shop_catalog import (ShopCatalogClient, ShopCatalogError,
                                   ShopProductNotFound)


class ShopCatalogClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_price_uses_product_id_endpoint_and_service_auth(self):
        requests = []

        async def handler(request):
            requests.append(request)
            return httpx.Response(
                200,
                json={"product_id": 1001, "price": 27},
            )

        client = ShopCatalogClient(
            "http://shop.test/api/products", transport=httpx.MockTransport(handler)
        )

        self.assertEqual(await client.get_price(1001), 27)
        self.assertEqual(requests[0].url.path, "/api/products/1001/price")
        self.assertTrue(requests[0].headers["X-Service-Token"])

    async def test_get_price_rejects_missing_products(self):
        async def handler(_request):
            return httpx.Response(404)

        client = ShopCatalogClient(
            "http://shop.test/api/products", transport=httpx.MockTransport(handler)
        )

        with self.assertRaises(ShopProductNotFound):
            await client.get_price(1001)

    async def test_get_price_rejects_invalid_catalog_responses(self):
        async def handler(_request):
            return httpx.Response(200, json={"product_id": 1001, "price": 27.5})

        client = ShopCatalogClient(
            "http://shop.test/api/products", transport=httpx.MockTransport(handler)
        )

        with self.assertRaises(ShopCatalogError):
            await client.get_price(1001)
