/* ============================================================
   SISTEMA EDANIOS BELCHIOR - THE PHYSIOTHERAPY DEPARTMENT
   VERSÃO: ULTIMATE FULL (SEM CORTES)
   ============================================================ */

// --- 1. IMPORTAÇÕES E CONFIGURAÇÃO FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, query, where, setDoc, getDoc, getDocs, arrayUnion, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// CONFIGURAÇÃO DO PROJETO (Suas chaves)
const firebaseConfig = {
    apiKey: "AIzaSyDfFLsCZAq4CA4bOjVKvwZzYsTVVAekl74",
    authDomain: "sistema-carlinhos-1.firebaseapp.com",
    projectId: "sistema-carlinhos-1",
    storageBucket: "sistema-carlinhos-1.firebasestorage.app",
    messagingSenderId: "170878331203",
    appId: "1:170878331203:web:31a3649680f226333927f6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- 2. VARIÁVEIS GLOBAIS E CONSTANTES ---

const EMAIL_ADMIN = "edanios@studio.com";
const SENHA_ALUNO_PADRAO_SUFIXO = "2026"; // Padrão: Nome + 2026
const MAX_ALUNOS = 8;
const diasSemana = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

// Cache Local de Dados (Para performance instantânea)
let listaClientes = [];
let dbPagamentos = {};
let dbGastos = [];
let dbAgenda = {};
let dbFrequenciaHistorico = []; // Cache para o histórico mensal
let alunoLogado = null;

// Filtros de Visualização
let filtroAtualClientes = 'todos';
let diaAtualAgenda = 'segunda';
let visualizacaoFrequencia = 'faltas'; // 'faltas' ou 'presencas'

// Listeners (para limpar memória ao sair e evitar duplicidade)
let unsubClientes = null;
let unsubPagamentos = null;
let unsubGastos = null;
let unsubAgenda = null;
let unsubTrocas = null;
let unsubFrequencia = null;

// Configuração de Data
const inputMes = document.getElementById('mesReferencia');
const hoje = new Date();
// Formata mês atual como YYYY-MM para os inputs type="month"
const mesStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

if (inputMes) {
    inputMes.value = mesStr;
    inputMes.addEventListener('change', () => carregarDadosDoMes());
}

// ======================================================
// 3. SISTEMA DE LOGIN HÍBRIDO (ADMIN & ALUNO)
// ======================================================

window.mudarAbaLogin = (tipo) => {
    // Gerencia a troca visual das abas na tela de login
    document.querySelectorAll('.login-tabs button').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(tipo === 'staff' ? 'tabStaff' : 'tabAluno');
    if (btn) btn.classList.add('active');

    document.getElementById('formStaff').style.display = tipo === 'staff' ? 'block' : 'none';
    document.getElementById('formAluno').style.display = tipo === 'aluno' ? 'block' : 'none';
    document.getElementById('msgErroLogin').innerText = "";
};

// LOGIN ADMIN (STAFF)
window.fazerLoginAdmin = () => {
    const email = document.getElementById('emailLogin').value;
    const pass = document.getElementById('senhaLogin').value;
    const msg = document.getElementById('msgErroLogin');

    msg.innerText = "AUTENTICANDO...";

    signInWithEmailAndPassword(auth, email, pass)
        .then(() => { msg.innerText = "ACESSO AUTORIZADO"; })
        .catch((error) => {
            console.error(error);
            msg.innerText = "ACESSO NEGADO: CREDENCIAIS INVÁLIDAS";
        });
};

// LOGIN ALUNO (PORTAL)
window.fazerLoginAluno = async () => {
    const nome = document.getElementById('nomeAlunoLogin').value.trim();
    const senha = document.getElementById('senhaAlunoLogin').value.trim();
    const msg = document.getElementById('msgErroLogin');

    msg.innerText = "CONSULTANDO ARQUIVOS...";

    try {
        // 1. Busca cadastro pelo nome (Busca manual para evitar Case Sensitive do Firestore)
        let cadastroEncontrado = null;
        const snapAll = await getDocs(collection(db, "clientes"));

        snapAll.forEach(d => {
            // Compara ignorando maiúsculas/minúsculas
            if (d.data().nome.toLowerCase() === nome.toLowerCase()) {
                cadastroEncontrado = { id: d.id, ...d.data() };
            }
        });

        if (cadastroEncontrado) {
            // 2. Validação de Senha (Padrão: PrimeiroNome + 2026)
            const primeiroNome = cadastroEncontrado.nome.split(' ')[0];
            const senhaPadrao = `${primeiroNome}${SENHA_ALUNO_PADRAO_SUFIXO}`;

            // Se o aluno já definiu senha personalizada usa ela, senão usa a padrão
            const senhaCorreta = cadastroEncontrado.senha || senhaPadrao;

            // Comparação simples (Case Insensitive para facilitar)
            if (senha.toLowerCase() === senhaCorreta.toLowerCase()) {
                alunoLogado = cadastroEncontrado;
                sessionStorage.setItem('alunoLogado', JSON.stringify(alunoLogado));
                iniciarModoAluno();
            } else {
                msg.innerText = `SENHA INCORRETA. (Dica: A padrão é ${primeiroNome}2026)`;
            }
        } else {
            msg.innerText = "ALUNO NÃO ENCONTRADO NO SISTEMA.";
        }
    } catch (e) {
        console.error(e);
        msg.innerText = "ERRO DE CONEXÃO COM O SERVIDOR.";
    }
};

window.fazerLogout = () => {
    signOut(auth);
    sessionStorage.removeItem('alunoLogado');
    location.reload();
};

// MONITORAMENTO DE SESSÃO (AUTH STATE)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // MODO STAFF LOGADO
        document.getElementById('telaLogin').style.display = 'none';
        document.getElementById('appConteudo').style.display = 'block';
        document.getElementById('appAluno').style.display = 'none';

        const isAdmin = user.email === EMAIL_ADMIN;

        // Controle de Permissões Visuais
        const btnFin = document.querySelector("button[onclick=\"mostrarTela('financeiro')\"]");
        const btnLogs = document.getElementById('btnLogsAdmin');

        if (btnFin) btnFin.style.display = isAdmin ? 'inline-block' : 'none';
        if (btnLogs) btnLogs.style.display = isAdmin ? 'inline-block' : 'none';

        iniciarListeners(user);
    } else {
        // Verifica se é sessão de ALUNO
        const sessaoAluno = sessionStorage.getItem('alunoLogado');
        if (sessaoAluno) {
            alunoLogado = JSON.parse(sessaoAluno);
            iniciarModoAluno();
        } else {
            // Ninguém logado
            document.getElementById('telaLogin').style.display = 'flex';
            document.getElementById('appConteudo').style.display = 'none';
            document.getElementById('appAluno').style.display = 'none';
        }
    }
});

