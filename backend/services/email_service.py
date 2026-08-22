import os
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "no-reply@qcsuite.local")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def build_reset_link(reset_token: str) -> str:
    return f"{FRONTEND_URL}/reset-password?token={reset_token}"


def send_reset_email(to_email: str, reset_token: str) -> None:
    """Send the password-reset link by SMTP.

    Falls back to logging the link to the console when SMTP_HOST isn't
    configured, so local dev works without real mail credentials.
    """
    reset_link = build_reset_link(reset_token)

    if not SMTP_HOST:
        print(f"[password-reset] email={to_email} link={reset_link}")
        return

    message = EmailMessage()
    message["Subject"] = "QMS - Đặt lại mật khẩu"
    message["From"] = SMTP_FROM
    message["To"] = to_email
    message.set_content(
        "Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản QMS này.\n\n"
        f"Nhấn vào link sau để đặt lại mật khẩu (hết hạn sau 30 phút):\n{reset_link}\n\n"
        "Nếu bạn không yêu cầu điều này, hãy bỏ qua email này."
    )

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        if SMTP_USER and SMTP_PASSWORD:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(message)
