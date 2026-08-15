"""Transactional email — Hostinger SMTP (implicit TLS on 465) + branded HTML templates."""
import os
import ssl
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr, make_msgid

logger = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.hostinger.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "Binary Fund Global")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", SMTP_USERNAME)
SMTP_REPLY_TO = os.environ.get("SMTP_REPLY_TO", "support@binaryfundglobal.com")
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "")
EMAIL_LOGO_URL = os.environ.get("EMAIL_LOGO_URL", "")
VERIFY_TOKEN_HOURS = int(os.environ.get("EMAIL_VERIFY_TOKEN_HOURS", "48"))
RESET_TOKEN_MINUTES = int(os.environ.get("PASSWORD_RESET_TOKEN_MINUTES", "30"))
TWO_FA_CODE_MINUTES = int(os.environ.get("TWO_FA_CODE_MINUTES", "10"))


def smtp_configured() -> bool:
    return bool(SMTP_USERNAME and SMTP_PASSWORD)

BRAND = "Binary Fund Global"
BG = "#e3f4e9"
CARD = "#e3f4e9"
HEAD = "#b4dfc7"
GREEN = "#0f9d63"
DARK = "#0e2019"
TEXT = "#26382f"
MUTED = "#5f7a6c"


def send_email(subject: str, html_body: str, text_body: str, to_email: str, from_name: str = None) -> None:
    """Blocking SMTP send — always call via FastAPI BackgroundTasks."""
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        logger.error("SMTP not configured — skipping email to %s", to_email)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name or SMTP_FROM_NAME, SMTP_FROM_EMAIL))
    msg["To"] = to_email
    msg["Reply-To"] = SMTP_REPLY_TO
    msg["Message-ID"] = make_msgid(domain=SMTP_FROM_EMAIL.split("@")[-1])
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=25) as server:
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, [to_email], msg.as_string())
        logger.info("Email sent to %s | %s", to_email, subject)
    except Exception as exc:
        logger.error("Email to %s failed: %s", to_email, exc)


def _shell(title: str, inner: str) -> str:
    """Open, card free layout on the brand gradient. Fluid width for mobile, capped on desktop."""
    logo = (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">'
        f'<tr>'
        f'<td style="padding-right:10px;"><img src="{EMAIL_LOGO_URL}" alt="{BRAND}" width="30" '
        f'style="display:block;border:0;outline:none;text-decoration:none;width:30px;height:auto;" /></td>'
        f'<td class="brand" style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:{DARK};letter-spacing:0.3px;">'
        f'Binary Fund <span style="color:{GREEN};">Global</span></td>'
        f'</tr></table>'
        if EMAIL_LOGO_URL else
        f'<div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:{GREEN};text-align:center;margin:0;">{BRAND}</div>'
    )
    return f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>{title}</title>