// ======================================================
// 4. MODO ALUNO (PORTAL INTERATIVO COMPLETO)
// ======================================================

function iniciarModoAluno() {
    document.getElementById('telaLogin').style.display = 'none';
    document.getElementById('appConteudo').style.display = 'none';
    document.getElementById('appAluno').style.display = 'block';

    const primeiroNome = alunoLogado.nome.split(' ')[0].toUpperCase();
    document.getElementById('saudacaoAluno').innerText = `OLÁ, ${primeiroNome}.`;

    carregarAgendaDoAlunoHoje();
    carregarMeusHorarios();
    carregarMeuProntuario();
    carregarMeusPagamentos(); // Recurso 17: Histórico Financeiro
}

// 4.1 Verifica aula do dia e status
async function carregarAgendaDoAlunoHoje() {
    const diasMap = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diaHoje = diasMap[new Date().getDay()];

    const displayHorario = document.getElementById('horarioAulaAluno');
    const badge = document.getElementById('statusBadge');
    const botoes = document.getElementById('acoesAluno');
    const motivoRecusa = document.getElementById('motivoRecusaAluno');

    displayHorario.innerText = "BUSCANDO ARQUIVOS...";
    motivoRecusa.style.display = 'none';

    if (diaHoje === 'sabado' || diaHoje === 'domingo') {
        displayHorario.innerText = "FIM DE SEMANA";
        badge.innerText = "SEM ATIVIDADE";
        botoes.style.display = 'none';
        return;
    }

    const docRef = doc(db, "agenda", diaHoje);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
        const agendaDia = snap.data();
        let horarioEncontrado = null;
        let statusAtual = null;
        let motivo = null;

        // Procura o aluno em todos os horários do dia
        Object.keys(agendaDia).forEach(hora => {
            if (Array.isArray(agendaDia[hora])) {
                const item = agendaDia[hora].find(a => a.id === alunoLogado.id);
                if (item) {
                    horarioEncontrado = hora;
                    statusAtual = item.presenca;
                    motivo = item.motivoRecusa;
                }
            }
        });

        if (horarioEncontrado) {
            displayHorario.innerText = horarioEncontrado;
            alunoLogado.horarioHoje = horarioEncontrado;
            alunoLogado.diaHoje = diaHoje;

            // Lógica Visual de Status
            if (statusAtual === 'presente') {
                badge.innerText = "✅ PRESENÇA CONFIRMADA";
                badge.className = "status-badge sucesso";
                botoes.style.display = 'none';
            } else if (statusAtual === 'recusado') {
                badge.innerText = "❌ PRESENÇA RECUSADA";
                badge.className = "status-badge erro";
                motivoRecusa.innerText = `Motivo registrado: "${motivo || 'Não informado'}"`;
                motivoRecusa.style.display = 'block';
                botoes.style.display = 'flex'; // Permite reenviar
            } else if (statusAtual && statusAtual.startsWith('solicitado_')) {
                badge.innerText = "⏳ AGUARDANDO APROVAÇÃO";
                badge.className = "status-badge pendente";
                botoes.style.display = 'none';
            } else {
                badge.innerText = "AÇÃO NECESSÁRIA";
                badge.className = "status-badge neutro";
                botoes.style.display = 'flex';
            }
        } else {
            displayHorario.innerText = "SEM AGENDAMENTO";
            badge.innerText = "DIA LIVRE";
            botoes.style.display = 'none';
        }
    } else {
        displayHorario.innerText = "SEM AGENDAMENTO";
        botoes.style.display = 'none';
    }
}

// 4.2 Envia Solicitação de Presença/Falta (Etapa 1 da Validação)
window.solicitarStatusAluno = async (tipo) => {
    if (!confirm("Confirmar o envio desta atualização de status?")) return;

    // Atualização otimista (UI)
    mostrarNotificacao("ENVIANDO SOLICITAÇÃO...");

    const ref = doc(db, "agenda", alunoLogado.diaHoje);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        let dados = snap.data();
        const hora = alunoLogado.horarioHoje;
        const index = dados[hora].findIndex(a => a.id === alunoLogado.id);

        if (index !== -1) {
            dados[hora][index].presenca = tipo;
            delete dados[hora][index].motivoRecusa;

            await updateDoc(ref, dados);
            registrarLog(`Aluno ${alunoLogado.nome} solicitou status: ${tipo}`);
            carregarAgendaDoAlunoHoje(); // Atualiza tela
            mostrarNotificacao("SOLICITAÇÃO ENVIADA AO DEPARTAMENTO.");
        }
    }
};

// 4.3 Histórico Financeiro do Aluno (Recurso Novo)
window.carregarMeusPagamentos = async () => {
    const div = document.getElementById('listaMeusPagamentos');
    if (!div) return;
    div.innerHTML = 'Buscando registros...';

    // Busca apenas pagamentos deste aluno
    const q = query(collection(db, "pagamentos"), where("clienteId", "==", alunoLogado.id));
    const snap = await getDocs(q);

    div.innerHTML = '';

    if (snap.empty) {
        div.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">Nenhum pagamento registrado.</p>';
        return;
    }

    const pagamentos = [];
    snap.forEach(d => pagamentos.push(d.data()));

    // Ordena por mês (decrescente)
    pagamentos.sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));

    pagamentos.forEach(pg => {
        let statusHtml = '';
        if (pg.status === 'pago') {
            statusHtml = `<button onclick="baixarReciboAluno('${alunoLogado.nome}', '${pg.valor}', '${pg.mesReferencia}')" style="background:var(--success); color:black; padding:5px 10px; font-size:0.8rem; width:auto; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">BAIXAR RECIBO</button>`;
        } else {
            statusHtml = `<span style="color:var(--imprevisto); font-weight:bold;">PENDENTE</span>`;
        }

        div.innerHTML += `
            <div style="background:var(--bg-input); padding:15px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>MÊS: ${pg.mesReferencia}</strong><br>
                    <small>Valor: R$ ${pg.valor || '0,00'}</small>
                </div>
                <div>${statusHtml}</div>
            </div>
        `;
    });
};

