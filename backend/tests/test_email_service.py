def test_send_verification_email_console_fallback_link(monkeypatch, capsys):
    monkeypatch.setenv("EMAIL_CONSOLE_FALLBACK", "true")
    import importlib
    import services.email_service as email_service
    importlib.reload(email_service)
    email_service.send_verification_email("test@example.com", "Test User", "abc123")
    captured = capsys.readouterr()
    assert "test@example.com" in captured.out
    assert "/verify-email?token=abc123" in captured.out


def test_send_reset_email_console_fallback_link(monkeypatch, capsys):
    monkeypatch.setenv("EMAIL_CONSOLE_FALLBACK", "true")
    import importlib
    import services.email_service as email_service
    importlib.reload(email_service)
    email_service.send_reset_email("test@example.com", "Test User", "xyz789")
    captured = capsys.readouterr()
    assert "test@example.com" in captured.out
    assert "/reset-password?token=xyz789" in captured.out