<style>
  body {{ margin:0; padding:0; width:100% !important; background-color:{BG}; }}
  img {{ border:0; outline:none; text-decoration:none; }}
  a {{ color:{GREEN}; }}
  @media only screen and (max-width:620px) {{
    .head {{ padding:22px 22px !important; }}
    .wrap {{ padding:30px 22px !important; }}
    .h1 {{ font-size:23px !important; line-height:1.28 !important; }}
    .body-text {{ font-size:15px !important; }}
    .list-text {{ font-size:14.5px !important; }}
    .cta a {{ padding:15px 34px !important; font-size:15px !important; display:block !important; }}
    .foot {{ padding:24px 20px 30px !important; font-size:12px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background-color:{BG};">
<div style="display:none;font-size:1px;color:{BG};max-height:0;overflow:hidden;">{title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="width:100%;background-color:{BG};">
<tr><td align="center" style="padding:26px 14px 34px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
         style="width:100%;max-width:600px;margin:0 auto;">
    <tr><td class="card" bgcolor="{CARD}"
            style="background-color:{CARD};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="head" align="center" bgcolor="{HEAD}"
                style="background-color:{HEAD};padding:26px 30px;border-bottom:2px solid {GREEN};">
          {logo}
        </td></tr>
        <tr><td class="wrap" align="center"
                style="padding:38px 36px 38px;font-family:Arial,Helvetica,sans-serif;color:{TEXT};font-size:16px;line-height:1.75;text-align:center;">
          {inner}
        </td></tr>
      </table>
    </td></tr>
    <tr><td class="foot" align="center"
            style="padding:24px 26px 6px;font-family:Arial,Helvetica,sans-serif;color:{MUTED};font-size:12.5px;line-height:1.7;text-align:center;">
      <p style="margin:0 0 12px;">{BRAND}, a funded trading program for binary options traders worldwide.</p>
      <p style="margin:0 0 12px;color:#809589;font-size:11.5px;">Trading involves significant risk and may not be suitable for all traders. The value of your account can go down as well as up, and past performance is not indicative of future results.</p>
      <p style="margin:0;color:#809589;font-size:11.5px;">&copy; 2026 {BRAND}. All rights reserved.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>"""


def _button(link: str, label: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="cta" style="margin:8px auto 24px;">'
        f'<tr><td align="center" bgcolor="{GREEN}" style="border-radius:0;'
        f'background-image:linear-gradient(180deg,#13b473 0%,{GREEN} 100%);">'
        f'<a href="{link}" style="display:inline-block;padding:15px 42px;font-family:Arial,Helvetica,sans-serif;'
        f'font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:0;">{label}</a>'
        f'</td></tr></table>'
    )


def build_verification_email(to_email: str, link: str) -> tuple[str, str, str]:
    inner = f"""
      <h1 class="h1" style="margin:0 0 18px;font-size:28px;line-height:1.3;color:{DARK};font-weight:bold;">Verify Your Email</h1>
      <p style="margin:0 0 24px;">Please verify your email address to activate your Binary Fund Global account and secure your payouts.</p>
      {_button(link, "Verify Email")}
      <p style="margin:0;color:{MUTED};font-size:12.5px;">If you did not create this account, you can safely ignore this email.</p>
    """
    text = f"""Verify Your Email

Please verify your email address to activate your Binary Fund Global account and secure your payouts.

Open this link to verify:
{link}

If you did not create this account, you can safely ignore this email."""
    return "Verify Your Email", _shell("Verify Your Email", inner), text


def build_welcome_email(to_email: str, name: str = "", verified: bool = False) -> tuple[str, str, str]:
    greeting = f"Dear {name.strip().split()[0]}," if name.strip() else "Dear User,"
    points = [
        "Practice risk free with your $500 demo balance on 30+ OTC pairs.",
        "Pass a one time challenge and we fund you with our own capital.",
        "Receive a real Quotex account with a live balance of up to $3,000.",
        "Trade our capital and keep the profit you make, with transparent payout rules.",
        "Follow clear challenge rules for daily loss limits and profit targets, with no hidden conditions.",
    ]
    rows = ""
    for i, p in enumerate(points, start=1):
        rows += f"""
        <tr>
          <td width="30" valign="top" style="padding:7px 12px 7px 0;">
            <div style="width:24px;height:24px;border:1px solid rgba(15,157,99,0.45);background-color:rgba(15,157,99,0.10);border-radius:0;color:{GREEN};
                        font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;line-height:24px;text-align:center;">{i}</div>
          </td>
          <td valign="top" style="padding:7px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:{TEXT};text-align:left;" class="list-text">{p}</td>
        </tr>"""

    verify_line = (
        "Your email address is already verified, so your account is fully active and ready to use."
        if verified else
        "Please confirm your email address using the verification message we sent separately, so we can secure your account and unlock payouts."
    )
    inner = f"""
      <h1 class="h1" style="margin:0 0 18px;font-size:28px;line-height:1.3;color:{DARK};font-weight:bold;">Welcome to Binary Fund Global</h1>
      <p style="margin:0 0 16px;">{greeting}</p>
      <p style="margin:0 0 22px;">Your account is created and ready. Here is everything you get with us:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 22px;max-width:420px;">
        {rows}
      </table>
      <p style="margin:0 0 6px;">{verify_line}</p>
      <p style="margin:18px 0 0;color:{MUTED};font-size:13px;">We are glad to have you with us. Trade well and stay disciplined.</p>
    """
    text = f"""Welcome to Binary Fund Global

{greeting}

Your account is created and ready. Here is everything you get with us:

1. {points[0]}
2. {points[1]}
3. {points[2]}
4. {points[3]}
5. {points[4]}

{verify_line}

We are glad to have you with us. Trade well and stay disciplined."""
    return "Welcome to Binary Fund Global", _shell("Welcome", inner), text


def build_google_welcome_email(to_email: str, name: str, password: str) -> tuple[str, str, str]:
    greeting = f"Dear {name.strip().split()[0]}," if name.strip() else "Hello!"
    inner = f"""
      <h1 class="h1" style="margin:0 0 18px;font-size:28px;line-height:1.3;color:{DARK};font-weight:bold;">Thank You for Registering</h1>
      <p style="margin:0 0 16px;">{greeting}</p>
      <p style="margin:0 0 16px;">You are registered on Binary Fund Global using your <strong>Google account</strong>, so your email address is already verified.</p>
      <p style="margin:0 0 22px;">You can log in to your account with Google anytime, or use the password that we generated for you:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 22px;">
        <tr><td align="center" style="border:1px solid rgba(15,157,99,0.45);background-color:rgba(15,157,99,0.10);padding:14px 30px;">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:{MUTED};display:block;margin-bottom:4px;">Your password</span>
          <span style="font-family:'Courier New',Courier,monospace;font-size:19px;font-weight:bold;color:{DARK};letter-spacing:1px;">{password}</span>
        </td></tr>
      </table>
      <p style="margin:0 0 6px;">Keep this password safe. You can change it anytime using the Forgot Password option on the login page.</p>
      <p style="margin:18px 0 0;color:{MUTED};font-size:12.5px;">Please do not reply to this email. If you did not sign up, please ignore this email.</p>
    """
    text = f"""Thank You for Registering

{greeting}

You are registered on Binary Fund Global using your Google account, so your email address is already verified.

You can log in to your account with Google anytime, or use the password that we generated for you:

Your password: {password}

Keep this password safe. You can change it anytime using the Forgot Password option on the login page.

Please do not reply to this email. If you did not sign up, please ignore this email."""
    return "Your Binary Fund Global Login Details", _shell("Your Login Details", inner), text


def build_2fa_email(code: str, purpose: str = "login") -> tuple[str, str, str]:
    reason = (
        "Use this code to complete your sign in to Binary Fund Global."
        if purpose == "login" else
        "Use this code to confirm the change to your two step verification settings."
    )
    window = f"{TWO_FA_CODE_MINUTES} minutes"
    inner = f"""
      <h1 class="h1" style="margin:0 0 18px;font-size:28px;line-height:1.3;color:{DARK};font-weight:bold;">Your Authentication Code</h1>
      <p style="margin:0 0 22px;">{reason}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;">
        <tr><td align="center" style="border:1px solid rgba(15,157,99,0.45);background-color:rgba(15,157,99,0.10);padding:18px 36px;">
          <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;color:{DARK};letter-spacing:10px;">{code}</span>
        </td></tr>
      </table>
      <p style="margin:0 0 6px;">This code expires in <strong style="color:{GREEN};">{window}</strong> and can be used only once.</p>
      <p style="margin:18px 0 0;color:{MUTED};font-size:12.5px;">If you did not request this code, you can safely ignore this email. Never share this code with anyone, our team will never ask for it.</p>
    """
    text = f"""Your Authentication Code

{reason}

Your code: {code}

This code expires in {window} and can be used only once.

If you did not request this code, you can safely ignore this email. Never share this code with anyone, our team will never ask for it."""
    return "Your Authentication Code", _shell("Your Authentication Code", inner), text


def build_reset_email(link: str) -> tuple[str, str, str]:
    window = "30 minutes" if RESET_TOKEN_MINUTES == 30 else f"{RESET_TOKEN_MINUTES} minutes"
    inner = f"""
      <h1 class="h1" style="margin:0 0 18px;font-size:28px;line-height:1.3;color:{DARK};font-weight:bold;">Reset Your Password</h1>
      <p style="margin:0 0 16px;">We received a request to reset the password for your Binary Fund Global account. Click the button below to choose a new one.</p>
      <p style="margin:0 0 24px;">This link expires in <strong style="color:{GREEN};">{window}</strong>.</p>
      {_button(link, "Reset Password")}
      <p style="margin:0;color:{MUTED};font-size:12.5px;">If you did not request this, no action is needed and your password stays unchanged.</p>
    """
    text = f"""Reset Your Password

We received a request to reset the password for your Binary Fund Global account.

Open this link to choose a new password:
{link}

This link expires in {window}.

If you did not request this, no action is needed and your password stays unchanged."""
    return "Reset Your Password", _shell("Reset Your Password", inner), text