window.baixarReciboAluno = (nome, valor, mes) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, 100] });

    // CABEÇALHO OFICIAL DO RECIBO
    doc.setFontSize(12); doc.text("EDANIOS BELCHIOR", 10, 15);
    doc.setFontSize(10); doc.text("Fisioterapia & Pilates", 10, 20);

    doc.text("--------------------------------", 10, 25);
    doc.text("RECIBO DE PAGAMENTO", 10, 32);
    doc.text(`ALUNO: ${nome.toUpperCase()}`, 10, 40);
    doc.text(`VALOR: R$ ${parseFloat(valor).toFixed(2)}`, 10, 48);
    doc.text(`REFERÊNCIA: ${mes}`, 10, 56);
    doc.text("--------------------------------", 10, 64);

    doc.save(`Recibo_${mes}.pdf`);
};

// 4.4 Lista horários do aluno para troca
window.carregarMeusHorarios = async () => {
    const selectOrigem = document.getElementById('selectTrocaOrigem');
    if (!selectOrigem) return;
    selectOrigem.innerHTML = '';

    const snap = await getDocs(collection(db, "agenda"));
    let temHorario = false;

    snap.forEach(docDia => {
        const dia = docDia.id;
        const agenda = docDia.data();
        Object.keys(agenda).forEach(hora => {
            if (Array.isArray(agenda[hora])) {
                const item = agenda[hora].find(a => a.id === alunoLogado.id);
                if (item) {
                    temHorario = true;
                    // Preenche select
                    selectOrigem.innerHTML += `<option value="${dia}|${hora}">${dia.toUpperCase()} - ${hora}</option>`;
                }
            }
        });
    });

    if (!temHorario) selectOrigem.innerHTML = "<option>Nenhum horário fixo encontrado</option>";
};

// 4.5 Envia Solicitação de Troca de Horário
window.solicitarTrocaHorario = async () => {
    const origem = document.getElementById('selectTrocaOrigem').value;
    const diaDestino = document.getElementById('selectTrocaDestinoDia').value;
    const horaDestino = document.getElementById('selectTrocaDestinoHora').value;

    if (!origem || origem.includes('Nenhum')) return alert("Você não possui horários para trocar.");

    const [diaOrigem, horaOrigem] = origem.split('|');

    if (!confirm(`Solicitar transferência de ${diaOrigem.toUpperCase()} para ${diaDestino.toUpperCase()}?`)) return;

    await addDoc(collection(db, "solicitacoes_troca"), {
        alunoId: alunoLogado.id,
        nome: alunoLogado.nome,
        diaOrigem,
        horaOrigem,
        diaDestino,
        horaDestino,
        status: 'pendente',
        dataSolicitacao: new Date().toLocaleString()
    });

    registrarLog(`Troca solicitada por ${alunoLogado.nome}`);
    mostrarNotificacao("PEDIDO DE TROCA ENVIADO AO ADMIN!");
};

// 4.6 Visualiza Prontuário
window.carregarMeuProntuario = async () => {
    const lista = document.getElementById('meuProntuarioLista');
    if (lista) lista.innerHTML = 'Carregando histórico...';

    const snap = await getDoc(doc(db, "prontuarios", alunoLogado.id));
    if (lista) lista.innerHTML = '';

    if (snap.exists() && snap.data().historico) {
        snap.data().historico.slice().reverse().forEach(h => {
            if (lista) lista.innerHTML += `
                <div class="evolucao-item">
                    <span class="evolucao-data">${h.data}</span>
                    <p>${h.texto}</p>
                </div>`;
        });
    } else {
        if (lista) lista.innerHTML = '<p style="padding:15px; color:var(--text-muted);">Nenhum registro clínico encontrado.</p>';
    }
};

// ======================================================
// 5. MODO STAFF (GESTÃO ADMINISTRATIVA)
// ======================================================

// --- LOGS (AUDIT) ---
function registrarLog(acao) {
    let usuarioIdentificado = "Sistema";
    if (auth.currentUser) usuarioIdentificado = auth.currentUser.email;
    else if (alunoLogado) usuarioIdentificado = `Aluno: ${alunoLogado.nome}`;

    addDoc(collection(db, "logs"), {
        data: new Date().toLocaleString('pt-BR'),
        usuario: usuarioIdentificado,
        acao: acao
    }).catch(e => console.error("Log error", e));
}

// --- LISTENERS ADMIN ---
function iniciarListeners(user) {
    // 1. Clientes (Recarrega tudo se mudar)
    unsubClientes = onSnapshot(collection(db, "clientes"), (snap) => {
        listaClientes = [];
        snap.forEach(d => listaClientes.push({ id: d.id, ...d.data() }));
        renderizarClientes();
        filtrarSelectProntuario();
        if (user.email === EMAIL_ADMIN) renderizarFinanceiro();
    });

    // 2. Agenda Semanal
    unsubAgenda = onSnapshot(collection(db, "agenda"), (snap) => {
        dbAgenda = { segunda: {}, terca: {}, quarta: {}, quinta: {}, sexta: {} };
        snap.forEach(d => dbAgenda[d.id] = d.data());
        renderizarAgenda();
        calcularFrequenciaPendencias(); // Atualiza painel de validação
    });

    // 3. Solicitações de Troca
    if (user.email === EMAIL_ADMIN) {
        unsubTrocas = onSnapshot(collection(db, "solicitacoes_troca"), (snap) => {
            const trocas = [];
            snap.forEach(d => trocas.push({ id: d.id, ...d.data() }));
            renderizarTrocasPendentes(trocas);
        });
    }

    carregarDadosDoMes(user);
}

function carregarDadosDoMes(user = auth.currentUser) {
    const mes = inputMes.value;
    const finInput = document.getElementById('mesFinanceiro');
    if (finInput) finInput.value = mes;

    // Limpa ouvintes antigos ao mudar de mês
    if (unsubPagamentos) unsubPagamentos();
    if (unsubGastos) unsubGastos();
    if (unsubFrequencia) unsubFrequencia();

    if (user && user.email === EMAIL_ADMIN) {
        // 4. Financeiro: Pagamentos do Mês
        unsubPagamentos = onSnapshot(query(collection(db, "pagamentos"), where("mesReferencia", "==", mes)), (snap) => {
            dbPagamentos = {};
            snap.forEach(d => dbPagamentos[d.data().clienteId] = d.data());
            renderizarClientes(); // RE-RENDERIZA PARA ATUALIZAR CONTADORES
            renderizarFinanceiro();
        });

        // 5. Financeiro: Gastos do Mês
        unsubGastos = onSnapshot(query(collection(db, "gastos"), where("mesReferencia", "==", mes)), (snap) => {
            dbGastos = [];
            snap.forEach(d => dbGastos.push({ id: d.id, ...d.data() }));
            renderizarFinanceiro();
        });

        // 6. Histórico de Frequência Mensal (NOVO)
        unsubFrequencia = onSnapshot(query(collection(db, "historico_frequencia"), where("mesReferencia", "==", mes)), (snap) => {
            dbFrequenciaHistorico = [];
            snap.forEach(d => dbFrequenciaHistorico.push({ id: d.id, ...d.data() }));
            renderizarTabelaHistorico();
        });

    } else {
        dbPagamentos = {}; dbGastos = []; renderizarClientes();
    }
}

