"""
Pydantic models for authentication APIs.
"""

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(default="", max_length=120)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class PasswordResetRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    is_email_verified: bool
    created_at: str
    last_login_at: str | None = None


class AuthSessionResponse(BaseModel):
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
