from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models.all_models import User
from models.base import get_db
from schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
)
from services.auth_service import (
    create_access_token,
    create_reset_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return Token(access_token=create_access_token(user.id))


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    reset_token = create_reset_token(user.id)
    print(f"[password-reset] email={user.email} token={reset_token}")
    return ForgotPasswordResponse(reset_token=reset_token, expires_in_minutes=30)