// --- FREQUÊNCIA: PAINEL DE VALIDAÇÃO (SEMANAL) ---
function calcularFrequenciaPendencias() {
    const listaSolicitacoes = document.getElementById('listaSolicitacoes');
    listaSolicitacoes.innerHTML = '';
    let temSolicitacao = false;

    diasSemana.forEach(dia => {
        const dados = dbAgenda[dia] || {};
        Object.keys(dados).forEach(hora => {
            if (Array.isArray(dados[hora])) {
                dados[hora].forEach(a => {
                    const status = a.presenca;
                    // Validação: Exibir TODAS as solicitações pendentes
                    if (status && status.startsWith('solicitado_')) {
                        temSolicitacao = true;
                        const tipo = status.replace('solicitado_', '').toUpperCase();
                        let corBadge = tipo === 'PRESENTE' ? 'var(--success)' : 'var(--danger)';

                        listaSolicitacoes.innerHTML += `
                            <div style="background:var(--bg-input); padding:15px; display:flex; justify-content:space-between; align-items:center; border-left:4px solid ${corBadge}; margin-bottom:10px;">
                                <div>
                                    <strong>${a.nome}</strong> <br>
                                    <small style="color:var(--text-muted)">${dia.toUpperCase()} - ${hora}</small><br>
                                    <span style="color:${corBadge}; font-weight:bold;">PEDIDO: ${tipo}</span>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <button onclick="validarFrequencia('${dia}', '${hora}', '${a.id}', '${tipo.toLowerCase()}', '${a.nome}')" style="padding:10px; background:var(--success); color:black; border:none; cursor:pointer;">✔</button>
                                    <button onclick="recusarFrequencia('${dia}', '${hora}', '${a.id}')" style="padding:10px; background:var(--danger); color:white; border:none; cursor:pointer;">✖</button>
                                </div>
                            </div>`;
                    }
                });
            }
        });
    });

    if (!temSolicitacao) listaSolicitacoes.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Nenhuma solicitação pendente.</p>';
}

// --- FREQUÊNCIA: TABELA DE HISTÓRICO (MENSAL) ---
window.alternarVisaoFrequencia = (tipo) => {
    visualizacaoFrequencia = tipo;
    // Feedback visual nos botões
    document.getElementById('btnVerFaltas').style.background = tipo === 'faltas' ? 'var(--text-primary)' : 'transparent';
    document.getElementById('btnVerFaltas').style.color = tipo === 'faltas' ? 'var(--bg-body)' : 'var(--text-secondary)';
    document.getElementById('btnVerPresencas').style.background = tipo === 'presencas' ? 'var(--text-primary)' : 'transparent';
    document.getElementById('btnVerPresencas').style.color = tipo === 'presencas' ? 'var(--bg-body)' : 'var(--text-secondary)';

    renderizarTabelaHistorico();
};

