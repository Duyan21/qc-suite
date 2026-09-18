import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models.all_models import User
from models.base import get_db
from schemas.auth import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
    VerifyEmailRequest,
)
from services.auth_service import (
    TOKEN_EXPIRE_HOURS,
    create_access_token,
    get_current_user,
    hash_password,
    utcnow_naive,
    verify_password,
)
from services.email_service import send_reset_email, send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    is_first_user = db.query(User).count() == 0
    verification_token = secrets.token_urlsafe(32)
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        is_superadmin=is_first_user,
        is_email_verified=False,
        verification_token=verification_token,
        verification_token_exp=utcnow_naive() + timedelta(hours=TOKEN_EXPIRE_HOURS),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    background_tasks.add_task(send_verification_email, user.email, user.full_name, verification_token)
    return user


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verification_token == payload.token).first()
    if (
        user is None
        or user.verification_token_exp is None
        or user.verification_token_exp < utcnow_naive()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
        )

    user.is_email_verified = True
    user.verification_token = None
    user.verification_token_exp = None
    db.commit()
    return MessageResponse(message="Email verified")


@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None and not user.is_email_verified:
        token = secrets.token_urlsafe(32)
        user.verification_token = token
        user.verification_token_exp = utcnow_naive() + timedelta(hours=TOKEN_EXPIRE_HOURS)
        db.commit()
        background_tasks.add_task(send_verification_email, user.email, user.full_name, token)

    return MessageResponse(
        message="Nếu tài khoản tồn tại và chưa xác thực, một email xác thực mới đã được gửi."
    )


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
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified",
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


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_exp = utcnow_naive() + timedelta(hours=TOKEN_EXPIRE_HOURS)
        db.commit()
        background_tasks.add_task(send_reset_email, user.email, user.full_name, token)

    return MessageResponse(
        message="Nếu email tồn tại trong hệ thống, bạn sẽ nhận được link đặt lại mật khẩu trong ít phút."
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == payload.token).first()
    if (
        user is None
        or user.reset_token_exp is None
        or user.reset_token_exp < utcnow_naive()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )

    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_exp = None
    db.commit()
    return MessageResponse(message="Password reset successful")


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
