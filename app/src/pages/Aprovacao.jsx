import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, CheckCircle, XCircle, Package, ShieldCheck, 
  Eraser, Info, User, MapPin, AlertCircle} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';

export default function Aprovacao() {
  const sigCanvas = useRef(null);
  // eslint-disable-next-line no-unused-vars
  const [idSolicitacao, setIdSolicitacao] = useState("C17007");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // --- ESTILOS (CSS EM JAVASCRIPT) ---
  const s = {
    container: {
      backgroundColor: 'var(--bg-app)',
      minHeight: '100vh',
      color: 'var(--surface-2)',
      fontFamily: 'sans-serif',
      padding: isMobile ? '60px 14px 24px' : '20px'
    },
    card: {
      backgroundColor: 'var(--fg-default)',
      borderRadius: '16px',
      padding: isMobile ? '18px' : '24px',
      marginBottom: '20px',
      border: '1px solid var(--border-strong)',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '30px',
      borderBottom: '1px solid var(--border-strong)',
      paddingBottom: '15px'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '20px',
      marginBottom: '20px'
    },
    label: {
      fontSize: '11px',
      color: 'var(--fg-muted)',
      textTransform: 'uppercase',
      fontWeight: 'bold',
      letterSpacing: '0.05em',
      display: 'block',
      marginBottom: '4px'
    },
    value: {
      fontSize: '15px',
      color: '#ffffff',
      fontWeight: '600'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      marginTop: '10px'
    },
    th: {
      textAlign: 'left',
      fontSize: '12px',
      color: 'var(--fg-muted)',
      padding: '12px',
      borderBottom: '1px solid var(--border-strong)'
    },
    td: {
      padding: '12px',
      fontSize: '14px',
      borderBottom: '1px solid var(--border-strong)'
    },
    btnApprove: {
      backgroundColor: '#D4432A',
      color: 'white',
      border: 'none',
      padding: '16px 24px',
      borderRadius: '12px',
      fontWeight: 'bold',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      width: '100%'
    },
    btnReject: {
      backgroundColor: 'transparent',
      color: '#B8203F',
      border: '1px solid #B8203F',
      padding: '16px 24px',
      borderRadius: '12px',
      fontWeight: 'bold',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      width: '100%'
    },
    signatureArea: {
      backgroundColor: 'white',
      borderRadius: '12px',
      height: '180px',
      marginTop: '10px',
      overflow: 'hidden'
    }
  };

  return (
    <div style={s.container}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        
        {/* Cabeçalho */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--fg-muted)', cursor: 'pointer' }}>
            <ArrowLeft size={18} /> <span>Voltar</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#EF7A5C', fontSize: '12px', fontWeight: 'bold' }}>
            <ShieldCheck size={16} /> PORTAL DE AUDITORIA
          </div>
        </div>

        <h1 style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: '900', marginBottom: '8px' }}>
          Aprovação <span style={{ color: '#E35A3A' }}>#{idSolicitacao}</span>
        </h1>
        <p style={{ color: 'var(--fg-muted)', marginBottom: '30px' }}>Validação de documento oficial de compras e suprimentos.</p>

        {/* Informações Principais */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Info size={18} color="#E35A3A" />
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>INFORMAÇÕES DA SOLICITAÇÃO</h2>
          </div>
          <div style={s.grid}>
            <div>
              <span style={s.label}>Solicitante</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={16} color="currentColor" />
                <span style={s.value}>LUCAS SAMPAIO</span>
              </div>
            </div>
            <div>
              <span style={s.label}>Departamento</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={16} color="currentColor" />
                <span style={s.value}>PORTARIA</span>
              </div>
            </div>
            <div>
              <span style={s.label}>Prioridade</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg-muted)' }}>
                <AlertCircle size={16} />
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>MÉDIA URGÊNCIA</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de Itens */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
            <Package size={18} color="#E35A3A" />
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>ITENS DA REQUISIÇÃO</h2>
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ ...s.table, minWidth: isMobile ? 460 : 0 }}>
            <thead>
              <tr>
                <th style={s.th}>PRODUTO</th>
                <th style={s.th}>CÓDIGO</th>
                <th style={s.th}>QTD</th>
                <th style={{ ...s.th, textAlign: 'right' }}>SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={s.td}>
                  <div style={s.value}>Pilhas AA p/ Controles</div>
                  <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>Unidade padrão</div>
                </td>
                <td style={{ ...s.td, color: 'var(--fg-muted)', fontFamily: 'monospace' }}>99283</td>
                <td style={{ ...s.td, fontWeight: 'bold', textAlign: 'center' }}>02</td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: '900' }}>R$ 25,00</td>
              </tr>
            </tbody>
          </table>
          </div>
          <div style={{ textAlign: 'right', marginTop: '20px' }}>
            <span style={s.label}>Valor Total</span>
            <span style={{ fontSize: '28px', fontWeight: '900', color: '#E35A3A' }}>R$ 25,00</span>
          </div>
        </div>

        {/* Zona de Assinatura e Ações */}
        <div style={s.grid}>
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: 0 }}>ASSINATURA DIGITAL</h3>
              <button onClick={() => sigCanvas.current.clear()} style={{ background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Eraser size={14} /> <span style={{ fontSize: '11px' }}>Limpar</span>
              </button>
            </div>
            <div style={s.signatureArea}>
              <SignatureCanvas 
                ref={sigCanvas} 
                penColor="black" 
                canvasProps={{ style: { width: '100%', height: '100%' } }} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', justifyContent: 'center' }}>
            <button style={s.btnApprove}>
              <CheckCircle size={20} /> CONFIRMAR E ASSINAR
            </button>
            <button style={s.btnReject}>
              <XCircle size={20} /> RECUSAR SOLICITAÇÃO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}