function renderizarTabelaHistorico() {
    const tbody = document.getElementById('tabelaFrequencia').querySelector('tbody');
    tbody.innerHTML = '';

    const dadosFiltrados = dbFrequenciaHistorico.filter(item => {
        if (visualizacaoFrequencia === 'faltas') return item.status === 'falta' || item.status === 'imprevisto';
        if (visualizacaoFrequencia === 'presencas') return item.status === 'presente';
        return true;
    });

    dadosFiltrados.sort((a, b) => b.dataCompleta.localeCompare(a.dataCompleta));

    dadosFiltrados.forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td>${new Date(item.dataCompleta).toLocaleDateString('pt-BR')}</td>
                <td><strong>${item.nome}</strong></td>
                <td>${item.status.toUpperCase()}</td>
                <td>
                    <button onclick="removerHistoricoFrequencia('${item.id}')" style="color:var(--danger); border:none; background:transparent; font-size:1.2rem; cursor:pointer;" title="Apagar Registro">🗑️</button>
                </td>
            </tr>`;
    });
}

// ADMIN: Aceitar Presença (Grava no Histórico Mensal + Atualiza Agenda Semanal)
window.validarFrequencia = async (dia, hora, alunoId, statusFinal, nomeAluno) => {
    const ref = doc(db, "agenda", dia);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        let dados = snap.data();
        const index = dados[hora].findIndex(a => a.id === alunoId);
        if (index !== -1) {
            dados[hora][index].presenca = statusFinal;

            // 1. Atualiza visual da agenda (Semana Atual)
            await updateDoc(ref, dados);

            // 2. Grava histórico permanente (Mês Selecionado)
            await addDoc(collection(db, "historico_frequencia"), {
                alunoId,
                nome: nomeAluno,
                status: statusFinal,
                diaSemana: dia,
                mesReferencia: inputMes.value,
                dataCompleta: new Date().toISOString()
            });

            registrarLog(`Admin validou ${statusFinal} para ${nomeAluno}`);
            mostrarNotificacao("VALIDADO E ARQUIVADO!");
        }
    }
};

// ADMIN: Recusar Presença
window.recusarFrequencia = async (dia, hora, alunoId) => {
    const motivo = prompt("Motivo da recusa:");
    if (!motivo) return;

    const ref = doc(db, "agenda", dia);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        let dados = snap.data();
        const index = dados[hora].findIndex(a => a.id === alunoId);

        dados[hora][index].presenca = 'recusado';
        dados[hora][index].motivoRecusa = motivo; // Salva o motivo

        await updateDoc(ref, dados);
        registrarLog(`Admin recusou presença: ${motivo}`);
        mostrarNotificacao("RECUSADO.");
    }
};

// ADMIN: Remover item do histórico (Botão Lixeira)
window.removerHistoricoFrequencia = async (id) => {
    if (!confirm("Apagar este registro permanentemente?")) return;
    await deleteDoc(doc(db, "historico_frequencia", id));
    mostrarNotificacao("REGISTRO APAGADO.");
};

// --- GESTÃO DE TROCAS DE HORÁRIO ---

function renderizarTrocasPendentes(listaTrocas) {
    const container = document.getElementById('listaTrocas');
    container.innerHTML = '';

    if (listaTrocas.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Nenhuma troca solicitada.</p>';
        return;
    }

    listaTrocas.forEach(t => {
        container.innerHTML += `
            <div style="background:var(--bg-input); padding:15px; border-left:4px solid var(--imprevisto); margin-bottom:10px;">
                <div style="margin-bottom:10px;"><strong>${t.nome}</strong> solicita troca:</div>
                <div style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:10px;">
                    De: ${t.diaOrigem.toUpperCase()} (${t.horaOrigem}) <br> 
                    Para: <strong>${t.diaDestino.toUpperCase()} (${t.horaDestino})</strong>
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="aprovarTroca('${t.id}')" style="background:var(--success); color:black; padding:8px; font-size:0.8rem; width:auto;">APROVAR</button>
                    <button onclick="rejeitarTroca('${t.id}')" style="background:var(--danger); color:white; padding:8px; font-size:0.8rem; width:auto;">NEGAR</button>
                </div>
            </div>
        `;
    });
}

// LÓGICA DE APROVAÇÃO COM REMOÇÃO AUTOMÁTICA
window.aprovarTroca = async (trocaId) => {
    // 1. Pega dados da solicitação
    const docTroca = await getDoc(doc(db, "solicitacoes_troca", trocaId));
    if (!docTroca.exists()) return;
    const troca = docTroca.data();

    // 2. Remove do dia antigo (Origem)
    const refOrigem = doc(db, "agenda", troca.diaOrigem);
    const snapOrigem = await getDoc(refOrigem);
    let dadosOrigem = snapOrigem.data();
    const idxOrigem = dadosOrigem[troca.horaOrigem].findIndex(a => a.id === troca.alunoId);

    // REMOÇÃO GARANTIDA
    if (idxOrigem > -1) dadosOrigem[troca.horaOrigem].splice(idxOrigem, 1);

    // 3. Adiciona no dia novo (Destino)
    const refDestino = doc(db, "agenda", troca.diaDestino);
    const snapDestino = await getDoc(refDestino);
    let dadosDestino = snapDestino.exists() ? snapDestino.data() : {};

    if (!dadosDestino[troca.horaDestino]) dadosDestino[troca.horaDestino] = [];

    if (dadosDestino[troca.horaDestino].length >= MAX_ALUNOS) return alert("Horário de destino lotado! Não é possível realizar a troca.");

    dadosDestino[troca.horaDestino].push({ id: troca.alunoId, nome: troca.nome, presenca: null });

    // 4. Executa updates atômicos
    await updateDoc(refOrigem, dadosOrigem); // Atualiza origem (vazia)
    if (snapDestino.exists()) await updateDoc(refDestino, dadosDestino);
    else await setDoc(refDestino, dadosDestino); // Atualiza destino (preenchido)

    // 5. Apaga solicitação
    await deleteDoc(doc(db, "solicitacoes_troca", trocaId));

    registrarLog(`Troca aprovada: ${troca.nome} mudou para ${troca.diaDestino}`);
    mostrarNotificacao("TROCA REALIZADA COM SUCESSO!");
};

window.rejeitarTroca = async (trocaId) => {
    if (!confirm("Rejeitar esta solicitação de troca?")) return;
    await deleteDoc(doc(db, "solicitacoes_troca", trocaId));
    mostrarNotificacao("TROCA REJEITADA.");
};

// --- MÓDULO DE CLIENTES E FINANCEIRO (ADMIN) ---

window.filtrarClientes = (tipo) => {
    filtroAtualClientes = tipo;
    document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('active'));
    let idBtn = tipo === 'todos' ? 'btnFiltroTodos' : (tipo === 'pendente' ? 'btnFiltroPendente' : 'btnFiltroPago');
    document.getElementById(idBtn).classList.add('active');
    renderizarClientes();
};

window.renderizarClientes = () => {
    const tbody = document.getElementById('tabelaClientes').querySelector('tbody');
    tbody.innerHTML = '';
    const termo = document.getElementById('inputBusca').value.toLowerCase();

    let total = 0, pendentes = 0, receita = 0;

    listaClientes.sort((a, b) => a.nome.localeCompare(b.nome));

    listaClientes.forEach(c => {
        const pg = dbPagamentos[c.id] || { status: 'pendente', forma: '', valor: '' };

        // CONTADORES DO DASHBOARD
        total++;
        if (pg.status === 'pendente') pendentes++;
        if (pg.status === 'pago') receita += Number(pg.valor || 0);

        if (termo && !c.nome.toLowerCase().includes(termo)) return;
        if (filtroAtualClientes !== 'todos' && pg.status !== filtroAtualClientes) return;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${c.nome.toUpperCase()}</strong><br><small style="color:var(--text-secondary)">${c.telefone}</small></td>
            <td>
                <select onchange="atualizarPg('${c.id}', 'status', this.value)" style="width:100%; font-weight:bold; ${pg.status === 'pago' ? 'color:var(--success); border-color:var(--success);' : 'color:var(--imprevisto);'}">
                    <option value="pendente" ${pg.status === 'pendente' ? 'selected' : ''}>PENDENTE</option>
                    <option value="pago" ${pg.status === 'pago' ? 'selected' : ''}>PAGO</option>
                </select>
            </td>
            <td>
                <select onchange="atualizarPg('${c.id}', 'forma', this.value)">
                    <option value="" disabled ${!pg.forma ? 'selected' : ''}>...</option>
                    <option value="pix" ${pg.forma === 'pix' ? 'selected' : ''}>PIX</option>
                    <option value="dinheiro" ${pg.forma === 'dinheiro' ? 'selected' : ''}>DINHEIRO</option>
                    <option value="cartao" ${pg.forma === 'cartao' ? 'selected' : ''}>CARTÃO</option>
                </select>
            </td>
            <td><input type="number" value="${pg.valor}" placeholder="0.00" onchange="atualizarPg('${c.id}', 'valor', this.value)"></td>
            <td>
                <button onclick="editarCliente('${c.id}')" class="btn-tool" title="Editar">✏️</button>
                <button onclick="confirmarAcao('EXCLUIR?', 'Apagar tudo?', ()=>removerCliente('${c.id}', '${c.nome}'))" class="btn-tool danger" title="Excluir">🗑️</button>
                ${(pg.status === 'pago') ? `<button onclick="baixarPdfEAbrirWpp('${c.id}', '${c.nome}', '${c.telefone}', '${pg.valor}')" class="btn-tool" style="color:var(--success); font-weight:bold;">PDF</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Atualiza contadores do dashboard
    if (document.getElementById('statTotal')) {
        document.getElementById('statTotal').innerText = total;
        document.getElementById('statPendentes').innerText = pendentes;
        document.getElementById('statRecebido').innerText = `R$ ${receita.toFixed(0)}`;
    }
};

