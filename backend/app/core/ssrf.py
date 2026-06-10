"""SSRF protection for user-supplied outbound URLs (e.g. webhooks).

A form editor can register a webhook URL that the server then POSTs to. Without a guard
they could point it at internal services or the cloud metadata endpoint
(``http://169.254.169.254/...``) and have the server fetch them — a classic SSRF.

We reject URLs whose host is (or resolves to) a private, loopback, link-local, or
otherwise non-public address. IP literals are always checked; hostnames are checked
against a small blocklist and, best-effort, by resolving them — a resolution failure is
allowed through (the delivery would simply fail to connect, granting no SSRF benefit),
while a hostname that *does* resolve to an internal IP is blocked (defends against DNS
rebinding). Self-hosters who genuinely need internal webhooks can set
``SUPFORM_WEBHOOK_BLOCK_PRIVATE_IPS=false``.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from app.core.config import settings
from app.core.exceptions import ValidationError

# Hostnames that commonly map to the local host or a metadata service.
_BLOCKED_HOSTNAMES = {
    "localhost",
    "ip6-localhost",
    "metadata",
    "metadata.google.internal",
}


def _is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _resolve_ips(host: str) -> list[str]:
    """Best-effort DNS resolution; an empty list means "couldn't resolve"."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return []
    return [info[4][0] for info in infos]


def assert_safe_url(url: str) -> None:
    """Raise ``ValidationError`` if ``url`` is not a safe public http(s) target."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValidationError("Webhook URL must be an http(s) URL", details={"url": url})
    host = parsed.hostname
    if not host:
        raise ValidationError("Webhook URL must include a host", details={"url": url})

    if not settings.webhook_block_private_ips:
        return

    if host.lower() in _BLOCKED_HOSTNAMES:
        raise ValidationError("Webhook URL host is not allowed", details={"url": url})

    # IP literal: check directly (no DNS needed).
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        if not _is_public(ip):
            raise ValidationError(
                "Webhook URL must point to a public address", details={"url": url}
            )
        return

    # Hostname: block if it resolves to any non-public address (DNS-rebinding defense).
    for resolved in _resolve_ips(host):
        try:
            if not _is_public(ipaddress.ip_address(resolved)):
                raise ValidationError(
                    "Webhook URL resolves to a non-public address", details={"url": url}
                )
        except ValueError:
            continue
