import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { entrar } from "../api/auth";
import { Badge, Button, CampoSenha, Field, Input } from "../ui";
import Logo from "../brand/Logo";
import Skyline from "../brand/Skyline";

export default function SelecaoUsuario({ onSelectUser }) {
  const navigate = useNavigate();
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState("");

  const submeter = async (e) => {
    e.preventDefault();
    if (!identificador || !senha || entrando) return;

    setEntrando(true);
    setErro("");

    try {
      const resultado = await entrar(identificador, senha);

      if (resultado.success) {
        // Nunca persistir a senha: `entrar` já devolve o usuário sem ela.
        sessionStorage.setItem("usuarioLogado", JSON.stringify(resultado.usuario));
        onSelectUser(resultado.usuario);
        // Sempre para o painel. Quem precisa trocar a senha recebe o modal
        // por cima, decidido pelo App a partir do banco — e não por este
        // navigate, que só acontecia no login e deixava passar quem
        // recarregava a página com a sessão viva.
        navigate("/dashboard");
      } else {
        // Mesma mensagem para identificador inexistente e senha errada, de
        // propósito: não virar um verificador de quem tem conta.
        setErro(resultado.message || "Usuário ou senha incorretos.");
        setEntrando(false);
      }
    } catch {
      setErro("Não foi possível conectar ao servidor.");
      setEntrando(false);
    }
  };

  return (
    <div className="vit-login">
      <Skyline className="vit-login__skyline" />

      <main className="vit-login__cartao">
        <div className="vit-login__marca">
          <Logo variant="horizontal" />
          <span className="vit-login__cliente">
            <Badge tone="brand">Diduccio</Badge>
          </span>
        </div>

        <h1 className="vit-login__titulo">Entrar</h1>
        <p className="vit-login__nota">Use seu e-mail ou CPF cadastrado.</p>

        <form onSubmit={submeter}>
          <Field label="E-mail ou CPF">
            <Input
              type="text"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>

          <Field label="Senha" error={erro}>
            <CampoSenha
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <div style={{ marginTop: "var(--space-7)" }}>
            <Button
              type="submit"
              variant="primary"
              loading={entrando}
              disabled={entrando}
              style={{ width: "100%" }}
            >
              {entrando ? "Entrando" : "Entrar"}
            </Button>
          </div>
        </form>

        <p className="vit-login__pe">ViT, da VITTA &copy; 2026</p>
      </main>
    </div>
  );
}
