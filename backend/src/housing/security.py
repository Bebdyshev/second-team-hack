from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.housing import store
from src.utils.auth_utils import create_access_token, create_refresh_token, verify_token


_http_bearer = HTTPBearer(auto_error=False)


def issue_tokens_for_user(user: dict[str, str]) -> tuple[str, str]:
    access_token = create_access_token(
        {
            "sub": user["email"],
            "user_id": user["id"],
            "role": user["role"],
            "token_type": "access",
        }
    )
    refresh_token = create_refresh_token(
        {
            "sub": user["email"],
            "user_id": user["id"],
            "role": user["role"],
            "token_type": "refresh",
        }
    )
    store.set_refresh_token(user["id"], refresh_token)
    return access_token, refresh_token


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_http_bearer),
) -> dict[str, str]:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing authorization header")

    payload = verify_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid access token")
    if payload.get("token_type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token type")

    user = store.get_user_by_id(str(payload.get("user_id", "")))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")

    return user


def require_manager(user: dict[str, str] = Depends(get_current_user)) -> dict[str, str]:
    if user["role"] != "Manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="manager role required")
    return user


def verify_refresh_token_and_get_user(refresh_token: str) -> dict[str, str]:
    payload = verify_token(refresh_token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token")
    if payload.get("token_type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token type")

    user = store.get_user_by_id(str(payload.get("user_id", "")))
    if user is None or user.get("refresh_token") != refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token")

    return user
