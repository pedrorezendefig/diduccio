"""Console sem UTF-8: o painel sobe mesmo assim.

No Windows, a saída do Python segue a página de código do sistema (cp1252), que não tem o
✓ nem o ✗ das mensagens do serve.py; o print derrubava o servidor antes de ele atender.
"""

import io
import sys
from pathlib import Path

DASH = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DASH))

import serve  # noqa: E402


def _console_cp1252(monkeypatch, nome):
    bruto = io.BytesIO()
    console = io.TextIOWrapper(bruto, encoding="cp1252")
    monkeypatch.setattr(sys, nome, console)
    return bruto, console


def test_check_sai_no_console_cp1252(monkeypatch):
    bruto, console = _console_cp1252(monkeypatch, "stdout")
    serve.console_utf8()
    print("✓ Dashboard do workflow")
    sys.stdout.flush()
    assert "✓ Dashboard".encode("utf-8") in bruto.getvalue()


def test_erro_sai_no_console_cp1252(monkeypatch):
    bruto, console = _console_cp1252(monkeypatch, "stderr")
    serve.console_utf8()
    print("✗ nenhuma porta livre", file=sys.stderr)
    sys.stderr.flush()
    assert "✗ nenhuma porta".encode("utf-8") in bruto.getvalue()
