import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models.all_models import User
from models.base import get_db
from schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
)
from services.auth_service import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

RESET_TOKEN_EXPIRE_MINUTES = 15


def _utcnow() -> datetime:
    # users.reset_token_exp is TIMESTAMP WITHOUT TIME ZONE, so SQLAlchemy
    # round-trips it as a naive datetime — comparing against an aware
    # datetime.now(timezone.utc) would raise TypeError, hence the strip here.
    return datetime.now(timezone.utc).replace(tzinfo=None)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    is_first_user = db.query(User).count() == 0
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        is_superadmin=is_first_user,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    # An invited-but-never-activated user has an empty hashed_password; bcrypt
    # raises ValueError ("Invalid salt") on it, so short-circuit to a clean 401.
    if user is None or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if user.status == "Suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is retired",
        )

    return Token(access_token=create_access_token(user.id))


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Always returns 200 with the same response shape whether or not the
    # email exists, so a caller can't use this endpoint to enumerate accounts.
    reset_token = secrets.token_urlsafe(32)
    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None:
        user.reset_token = reset_token
        user.reset_token_exp = _utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
        db.commit()

    return ForgotPasswordResponse(
        reset_token=reset_token,
        expires_in=f"{RESET_TOKEN_EXPIRE_MINUTES} minutes",
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == payload.token).first()
    if (
        user is None
        or user.reset_token_exp is None
        or user.reset_token_exp < _utcnow()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )

    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_exp = None
    db.commit()

    return ResetPasswordResponse(message="Password reset successful")


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
