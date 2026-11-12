# Security Policy

## Supported Versions

Security updates and patches are actively maintained for the latest major release of **Mireva**.

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

Because **Mireva** manages sensitive social media credentials, browser session cookies, and autonomous AI execution, we take security issues seriously.

If you discover a security vulnerability (such as credential/key leakage, Fernet vault bypasses, browser sandbox escapes, SSRF, or WebSocket/CDP exposure), **please do not open a public GitHub issue.**

Instead, please report it privately using **[GitHub Private Vulnerability Reporting](https://github.com/Ankush0286/mireva/security/advisories/new)**.

### What to Include
* A clear description of the vulnerability and affected component (`backend`, `frontend`, `services/browser-bridge`, or `Caddyfile`)
* Steps to reproduce or a proof-of-concept
* Potential impact and suggested remediation (if known)

### Response Timeline
* We will acknowledge receipt of your report within **48 hours**.
* We will evaluate the severity, keep you updated on remediation progress, and credit you in the release notes upon patching (unless you prefer to remain anonymous).

---

## Security Best Practices for Self-Hosters

1. **Generate a Strong Master Key:** Never deploy in production with the default `SECRET_KEY`. Generate a fresh 32-byte base64 key:
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
2. **Isolate the Go Browser Bridge:** Do not expose port `8080` (Go CDP Bridge) or port `8000` (FastAPI) directly to the public internet. Always route traffic through the unified **Caddy** gateway (`Caddyfile`).
3. **Protect Persistent Volumes:** `storage/browser_sessions/` contains live authenticated social cookies (`storage_state.json`). Ensure host directory permissions are strictly restricted.