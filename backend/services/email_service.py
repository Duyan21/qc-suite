import html
import logging
import os
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "no-reply@qcsuite.local")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
EMAIL_CONSOLE_FALLBACK = os.getenv("EMAIL_CONSOLE_FALLBACK", "").lower() in ("1", "true", "yes")


def _send(to_email: str, subject: str, text_body: str, html_body: str, log_label: str, link: str) -> None:
    if not SMTP_HOST:
        if EMAIL_CONSOLE_FALLBACK:
            print(f"[{log_label}] email={to_email} link={link}")
        else:
            logger.error(
                f"SMTP is not configured (SMTP_HOST unset) and EMAIL_CONSOLE_FALLBACK is not "
                f"enabled — could not send [{log_label}] email to {to_email}"
            )
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = SMTP_FROM
    message["To"] = to_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(message)
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")


def send_verification_email(to_email: str, full_name: str | None, token: str) -> None:
    """Send the account-verification link. Falls back to a console log when
    SMTP_HOST isn't configured and EMAIL_CONSOLE_FALLBACK is enabled, so local
    dev works without real credentials."""
    link = f"{FRONTEND_URL}/verify-email?token={token}"
    greeting = f"Chào {full_name}," if full_name else "Chào bạn,"
    greeting_html = html.escape(greeting)
    text_body = (
        f"{greeting}\n\n"
        "Cảm ơn bạn đã đăng ký tài khoản QMS (Quality Management System).\n\n"
        f"Nhấn vào link sau để xác thực tài khoản của bạn (hết hạn sau 24 giờ):\n{link}\n\n"
        "Nếu bạn không tạo tài khoản này, vui lòng bỏ qua email này."
    )
    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #4f46e5;">QMS - Xác thực tài khoản</h2>
      <p>{greeting_html}</p>
      <p>Cảm ơn bạn đã đăng ký tài khoản QMS (Quality Management System).</p>
      <p>
        <a href="{link}" style="display: inline-block; padding: 10px 20px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px;">
          Xác thực tài khoản
        </a>
      </p>
      <p style="color: #71717a; font-size: 13px;">Link này hết hạn sau 24 giờ. Nếu bạn không tạo tài khoản này, vui lòng bỏ qua email này.</p>
    </div>
    """
    _send(to_email, "QMS - Xác thực tài khoản của bạn", text_body, html_body, "verify-email", link)


def send_reset_email(to_email: str, full_name: str | None, token: str) -> None:
    """Send the password-reset link. Falls back to a console log when
    SMTP_HOST isn't configured and EMAIL_CONSOLE_FALLBACK is enabled, so local
    dev works without real credentials."""
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    greeting = f"Chào {full_name}," if full_name else "Chào bạn,"
    greeting_html = html.escape(greeting)
    text_body = (
        f"{greeting}\n\n"
        "Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản QMS này.\n\n"
        f"Nhấn vào link sau để đặt lại mật khẩu (hết hạn sau 24 giờ):\n{link}\n\n"
        "Nếu bạn không yêu cầu điều này, mật khẩu của bạn sẽ không thay đổi — hãy bỏ qua email này."
    )
    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #4f46e5;">QMS - Đặt lại mật khẩu</h2>
      <p>{greeting_html}</p>
      <p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản QMS này.</p>
      <p>
        <a href="{link}" style="display: inline-block; padding: 10px 20px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px;">
          Đặt lại mật khẩu
        </a>
      </p>
      <p style="color: #71717a; font-size: 13px;">Link này hết hạn sau 24 giờ. Nếu bạn không yêu cầu điều này, mật khẩu của bạn sẽ không thay đổi.</p>
    </div>
    """
    _send(to_email, "QMS - Đặt lại mật khẩu", text_body, html_body, "password-reset", link)
