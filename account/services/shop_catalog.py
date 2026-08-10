import logging
import os
from decimal import Decimal, InvalidOperation

import httpx
from auth import service_token

log = logging.getLogger(__name__)

DEFAULT_CATALOG_URL = "http://shop:8000/api/products"
TIMEOUT = 5.0


class ShopCatalogError(RuntimeError):
    """The authoritative shop catalog could not provide a valid price."""


class ShopProductNotFound(LookupError):
    """The requested product does not exist in the shop catalog."""


class ShopCatalogClient:
    def __init__(
        self,
        base_url: str | None = None,
        timeout: float = TIMEOUT,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.base_url = (
            base_url or os.getenv("SHOP_CATALOG_URL", DEFAULT_CATALOG_URL)
        ).rstrip("/")
        self.timeout = timeout
        self.transport = transport

    async def get_price(self, product_id: int) -> int:
        url = f"{self.base_url}/{product_id}/price"
        try:
            token = service_token()
            async with httpx.AsyncClient(
                timeout=self.timeout, transport=self.transport
            ) as client:
                response = await client.get(url, headers={"X-Service-Token": token})
        except (httpx.RequestError, RuntimeError) as err:
            log.error("Shop catalog request failed for product %s: %s", product_id, err)
            raise ShopCatalogError("Shop catalog is unavailable") from err

        if response.status_code == 404:
            raise ShopProductNotFound(f"Product {product_id} not found")
        if not 200 <= response.status_code < 300:
            log.error(
                "Shop catalog returned status %s for product %s",
                response.status_code,
                product_id,
            )
            raise ShopCatalogError("Shop catalog rejected the price request")

        try:
            payload = response.json()
            returned_product_id = int(payload["product_id"])
            price = Decimal(str(payload["price"]))
        except (KeyError, TypeError, ValueError, InvalidOperation) as err:
            log.error("Invalid shop price response for product %s", product_id)
            raise ShopCatalogError("Shop catalog returned an invalid price") from err

        if returned_product_id != product_id:
            raise ShopCatalogError("Shop catalog returned the wrong product")
        if price <= 0 or price != price.to_integral_value():
            raise ShopCatalogError("Shop catalog returned an invalid price")
        return int(price)


shop_catalog_client = ShopCatalogClient()