window.baixarPdfEAbrirWpp = (id, nome, tel, valor) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, 100] });

    // CABEÇALHO OFICIAL DO RECIBO
    doc.setFontSize(12); doc.text("EDANIOS BELCHIOR", 10, 15);
    doc.setFontSize(10); doc.text("Fisioterapia & Pilates", 10, 20);

    doc.text("--------------------------------", 10, 25);
    doc.text("RECIBO DE PAGAMENTO", 10, 32);
    doc.text(`ALUNO: ${nome.toUpperCase()}`, 10, 40);
    doc.text(`VALOR: R$ ${parseFloat(valor).toFixed(2)}`, 10, 48);
    doc.text(`REFERÊNCIA: ${inputMes.value}`, 10, 56);
    doc.text("--------------------------------", 10, 64);

    doc.save(`Recibo_${nome}.pdf`);

    mostrarNotificacao("PDF GERADO!");
    const zap = tel.replace(/\D/g, '');
    setTimeout(() => window.open(`https://wa.me/55${zap}?text=Olá! Segue seu recibo digital.`, '_blank'), 1000);
    registrarLog(`Gerou recibo PDF para ${nome}`);
};

window.atualizarPg = async (cid, campo, valor) => {
    const mes = inputMes.value;
    const ref = doc(db, "pagamentos", `${mes}_${cid}`);
    const snap = await getDoc(ref);
    if (snap.exists()) await updateDoc(ref, { [campo]: valor });
    else await setDoc(ref, { clienteId: cid, mesReferencia: mes, [campo]: valor, status: 'pendente' });
};

// ATUALIZADO: SALVAR NOVOS CAMPOS DO CLIENTE (Anamnese Básica)
window.salvarOuAtualizarCliente = async () => {
    const id = document.getElementById('idClienteEditando').value;
    const nome = document.getElementById('nomeCliente').value.trim();
    const tel = document.getElementById('telefoneCliente').value.trim();
    const nasc = document.getElementById('nascCliente').value;
    const prof = document.getElementById('profissaoCliente').value;
    const queixa = document.getElementById('queixaCliente').value;
    const diag = document.getElementById('diagnosticoCliente').value;

    if (!nome) return mostrarNotificacao("NOME OBRIGATÓRIO", "erro");

    const dados = { nome, telefone: tel, nascimento: nasc, profissao: prof, queixa, diagnostico: diag };

    try {
        if (id) {
            await updateDoc(doc(db, "clientes", id), dados);
            mostrarNotificacao("ATUALIZADO!");
        } else {
            await addDoc(collection(db, "clientes"), dados);
            mostrarNotificacao("CADASTRADO!");
        }
        window.cancelarEdicao();
    } catch (e) { mostrarNotificacao("ERRO AO SALVAR", "erro"); }
};

window.editarCliente = (id) => {
    const c = listaClientes.find(x => x.id === id);
    if (c) {
        document.getElementById('idClienteEditando').value = c.id;
        document.getElementById('nomeCliente').value = c.nome;
        document.getElementById('telefoneCliente').value = c.telefone;
        // Preenche novos campos
        document.getElementById('nascCliente').value = c.nascimento || '';
        document.getElementById('profissaoCliente').value = c.profissao || '';
        document.getElementById('queixaCliente').value = c.queixa || '';
        document.getElementById('diagnosticoCliente').value = c.diagnostico || '';

        document.getElementById('btnSalvarCliente').innerText = "💾 SALVAR";
        document.getElementById('btnCancelarEdicao').style.display = "inline-block";
    }
};

window.cancelarEdicao = () => {
    document.getElementById('idClienteEditando').value = "";
    document.getElementById('nomeCliente').value = "";
    document.getElementById('telefoneCliente').value = "";
    document.getElementById('nascCliente').value = "";
    document.getElementById('profissaoCliente').value = "";
    document.getElementById('queixaCliente').value = "";
    document.getElementById('diagnosticoCliente').value = "";
    document.getElementById('btnSalvarCliente').innerText = "+ REGISTRAR";
    document.getElementById('btnCancelarEdicao').style.display = "none";
};

window.removerCliente = async (id, nome) => {
    try {
        await deleteDoc(doc(db, "clientes", id));
        // Limpa pagamentos do mês
        const q = query(collection(db, "pagamentos"), where("clienteId", "==", id));
        const snap = await getDocs(q);
        snap.forEach(d => deleteDoc(d.ref));
        await deleteDoc(doc(db, "prontuarios", id));

        registrarLog(`Excluiu aluno: ${nome}`);
        mostrarNotificacao("REMOVIDO!");
    } catch (e) { mostrarNotificacao("ERRO AO EXCLUIR", "erro"); }
};

