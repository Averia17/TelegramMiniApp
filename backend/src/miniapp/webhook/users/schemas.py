from pydantic import BaseModel, Field


class PaymentRequest(BaseModel):
    user_id: int = Field(gt=0, description="User ID must be positive")
    amount: int = Field(gt=0, description="Amount must be positive")
    payment_key: str