// --- MÓDULO AGENDA (ADMIN) ---
window.mudarDia = (dia) => {
    diaAtualAgenda = dia;
    document.querySelectorAll('.btn-dia').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${dia}`).classList.add('active');
    renderizarAgenda();
};

window.renderizarAgenda = () => {
    const container = document.getElementById('containerAgenda');
    container.innerHTML = '';
    const busca = document.getElementById('buscaAgenda').value.toLowerCase();
    const filtro = document.getElementById('filtroOcupacao').value;
    const horarios = ["07:00 - 08:00", "08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "13:00 - 14:00", "14:00 - 15:00", "15:00 - 16:00", "16:00 - 17:00", "17:00 - 18:00", "18:00 - 19:00", "19:00 - 20:00"];
    const dadosDia = dbAgenda[diaAtualAgenda] || {};

    horarios.forEach(hora => {
        const alunos = dadosDia[hora] || [];
        if (busca && !alunos.some(a => a.nome.toLowerCase().includes(busca))) return;
        if (filtro === 'ocupados' && alunos.length === 0) return;
        if (filtro === 'livres' && alunos.length >= MAX_ALUNOS) return;

        let htmlAlunos = '';
        alunos.forEach((a, idx) => {
            let statusClass = '';
            // Define cor do status
            if (a.presenca === 'presente') statusClass = 'presente';
            else if (a.presenca === 'falta') statusClass = 'falta';
            else if (a.presenca === 'imprevisto') statusClass = 'imprevisto';
            if (a.presenca && a.presenca.startsWith('solicitado_')) statusClass = 'imprevisto';

            htmlAlunos += `
                <div class="aluno-item ${statusClass}">
                    <span>${a.nome} ${a.presenca && a.presenca.startsWith('solicitado') ? '⏳' : ''}</span>
                    <div>
                        <button onclick="confirmarAcao('REMOVER?', '', ()=>rmAgenda('${hora}', ${idx}))" style="color:var(--danger)">🗑️</button>
                    </div>
                </div>`;
        });

        let opts = `<option value="">+ ADICIONAR</option>`;
        listaClientes.forEach(c => opts += `<option value="${c.id}|${c.nome}">${c.nome}</option>`);

        container.appendChild(document.createRange().createContextualFragment(`
            <div class="horario-card">
                <div class="horario-titulo"><span>${hora}</span><span>${alunos.length}/${MAX_ALUNOS}</span></div>
                <div style="padding:15px;">
                    ${htmlAlunos}
                    ${alunos.length < MAX_ALUNOS ? `
                        <div style="display:flex; gap:10px; margin-top:15px;">
                            <select id="sel-${hora}" style="flex:2">${opts}</select>
                            <button onclick="addAgenda('${hora}')" style="width:auto">OK</button>
                        </div>` : `<div style="color:var(--danger); text-align:center; margin-top:10px;">LOTADO</div>`}
                </div>
            </div>`));
    });
};

window.addAgenda = async (hora) => {
    const val = document.getElementById(`sel-${hora}`).value;
    if (!val) return;
    const [id, nome] = val.split('|');
    const ref = doc(db, "agenda", diaAtualAgenda);
    const snap = await getDoc(ref);
    let dados = snap.exists() ? snap.data() : {};
    if (!dados[hora]) dados[hora] = [];
    dados[hora].push({ id, nome, presenca: null });
    await setDoc(ref, dados);
    registrarLog(`Agendou ${nome} às ${hora}`);
};

window.rmAgenda = async (hora, idx) => {
    const ref = doc(db, "agenda", diaAtualAgenda);
    const snap = await getDoc(ref);
    let dados = snap.data();
    dados[hora].splice(idx, 1);
    await updateDoc(ref, dados);
    registrarLog(`Removeu aluno da agenda`);
};

window.clonarAgenda = async () => {
    confirmarAcao("CLONAR SEMANA?", "Copiar Segunda para o resto da semana?", async () => {
        const segRef = doc(db, "agenda", "segunda");
        const snap = await getDoc(segRef);
        if (!snap.exists()) return mostrarNotificacao("SEGUNDA VAZIA", "erro");

        const dados = snap.data();
        Object.keys(dados).forEach(k => {
            if (Array.isArray(dados[k])) dados[k] = dados[k].map(a => ({ id: a.id, nome: a.nome, presenca: null }));
        });

        const promises = ['terca', 'quarta', 'quinta', 'sexta'].map(dia => setDoc(doc(db, "agenda", dia), dados));
        await Promise.all(promises);
        registrarLog("Clonou agenda semanal");
        mostrarNotificacao("AGENDA CLONADA!");
    });
};

// --- PRONTUÁRIOS (ADMIN - ATUALIZADO COM HEADER CLÍNICO) ---
window.filtrarSelectProntuario = () => {
    const termo = document.getElementById('buscaProntuario').value.toLowerCase();
    const sel = document.getElementById('selectProntuarioAluno');
    sel.innerHTML = '<option value="">-- SELECIONE --</option>';
    const filtrados = listaClientes.filter(c => c.nome.toLowerCase().includes(termo)).sort((a, b) => a.nome.localeCompare(b.nome));
    filtrados.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`);
    if (filtrados.length === 1 && termo.length > 1) { sel.value = filtrados[0].id; carregarProntuarioSelecionado(); }
}

// Função auxiliar para calcular idade
function calcularIdade(dataNasc) {
    if (!dataNasc) return "N/A";
    const hoje = new Date();
    const nasc = new Date(dataNasc);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade + " anos";
}

window.carregarProntuarioSelecionado = async () => {
    const id = document.getElementById('selectProntuarioAluno').value;
    const area = document.getElementById('areaProntuario');
    const header = document.getElementById('dadosPacienteHeader');

    if (!id) { area.style.display = 'none'; return; }
    area.style.display = 'block';

    // Preenche Header do Paciente com Dados Clínicos
    const aluno = listaClientes.find(c => c.id === id);
    if (aluno) {
        header.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; padding:15px;">
                <div><strong>NOME:</strong> ${aluno.nome.toUpperCase()}</div>
                <div><strong>IDADE:</strong> ${calcularIdade(aluno.nascimento)}</div>
                <div><strong>PROFISSÃO:</strong> ${aluno.profissao || '-'}</div>
                <div><strong>QUEIXA:</strong> ${aluno.queixa || '-'}</div>
                <div style="grid-column: span 2; border-top: 1px dashed #666; padding-top: 5px; margin-top:5px;">
                    <strong>DIAGNÓSTICO:</strong> ${aluno.diagnostico || 'Não informado'}
                </div>
            </div>
        `;
    }

    const lista = document.getElementById('listaEvolucao');
    lista.innerHTML = 'Carregando...';

    const snap = await getDoc(doc(db, "prontuarios", id));
    lista.innerHTML = '';

    if (snap.exists() && snap.data().historico) {
        const historico = snap.data().historico;
        historico.slice().reverse().forEach((h, indexInverso) => {
            const indexReal = historico.length - 1 - indexInverso;
            lista.innerHTML += `
                <div class="evolucao-item" style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1;"><span class="evolucao-data">${h.data}</span><p>${h.texto}</p></div>
                    <button onclick="removerEvolucao('${id}', ${indexReal})" style="background:transparent; color:var(--danger); border:none; width:auto; font-size:1.2rem; cursor:pointer;">🗑️</button>
                </div>`;
        });
    } else lista.innerHTML = '<p style="padding:15px; text-align:center;">Nenhum registro ainda.</p>';
};

window.adicionarEvolucao = async () => {
    const id = document.getElementById('selectProntuarioAluno').value;
    const texto = document.getElementById('textoNovaEvolucao').value;
    if (!texto) return;
    const aluno = listaClientes.find(c => c.id === id);
    const novo = { data: new Date().toLocaleDateString('pt-BR'), texto: texto };
    await setDoc(doc(db, "prontuarios", id), { historico: arrayUnion(novo) }, { merge: true });
    document.getElementById('textoNovaEvolucao').value = '';
    registrarLog(`Adicionou evolução: ${aluno.nome}`);
    carregarProntuarioSelecionado();
    mostrarNotificacao("EVOLUÇÃO SALVA!");
};

window.removerEvolucao = async (id, index) => {
    if (!confirm("Apagar permanentemente?")) return;
    const ref = doc(db, "prontuarios", id);
    const snap = await getDoc(ref);
    let historico = snap.data().historico;
    historico.splice(index, 1);
    await updateDoc(ref, { historico: historico });
    registrarLog(`Removeu evolução`);
    carregarProntuarioSelecionado();
};

window.gerarProntuarioPDF = async () => {
    const id = document.getElementById('selectProntuarioAluno').value;
    if (!id) return;
    const aluno = listaClientes.find(c => c.id === id);
    const snap = await getDoc(doc(db, "prontuarios", id));

    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF();
    docPdf.setFontSize(16); docPdf.text(`PRONTUÁRIO: ${aluno.nome.toUpperCase()}`, 10, 20);

    // Adiciona Cabeçalho no PDF
    docPdf.setFontSize(10);
    docPdf.text(`IDADE: ${calcularIdade(aluno.nascimento)} | PROFISSÃO: ${aluno.profissao || '-'}`, 10, 30);
    docPdf.text(`QUEIXA: ${aluno.queixa || '-'}`, 10, 36);
    docPdf.text(`DIAGNÓSTICO: ${aluno.diagnostico || '-'}`, 10, 42);

    docPdf.line(10, 45, 200, 45);

    docPdf.setFontSize(12);
    let y = 55;
    if (snap.exists() && snap.data().historico) {
        snap.data().historico.forEach(h => {
            if (y > 280) { docPdf.addPage(); y = 20; }
            docPdf.text(`${h.data}:`, 10, y);
            const split = docPdf.splitTextToSize(h.texto, 180);
            docPdf.text(split, 15, y + 7);
            y += 15 + (split.length * 5);
        });
    }
    docPdf.save(`Prontuario_${aluno.nome}.pdf`);
};

// --- FINANCEIRO ---
window.adicionarGasto = async () => {
    const desc = document.getElementById('descGasto').value;
    const val = document.getElementById('valorGasto').value;
    const cat = document.getElementById('catGasto').value;
    await addDoc(collection(db, "gastos"), { desc, valor: val, categoria: cat, mesReferencia: inputMes.value });
    mostrarNotificacao("GASTO OK");
};

window.virarMes = () => mostrarNotificacao("MUDE A DATA NO SELETOR PARA VIRAR");

window.exportarCSV = () => {
    let csv = "data:text/csv;charset=utf-8,TIPO,NOME,CAT,VALOR\n";
    Object.values(dbPagamentos).forEach(p => {
        const c = listaClientes.find(cli => cli.id === p.clienteId);
        if (c && p.status === 'pago') csv += `ENTRADA,${c.nome},MENSALIDADE,${p.valor}\n`;
    });
    dbGastos.forEach(g => csv += `SAIDA,${g.desc},${g.categoria},${g.valor}\n`);
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `fin_${inputMes.value}.csv`;
    link.click();
};

window.renderizarFinanceiro = () => {
    if (auth.currentUser && auth.currentUser.email !== EMAIL_ADMIN) return;
    const tbody = document.getElementById('tabelaGastos').querySelector('tbody');
    tbody.innerHTML = '';
    let despesas = 0, receita = 0, pix = 0, din = 0, car = 0;

    Object.values(dbPagamentos).forEach(p => {
        if (listaClientes.some(c => c.id === p.clienteId) && p.status === 'pago') {
            const v = Number(p.valor || 0);
            receita += v;
            if (p.forma === 'pix') pix += v; else if (p.forma === 'dinheiro') din += v; else car += v;
        }
    });

    dbGastos.forEach(g => {
        despesas += Number(g.valor);
        tbody.innerHTML += `<tr><td>${g.desc.toUpperCase()}</td><td>${g.categoria}</td><td style="color:var(--danger)">R$ ${g.valor}</td><td><button onclick="rmGasto('${g.id}')">🗑️</button></td></tr>`;
    });

    document.getElementById('dashReceita').innerText = `R$ ${receita.toFixed(2)}`;
    document.getElementById('dashDespesas').innerText = `R$ ${despesas.toFixed(2)}`;
    document.getElementById('dashLucro').innerText = `R$ ${(receita - despesas).toFixed(2)}`;
    document.getElementById('totalPix').innerText = `R$ ${pix.toFixed(2)}`;
    document.getElementById('totalDinheiro').innerText = `R$ ${din.toFixed(2)}`;
    document.getElementById('totalCartao').innerText = `R$ ${car.toFixed(2)}`;
};

window.rmGasto = async (id) => await deleteDoc(doc(db, "gastos", id));

// --- UX & UTILITÁRIOS ---
window.mudarCorTema = (corPrincipal, corEscura) => {
    document.documentElement.style.setProperty('--text-primary', corPrincipal);
};

window.mostrarNotificacao = (msg, tipo = 'sucesso') => {
    const antigo = document.querySelector('.snake-toast');
    if (antigo) antigo.remove();
    const toast = document.createElement('div');
    toast.className = `snake-toast ${tipo === 'erro' ? 'error' : ''}`;
    toast.innerHTML = `<span class="material-symbols-outlined">${tipo === 'erro' ? 'skull' : 'check_circle'}</span> <span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
};

window.confirmarAcao = (titulo, texto, callback) => {
    const modal = document.getElementById('modalConfirm');
    document.getElementById('modalTitulo').innerText = titulo;
    document.getElementById('modalTexto').innerText = texto;
    modal.style.display = 'flex';
    const btnSim = document.getElementById('btnModalSim');
    const btnNao = document.getElementById('btnModalNao');
    const novoSim = btnSim.cloneNode(true);
    const novoNao = btnNao.cloneNode(true);
    btnSim.parentNode.replaceChild(novoSim, btnSim);
    btnNao.parentNode.replaceChild(novoNao, btnNao);
    novoSim.onclick = () => { modal.style.display = 'none'; callback(); };
    novoNao.onclick = () => { modal.style.display = 'none'; };
};

window.mostrarTela = (telaId) => {
    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    document.getElementById(telaId).classList.add('ativa');
    document.querySelectorAll('.main-nav button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${telaId}'`)) btn.classList.add('active');
    });
};

window.abrirLogs = async () => {
    if (auth.currentUser.email !== EMAIL_ADMIN) return mostrarNotificacao("ACESSO NEGADO", "erro");
    const container = document.getElementById('listaLogs');
    container.innerHTML = "Carregando...";
    document.getElementById('modalLogs').style.display = 'flex';
    const q = query(collection(db, "logs"), orderBy("data", "desc"), limit(50));
    const snap = await getDocs(q);
    container.innerHTML = "";
    snap.forEach(doc => {
        const d = doc.data();
        container.innerHTML += `<div style="border-bottom:1px solid #333; padding:8px; font-size:0.85rem;"><strong>${d.usuario.split('@')[0]}</strong> (${d.data})<br>${d.acao}</div>`;
    });
};