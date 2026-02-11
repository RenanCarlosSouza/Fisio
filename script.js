/* ==========================================================================
   SISTEMA DE GESTÃO INTEGRADA - EDANIOS BELCHIOR
   VERSÃO: 2.1 (CHANGELOG INTELIGENTE POR PERFIL)
   DATA: 2026
   ========================================================================== */

// ==========================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÃO FIREBASE
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, query, where, setDoc, getDoc, getDocs, arrayUnion, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Configurações do Projeto
const firebaseConfig = {
    apiKey: "AIzaSyDfFLsCZAq4CA4bOjVKvwZzYsTVVAekl74",
    authDomain: "sistema-carlinhos-1.firebaseapp.com",
    projectId: "sistema-carlinhos-1",
    storageBucket: "sistema-carlinhos-1.firebasestorage.app",
    messagingSenderId: "170878331203",
    appId: "1:170878331203:web:31a3649680f226333927f6"
};

// Inicialização dos serviços
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ==========================================================================
// 2. VARIÁVEIS GLOBAIS E CACHE DE DADOS
// ==========================================================================

const EMAIL_ADMIN = "edanios@studio.com";
const SENHA_ALUNO_PADRAO_SUFIXO = "2026";
const MAX_ALUNOS = 12;
const VERSAO_ATUAL = "2.1";

// Cache Local
let listaClientes = [];
let listaServicos = [];
let dbPagamentos = {};
let dbGastos = [];
let dbAgenda = {};
let alunoLogado = null;

// Variáveis do Changelog
let activeChangelogList = []; // Lista filtrada de novidades
let currentSlide = 0;

// Estado da Interface
let filtroAtualClientes = 'todos';
let diaAtualAgenda = 'segunda';

// Listeners
let unsubClientes = null;
let unsubServicos = null;
let unsubPagamentos = null;
let unsubGastos = null;
let unsubAgenda = null;

// Configuração Inicial de Data
const inputMes = document.getElementById('mesReferencia');
const hoje = new Date();
const mesStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

if (inputMes) {
    inputMes.value = mesStr;
    inputMes.addEventListener('change', () => { carregarDadosDoMes(); });
}

// ==========================================================================
// 3. SISTEMA DE AUTENTICAÇÃO E PERMISSÕES
// ==========================================================================

window.mudarAbaLogin = (tipo) => {
    document.querySelectorAll('.login-tabs button').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(tipo === 'staff' ? 'tabStaff' : 'tabAluno');
    if (btn) btn.classList.add('active');

    document.getElementById('formStaff').style.display = tipo === 'staff' ? 'block' : 'none';
    document.getElementById('formAluno').style.display = tipo === 'aluno' ? 'block' : 'none';
    document.getElementById('msgErroLogin').innerText = "";
};

window.fazerLoginAdmin = () => {
    const email = document.getElementById('emailLogin').value;
    const pass = document.getElementById('senhaLogin').value;
    const msg = document.getElementById('msgErroLogin');

    msg.innerText = "VERIFICANDO CREDENCIAIS...";

    signInWithEmailAndPassword(auth, email, pass)
        .then(() => { msg.innerText = "ACESSO PERMITIDO. ENTRANDO..."; })
        .catch((error) => {
            console.error("Erro auth:", error);
            msg.innerText = "ACESSO NEGADO: Email ou senha inválidos.";
        });
};

window.fazerLoginAluno = async () => {
    const nome = document.getElementById('nomeAlunoLogin').value.trim();
    const senha = document.getElementById('senhaAlunoLogin').value.trim();
    const msg = document.getElementById('msgErroLogin');

    msg.innerText = "BUSCANDO CADASTRO...";

    try {
        let cadastroEncontrado = null;
        const snapAll = await getDocs(collection(db, "clientes"));

        snapAll.forEach(d => {
            if (d.data().nome.toLowerCase() === nome.toLowerCase()) {
                cadastroEncontrado = { id: d.id, ...d.data() };
            }
        });

        if (cadastroEncontrado) {
            const primeiroNome = cadastroEncontrado.nome.split(' ')[0];
            const senhaPadrao = `${primeiroNome}${SENHA_ALUNO_PADRAO_SUFIXO}`;
            const senhaCorreta = cadastroEncontrado.senha || senhaPadrao;

            if (senha.toLowerCase() === senhaCorreta.toLowerCase()) {
                alunoLogado = cadastroEncontrado;
                sessionStorage.setItem('alunoLogado', JSON.stringify(alunoLogado));
                iniciarModoAluno();
            } else {
                msg.innerText = `SENHA INVÁLIDA. Tente: ${primeiroNome}2026`;
            }
        } else {
            msg.innerText = "ALUNO NÃO ENCONTRADO.";
        }
    } catch (e) {
        console.error(e);
        msg.innerText = "ERRO DE CONEXÃO.";
    }
};

window.fazerLogout = () => {
    signOut(auth);
    sessionStorage.removeItem('alunoLogado');
    location.reload();
};

// --- MONITOR DE SESSÃO E PERMISSÕES ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // USUÁRIO LOGADO (Admin ou Assistente)
        document.getElementById('telaLogin').style.display = 'none';
        document.getElementById('appConteudo').style.display = 'block';
        document.getElementById('appAluno').style.display = 'none';

        const isAdmin = user.email === EMAIL_ADMIN;

        // Botões e Elementos da Interface
        const btnFin = document.querySelector("button[onclick=\"mostrarTela('financeiro')\"]");
        const btnLogs = document.getElementById('btnLogsAdmin');
        const statsCards = document.querySelector('.stats-alunos');
        const fab = document.querySelector('.fab-container');

        // CONTROLE DO BOTÃO FAB FINANCEIRO
        const fabFin = document.getElementById('btnFabFinanceiro');
        if (fabFin) {
            fabFin.style.display = isAdmin ? 'flex' : 'none';
        }

        // Controle de visibilidade de elementos sensíveis
        if (btnFin) btnFin.style.display = isAdmin ? 'inline-block' : 'none';
        if (btnLogs) btnLogs.style.display = isAdmin ? 'inline-block' : 'none';
        if (fab) fab.style.display = 'flex'; // FAB container visível para ambos

        if (statsCards) {
            statsCards.style.display = isAdmin ? 'grid' : 'none';
        }

        if (!isAdmin) {
            // Assistente vai direto para clientes
            mostrarTela('clientes');
        }

        iniciarListeners(user);

        // Verifica Changelog passando o nível de acesso
        checkChangelog(isAdmin);

    } else {
        // ALUNO OU VISITANTE
        const sessaoAluno = sessionStorage.getItem('alunoLogado');
        if (sessaoAluno) {
            alunoLogado = JSON.parse(sessaoAluno);
            iniciarModoAluno();
        } else {
            document.getElementById('telaLogin').style.display = 'flex';
            document.getElementById('appConteudo').style.display = 'none';
            document.getElementById('appAluno').style.display = 'none';
        }
    }
});

// ==========================================================================
// 4. PORTAL DO ALUNO (SIMPLIFICADO)
// ==========================================================================

function iniciarModoAluno() {
    document.getElementById('telaLogin').style.display = 'none';
    document.getElementById('appConteudo').style.display = 'none';
    document.getElementById('appAluno').style.display = 'block';

    const primeiroNome = alunoLogado.nome.split(' ')[0].toUpperCase();
    document.getElementById('saudacaoAluno').innerText = `OLÁ, ${primeiroNome}.`;

    carregarAgendaDoAlunoHoje();
    carregarMeuProntuario();
    carregarMeusPagamentos();
}

async function carregarAgendaDoAlunoHoje() {
    const diasMap = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diaHoje = diasMap[new Date().getDay()];
    const displayHorario = document.getElementById('horarioAulaAluno');
    const badge = document.getElementById('statusBadge');
    const motivoRecusa = document.getElementById('motivoRecusaAluno');

    if (displayHorario) displayHorario.innerText = "...";
    if (motivoRecusa) motivoRecusa.style.display = 'none';

    if (diaHoje === 'sabado' || diaHoje === 'domingo') {
        if (displayHorario) displayHorario.innerText = "FIM DE SEMANA";
        if (badge) { badge.innerText = "SEM AULA"; badge.className = "status-badge neutro"; }
        return;
    }

    const docRef = doc(db, "agenda", diaHoje);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
        const agendaDia = snap.data();
        let horarioEncontrado = null;
        let statusAtual = null;
        let motivo = null;

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
            if (displayHorario) displayHorario.innerText = horarioEncontrado;
            alunoLogado.horarioHoje = horarioEncontrado;
            alunoLogado.diaHoje = diaHoje;

            if (statusAtual === 'presente') {
                badge.innerText = "✅ CONFIRMADO"; badge.className = "status-badge sucesso";
            } else if (statusAtual === 'recusado') {
                badge.innerText = "❌ RECUSADO"; badge.className = "status-badge erro";
                motivoRecusa.innerText = `Motivo: "${motivo || '-'}"`; motivoRecusa.style.display = 'block';
            } else if (statusAtual && statusAtual.startsWith('solicitado_')) {
                badge.innerText = "⏳ AGUARDANDO"; badge.className = "status-badge pendente";
            } else {
                badge.innerText = "AGENDADO"; badge.className = "status-badge neutro";
            }
        } else {
            displayHorario.innerText = "SEM AULA"; badge.innerText = "-";
        }
    } else {
        displayHorario.innerText = "SEM AULA";
    }
}

window.carregarMeusPagamentos = async () => {
    const div = document.getElementById('listaMeusPagamentos');
    if (!div) return;
    div.innerHTML = 'Buscando...';
    const q = query(collection(db, "pagamentos"), where("clienteId", "==", alunoLogado.id));
    const snap = await getDocs(q);
    div.innerHTML = '';
    if (snap.empty) { div.innerHTML = '<p style="color:#888;">Sem pagamentos.</p>'; return; }
    const pags = [];
    snap.forEach(d => pags.push(d.data()));
    pags.sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));
    pags.forEach(pg => {
        let btn = pg.status === 'pago' ?
            `<button onclick="baixarPdfEAbrirWpp('${alunoLogado.id}', '${alunoLogado.nome}', '', '${pg.valor}', '${pg.mesReferencia}')" style="background:var(--success); color:black; padding:5px; font-size:0.8rem;">RECIBO</button>` :
            `<span style="color:var(--imprevisto);">PENDENTE</span>`;
        div.innerHTML += `
            <div style="background:var(--bg-input); padding:10px; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center;">
                <div><strong>MÊS: ${pg.mesReferencia}</strong><br><small>R$ ${pg.valor}</small></div>
                <div>${btn}</div>
            </div>`;
    });
};

window.carregarMeuProntuario = async () => {
    const lista = document.getElementById('meuProntuarioLista');
    if (lista) lista.innerHTML = 'Carregando...';
    const snap = await getDoc(doc(db, "prontuarios", alunoLogado.id));
    if (lista) lista.innerHTML = '';
    if (snap.exists() && snap.data().historico) {
        snap.data().historico.slice().reverse().forEach(h => {
            lista.innerHTML += `<div class="evolucao-item"><span class="evolucao-data">${h.data}</span><p>${h.texto}</p></div>`;
        });
    } else if (lista) { lista.innerHTML = '<p style="color:#888;">Sem registros.</p>'; }
};

// ======================================================
// 5. MÓDULO ADMINISTRATIVO - LISTENERS & SEGURANÇA
// ======================================================

function registrarLog(acao) {
    let user = auth.currentUser ? auth.currentUser.email : (alunoLogado ? alunoLogado.nome : "Sistema");
    addDoc(collection(db, "logs"), { data: new Date().toLocaleString(), usuario: user, acao }).catch(console.error);
}

// --- LISTENERS (ATUALIZAÇÃO EM TEMPO REAL) ---
function iniciarListeners(user) {
    console.log("Iniciando sistema para:", user.email);

    // 1. Serviços (Popula selects)
    unsubServicos = onSnapshot(collection(db, "servicos"), (snap) => {
        listaServicos = [];
        snap.forEach(d => listaServicos.push({ id: d.id, ...d.data() }));
        renderizarServicos();
    });

    // 2. Clientes
    unsubClientes = onSnapshot(collection(db, "clientes"), (snap) => {
        listaClientes = [];
        snap.forEach(d => listaClientes.push({ id: d.id, ...d.data() }));
        renderizarClientes();
        filtrarSelectProntuario();
        if (user.email === EMAIL_ADMIN) renderizarFinanceiro();
    });

    // 3. Agenda (Sem cálculo de pendências)
    unsubAgenda = onSnapshot(collection(db, "agenda"), (snap) => {
        dbAgenda = { segunda: {}, terca: {}, quarta: {}, quinta: {}, sexta: {} };
        snap.forEach(d => dbAgenda[d.id] = d.data());
        renderizarAgenda();
        const viewHoje = document.getElementById('view-hoje');
        if (viewHoje && viewHoje.classList.contains('active')) renderizarAgendaDoDia();
    });

    carregarDadosDoMes(user);
}

function carregarDadosDoMes(user = auth.currentUser) {
    const mes = inputMes.value;
    const finInput = document.getElementById('mesFinanceiro');
    if (finInput) finInput.value = mes;

    if (unsubPagamentos) unsubPagamentos();
    if (unsubGastos) unsubGastos();

    if (user && user.email === EMAIL_ADMIN) {
        // ADMIN: Carrega TUDO (incluindo status agendado de gastos)
        unsubPagamentos = onSnapshot(query(collection(db, "pagamentos"), where("mesReferencia", "==", mes)), (snap) => {
            dbPagamentos = {};
            snap.forEach(d => dbPagamentos[d.data().clienteId] = d.data());
            renderizarClientes();
            renderizarFinanceiro();
        });
        unsubGastos = onSnapshot(query(collection(db, "gastos"), where("mesReferencia", "==", mes)), (snap) => {
            dbGastos = [];
            snap.forEach(d => dbGastos.push({ id: d.id, ...d.data() }));
            renderizarFinanceiro();
        });
    } else {
        // ASSISTENTE: Apenas status de pagamentos para a tabela de alunos (PENDENTE/PAGO)
        // Não carrega valores totais nem gastos
        unsubPagamentos = onSnapshot(query(collection(db, "pagamentos"), where("mesReferencia", "==", mes)), (snap) => {
            dbPagamentos = {};
            snap.forEach(d => dbPagamentos[d.data().clienteId] = d.data());
            renderizarClientes();
        });
        dbGastos = [];

        // Esconde paineis financeiros
        const dash = document.querySelector('.dashboard-financeiro');
        if (dash) dash.style.display = 'none';
        const fluxo = document.querySelector('.fluxo-detalhado-wrapper');
        if (fluxo) fluxo.style.display = 'none';
    }
}

// ==========================================================================
// 6. GESTÃO DE SERVIÇOS
// ==========================================================================

window.adicionarServico = async () => {
    try {
        const nomeInput = document.getElementById('nomeNovoServico');
        const valorInput = document.getElementById('valorNovoServico');

        if (!nomeInput || !valorInput) return console.error("UI Error");

        const nome = nomeInput.value.trim();
        const valor = valorInput.value;

        if (!nome || !valor) return mostrarNotificacao("Preencha tudo!", "erro");

        await addDoc(collection(db, "servicos"), {
            nome: nome.toUpperCase(),
            valor: parseFloat(valor)
        });

        nomeInput.value = '';
        valorInput.value = '';
        mostrarNotificacao("Serviço Salvo!");
    } catch (e) {
        console.error("Erro serviço:", e);
        if (e.code === 'permission-denied') alert("ERRO: Apenas o Admin pode criar serviços.");
        else mostrarNotificacao("Erro ao salvar.", "erro");
    }
};

window.removerServico = async (id) => {
    if (auth.currentUser.email !== EMAIL_ADMIN) return alert("Apenas o Admin pode remover serviços.");

    if (confirm("Remover este serviço?")) {
        try {
            await deleteDoc(doc(db, "servicos", id));
            mostrarNotificacao("Removido.");
        } catch (e) {
            alert("Erro: " + e.message);
        }
    }
};

function renderizarServicos() {
    const lista = document.getElementById('listaServicosCadastrados');
    const isAdmin = auth.currentUser && auth.currentUser.email === EMAIL_ADMIN;

    if (lista) {
        lista.innerHTML = '';
        if (listaServicos.length === 0) lista.innerHTML = '<span style="color:#777; font-size:0.8rem;">Vazio.</span>';
        else {
            listaServicos.forEach(s => {
                const btnDelete = isAdmin ? `<button onclick="removerServico('${s.id}')" style="background:none; color:red; border:none; cursor:pointer;">&times;</button>` : '';
                lista.innerHTML += `
                    <div style="background:var(--bg-input); padding:5px 10px; border-radius:4px; display:flex; gap:10px; border:1px solid #ddd; align-items:center;">
                        <span style="font-weight:bold;">${s.nome}</span>
                        <span style="color:var(--success);">R$ ${parseFloat(s.valor).toFixed(2)}</span>
                        ${btnDelete}
                    </div>`;
            });
        }
    }

    const select = document.getElementById('selectServicoCadastro');
    if (select) {
        const valAtual = select.value;
        select.innerHTML = '<option value="">-- SELECIONE --</option>';
        listaServicos.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.setAttribute('data-valor', s.valor);
            opt.setAttribute('data-nome', s.nome);
            opt.innerText = `${s.nome} (R$ ${parseFloat(s.valor).toFixed(2)})`;
            select.appendChild(opt);
        });
        if (valAtual) select.value = valAtual;
    }
}

// ==========================================================================
// 7. GESTÃO DE ALUNOS (CADASTRO)
// ==========================================================================

window.salvarOuAtualizarCliente = async () => {
    const id = document.getElementById('idClienteEditando').value;
    const nome = document.getElementById('nomeCliente').value.trim();
    const tel = document.getElementById('telefoneCliente').value.trim();
    const selectServ = document.getElementById('selectServicoCadastro');

    const nasc = document.getElementById('nascCliente').value;
    const prof = document.getElementById('profissaoCliente').value;
    const queixa = document.getElementById('queixaCliente').value;
    const diag = document.getElementById('diagnosticoCliente').value;

    if (!nome) return mostrarNotificacao("Nome obrigatório!", "erro");
    if (!selectServ.value && !id) return mostrarNotificacao("Selecione um Serviço!", "erro");

    let dados = {
        nome, telefone: tel,
        nascimento: nasc, profissao: prof, queixa, diagnostico: diag
    };

    if (selectServ.value) {
        const option = selectServ.options[selectServ.selectedIndex];
        dados.servicoId = selectServ.value;
        dados.nomeServico = option.getAttribute('data-nome');
        dados.valorContrato = parseFloat(option.getAttribute('data-valor'));
    }

    try {
        if (id) {
            await updateDoc(doc(db, "clientes", id), dados);
            if (selectServ.value) atualizarValorPagamentoAtual(id, dados.valorContrato);
            mostrarNotificacao("Aluno Atualizado!");
        } else {
            const docRef = await addDoc(collection(db, "clientes"), dados);
            await setDoc(doc(db, "pagamentos", `${inputMes.value}_${docRef.id}`), {
                clienteId: docRef.id,
                mesReferencia: inputMes.value,
                valor: dados.valorContrato,
                status: 'pendente',
                forma: ''
            });
            mostrarNotificacao("Aluno Cadastrado!");
        }
        window.cancelarEdicao();
    } catch (e) {
        mostrarNotificacao("Erro ao salvar.", "erro");
        console.error(e);
    }
};

async function atualizarValorPagamentoAtual(clienteId, novoValor) {
    const ref = doc(db, "pagamentos", `${inputMes.value}_${clienteId}`);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().status === 'pendente') {
        await updateDoc(ref, { valor: novoValor });
    }
}

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
    const isAdmin = auth.currentUser && auth.currentUser.email === EMAIL_ADMIN;

    let total = 0, pendentes = 0, receita = 0;

    listaClientes.sort((a, b) => a.nome.localeCompare(b.nome));

    listaClientes.forEach(c => {
        const pg = dbPagamentos[c.id] || { status: 'pendente', forma: '', valor: c.valorContrato || 0 };

        total++;
        if (pg.status === 'pendente') pendentes++;
        if (pg.status === 'pago') receita += Number(pg.valor || 0);

        if (termo && !c.nome.toLowerCase().includes(termo)) return;
        if (filtroAtualClientes !== 'todos' && pg.status !== filtroAtualClientes) return;

        const tr = document.createElement('tr');
        let displayServico = c.nomeServico || "-";

        tr.innerHTML = `
            <td><strong>${c.nome.toUpperCase()}</strong><br><small style="color:#777;">${c.telefone}</small></td>
            <td>
                <select onchange="atualizarPg('${c.id}', 'status', this.value)" style="width:100%; font-weight:bold; ${pg.status === 'pago' ? 'color:var(--success);' : 'color:var(--imprevisto);'}">
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
            <td>
                <span style="font-weight:bold; color:var(--primary); font-size:0.9rem;">${displayServico}</span>
            </td>
            <td>
                <button onclick="editarCliente('${c.id}')" class="btn-tool" title="Editar">✏️</button>
                <button onclick="confirmarAcao('EXCLUIR?', 'Apagar?', ()=>removerCliente('${c.id}', '${c.nome}'))" class="btn-tool danger" title="Excluir">🗑️</button>
                ${(pg.status === 'pago') ? `<button onclick="baixarPdfEAbrirWpp('${c.id}', '${c.nome}', '${c.telefone}', '${pg.valor}', '${inputMes.value}')" class="btn-tool" style="color:var(--success);">PDF</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (isAdmin && document.getElementById('statTotal')) {
        document.getElementById('statTotal').innerText = total;
        document.getElementById('statPendentes').innerText = pendentes;
        document.getElementById('statRecebido').innerText = `R$ ${receita.toFixed(0)}`;
    } else if (document.getElementById('statRecebido')) {
        document.getElementById('statRecebido').innerText = "---";
        document.getElementById('statTotal').innerText = "---";
        document.getElementById('statPendentes').innerText = "---";
    }
};

window.atualizarPg = async (cid, campo, valor) => {
    const mes = inputMes.value;
    const ref = doc(db, "pagamentos", `${mes}_${cid}`);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        const cliente = listaClientes.find(c => c.id === cid);
        await setDoc(ref, {
            clienteId: cid,
            mesReferencia: mes,
            [campo]: valor,
            valor: cliente.valorContrato || 0,
            status: 'pendente'
        });
    } else {
        await updateDoc(ref, { [campo]: valor });
    }
};

window.editarCliente = (id) => {
    const c = listaClientes.find(x => x.id === id);
    if (c) {
        document.getElementById('idClienteEditando').value = c.id;
        document.getElementById('nomeCliente').value = c.nome;
        document.getElementById('telefoneCliente').value = c.telefone;
        if (c.servicoId) document.getElementById('selectServicoCadastro').value = c.servicoId;
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
    document.getElementById('selectServicoCadastro').value = "";
    document.getElementById('nascCliente').value = "";
    document.getElementById('profissaoCliente').value = "";
    document.getElementById('queixaCliente').value = "";
    document.getElementById('diagnosticoCliente').value = "";
    document.getElementById('btnSalvarCliente').innerText = "+ REGISTRAR FICHA";
    document.getElementById('btnCancelarEdicao').style.display = "none";
};

window.removerCliente = async (id, nome) => {
    if (auth.currentUser.email !== EMAIL_ADMIN) return alert("Apenas Admin pode excluir alunos.");

    try {
        await deleteDoc(doc(db, "clientes", id));
        const q = query(collection(db, "pagamentos"), where("clienteId", "==", id));
        const snap = await getDocs(q);
        snap.forEach(d => deleteDoc(d.ref));
        await deleteDoc(doc(db, "prontuarios", id));
        registrarLog(`Excluiu: ${nome}`);
        mostrarNotificacao("REMOVIDO!");
    } catch (e) { mostrarNotificacao("ERRO!", "erro"); }
};

// ==========================================================================
// 8. RELATÓRIOS PDF (ATUALIZADO V2.0 - DRE e TABELA DE FORMAS)
// ==========================================================================

window.gerarRelatorioFinanceiroPDF = () => {
    if (!auth.currentUser || auth.currentUser.email !== EMAIL_ADMIN) return alert("Acesso Negado: Apenas Admin.");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const mes = inputMes.value;
    const marginX = 14;

    doc.setFontSize(18);
    doc.setTextColor(27, 59, 111);
    doc.text("EDANIOS BELCHIOR - RELATÓRIO MENSAL", 105, 15, null, null, "center");

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Referência: ${mes}`, 105, 22, null, null, "center");

    const dadosReceita = [];
    let totalReceita = 0;

    // Contadores para o resumo dentro do PDF
    let sumPix = 0, sumDin = 0, sumCard = 0;

    Object.values(dbPagamentos).forEach(pg => {
        if (pg.status === 'pago') {
            const cliente = listaClientes.find(c => c.id === pg.clienteId);
            if (cliente) {
                const nome = cliente.nome;
                const servico = cliente.nomeServico || "-";
                const val = parseFloat(pg.valor || 0);
                totalReceita += val;

                // Soma por tipo
                if (pg.forma === 'pix') sumPix += val;
                else if (pg.forma === 'dinheiro') sumDin += val;
                else if (pg.forma === 'cartao') sumCard += val;

                let formaPagamento = (pg.forma || "N/A").toUpperCase();

                dadosReceita.push([
                    pg.mesReferencia,
                    nome,
                    servico,
                    formaPagamento,
                    `R$ ${val.toFixed(2)}`
                ]);
            }
        }
    });

    // Tabela Principal
    doc.autoTable({
        startY: 30,
        head: [['Mês', 'Aluno', 'Serviço', 'Forma', 'Valor']],
        body: dadosReceita,
        theme: 'striped',
        headStyles: { fillColor: [27, 59, 111] },
        styles: { fontSize: 10 },
        margin: { top: 30, bottom: 20 }
    });

    // Novo: Resumo por Forma de Pagamento no PDF
    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Resumo: PIX: R$ ${sumPix.toFixed(2)} | Dinheiro: R$ ${sumDin.toFixed(2)} | Cartão: R$ ${sumCard.toFixed(2)}`, marginX, finalY);

    finalY += 10;

    const dadosDespesa = [];
    let totalDespesa = 0;
    dbGastos.forEach(g => {
        // Apenas despesas PAGAS entram no relatório mensal de caixa
        if (g.status !== 'agendado') {
            const val = parseFloat(g.valor || 0);
            totalDespesa += val;
            dadosDespesa.push([g.categoria.toUpperCase(), g.desc, `R$ ${val.toFixed(2)}`]);
        }
    });

    if (finalY > 240) { doc.addPage(); finalY = 20; }

    doc.setFontSize(12);
    doc.setTextColor(198, 40, 40);
    doc.text("DESPESAS REALIZADAS", marginX, finalY - 5);

    doc.autoTable({
        startY: finalY,
        head: [['Categoria', 'Descrição', 'Valor']],
        body: dadosDespesa,
        theme: 'striped',
        headStyles: { fillColor: [198, 40, 40] },
        styles: { fontSize: 10 },
        margin: { bottom: 20 }
    });

    finalY = doc.lastAutoTable.finalY + 20;
    const espacoNecessario = 40;

    if (finalY + espacoNecessario > 285) {
        doc.addPage();
        finalY = 20;
    }

    const lucro = totalReceita - totalDespesa;

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`TOTAL RECEITA (ATIVOS): R$ ${totalReceita.toFixed(2)}`, marginX, finalY);
    doc.text(`TOTAL DESPESA: R$ ${totalDespesa.toFixed(2)}`, marginX, finalY + 7);

    if (lucro >= 0) {
        doc.setTextColor(46, 125, 50);
    } else {
        doc.setTextColor(198, 40, 40);
    }

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`LUCRO LÍQUIDO: R$ ${lucro.toFixed(2)}`, marginX, finalY + 16);

    doc.save(`Relatorio_${mes}.pdf`);
};

// NOVA FUNÇÃO: RELATÓRIO ANUAL (DRE)
window.gerarRelatorioAnualPDF = async () => {
    if (!confirm("Gerar DRE Anual? Isso pode levar alguns segundos.")) return;
    mostrarNotificacao("Gerando DRE...", "sucesso");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const anoAtual = new Date().getFullYear();

    // Busca TODOS os pagamentos e gastos do ano
    // Nota: Em produção idealmente faria query com startAt/endAt, mas aqui vamos buscar e filtrar
    // para manter simples e compatível.

    const snapPags = await getDocs(collection(db, "pagamentos"));
    const snapGastos = await getDocs(collection(db, "gastos"));

    let dre = {}; // { '01': {receita:0, despesa:0}, '02': ... }

    // Inicializa meses
    for (let i = 1; i <= 12; i++) {
        let m = String(i).padStart(2, '0');
        dre[m] = { receita: 0, despesa: 0, lucro: 0 };
    }

    snapPags.forEach(d => {
        const data = d.data();
        if (data.mesReferencia && data.mesReferencia.startsWith(anoAtual) && data.status === 'pago') {
            const mes = data.mesReferencia.split('-')[1];
            dre[mes].receita += parseFloat(data.valor || 0);
        }
    });

    snapGastos.forEach(d => {
        const data = d.data();
        if (data.mesReferencia && data.mesReferencia.startsWith(anoAtual) && data.status !== 'agendado') {
            const mes = data.mesReferencia.split('-')[1];
            dre[mes].despesa += parseFloat(data.valor || 0);
        }
    });

    // Monta dados Tabela
    const bodyTable = [];
    let totalRec = 0, totalDesp = 0;

    Object.keys(dre).sort().forEach(m => {
        const r = dre[m].receita;
        const d = dre[m].despesa;
        const l = r - d;
        totalRec += r;
        totalDesp += d;
        bodyTable.push([`${m}/${anoAtual}`, `R$ ${r.toFixed(2)}`, `R$ ${d.toFixed(2)}`, `R$ ${l.toFixed(2)}`]);
    });

    // Totalizador
    bodyTable.push(['TOTAL', `R$ ${totalRec.toFixed(2)}`, `R$ ${totalDesp.toFixed(2)}`, `R$ ${(totalRec - totalDesp).toFixed(2)}`]);

    doc.setFontSize(18);
    doc.setTextColor(27, 59, 111);
    doc.text(`DRE ANUAL - ${anoAtual}`, 105, 15, null, null, "center");

    doc.autoTable({
        startY: 25,
        head: [['Mês', 'Receita Bruta', 'Despesas', 'Lucro Líquido']],
        body: bodyTable,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0] },
        footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`DRE_${anoAtual}.pdf`);
    mostrarNotificacao("DRE Gerado!");
};

// ==========================================================================
// 9. AGENDA CENTRALIZADA (FIXA)
// ==========================================================================

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
    const horarios = ["07:00 - 08:00", "08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "13:00 - 14:00", "14:00 - 15:00", "15:00 - 16:00", "16:00 - 17:00", "17:00 - 18:00", "18:00 - 19:00", "19:00 - 20:00", "20:00 - 21:00"];
    const dadosDia = dbAgenda[diaAtualAgenda] || {};

    const agendadosHojeIds = [];
    Object.keys(dadosDia).forEach(h => {
        if (Array.isArray(dadosDia[h])) {
            dadosDia[h].forEach(aluno => agendadosHojeIds.push(aluno.id));
        }
    });

    horarios.forEach(hora => {
        const alunos = dadosDia[hora] || [];
        if (busca && !alunos.some(a => a.nome.toLowerCase().includes(busca))) return;
        if (filtro === 'ocupados' && alunos.length === 0) return;
        if (filtro === 'livres' && alunos.length >= MAX_ALUNOS) return;

        let htmlAlunos = '';
        alunos.forEach((a, idx) => {
            let statusClass = '';
            if (a.presenca === 'presente') statusClass = 'presente';
            else if (a.presenca === 'falta') statusClass = 'falta';

            htmlAlunos += `
                <div class="aluno-item ${statusClass}">
                    <span>${a.nome}</span>
                    <div>
                        <button onclick="confirmarAcao('REMOVER?', '', ()=>rmAgenda('${hora}', ${idx}))" style="color:var(--danger)">🗑️</button>
                    </div>
                </div>`;
        });

        let opts = `<option value="">+ ADICIONAR</option>`;
        listaClientes.forEach(c => {
            if (!agendadosHojeIds.includes(c.id)) {
                opts += `<option value="${c.id}|${c.nome}">${c.nome}</option>`;
            }
        });

        container.appendChild(document.createRange().createContextualFragment(`
            <div class="horario-card">
                <div class="horario-titulo"><span>${hora}</span><span>${alunos.length}/${MAX_ALUNOS}</span></div>
                <div style="padding:15px;">
                    ${htmlAlunos}
                    ${alunos.length < MAX_ALUNOS ? `
                        <div style="display:flex; gap:10px; margin-top:15px;">
                            <select id="sel-${hora}" style="flex:2">${opts}</select>
                            <button onclick="addAgenda('${hora}')" style="width:auto">OK</button>
                        </div>` : `<div style="color:red; text-align:center;">LOTADO</div>`}
                </div>
            </div>`));
    });
};

window.addAgenda = async (hora) => {
    const val = document.getElementById(`sel-${hora}`).value;
    if (!val) return;
    const [id, nome] = val.split('|');

    const dadosDia = dbAgenda[diaAtualAgenda] || {};
    let jaAgendado = false;
    Object.values(dadosDia).forEach(lista => {
        if (Array.isArray(lista) && lista.some(a => a.id === id)) jaAgendado = true;
    });

    if (jaAgendado) return alert("Aluno já agendado hoje!");

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

window.mudarSubAbaAgenda = (abaId) => {
    document.querySelectorAll('.agenda-subnav button').forEach(btn => btn.classList.remove('active'));
    const btnAtivo = document.getElementById(`sub-${abaId}`);
    if (btnAtivo) btnAtivo.classList.add('active');
    document.querySelectorAll('.agenda-view').forEach(view => view.classList.remove('active'));
    const viewSelecionada = document.getElementById(`view-${abaId}`);
    if (viewSelecionada) viewSelecionada.classList.add('active');
    if (abaId === 'hoje') renderizarAgendaDoDia();
};

window.renderizarAgendaDoDia = () => {
    const lista = document.getElementById('listaAgendaHoje');
    const titulo = document.getElementById('tituloAgendaHoje');
    const diasMap = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const hoje = new Date();
    const diaHojeStr = diasMap[hoje.getDay()];
    const dataHojeFormatada = hoje.toLocaleDateString('pt-BR');
    if (titulo) titulo.innerText = `AGENDA DE HOJE (${diaHojeStr.toUpperCase()} - ${dataHojeFormatada})`;
    if (lista) lista.innerHTML = '';
    if (diaHojeStr === 'sabado' || diaHojeStr === 'domingo') {
        if (lista) lista.innerHTML = '<p style="text-align:center; padding:20px; font-style:italic;">Fim de semana! Bom descanso.</p>';
        return;
    }
    const dadosDia = dbAgenda[diaHojeStr];
    if (!dadosDia) { if (lista) lista.innerHTML = '<p style="padding:20px;">Carregando agenda...</p>'; return; }
    const horariosOrdenados = Object.keys(dadosDia).sort();
    let temAluno = false;
    horariosOrdenados.forEach(hora => {
        const alunos = dadosDia[hora];
        if (Array.isArray(alunos) && alunos.length > 0) {
            temAluno = true;
            let nomes = alunos.map(a => {
                let estilo = ''; let icone = '';
                if (a.presenca === 'presente') { estilo = 'color:var(--success); font-weight:bold;'; icone = '✅ '; }
                else if (a.presenca === 'falta') { estilo = 'color:var(--danger); text-decoration:line-through;'; icone = '❌ '; }
                return `<span style="${estilo}">${icone}${a.nome}</span>`;
            }).join(', ');
            if (lista) lista.innerHTML += `
                <div class="card-agenda-hoje" style="background:var(--bg-input); padding:15px; border-left:4px solid var(--primary); margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border-radius:4px;">
                    <span style="font-size:1.2rem; font-weight:bold; color:var(--primary); font-family:monospace;">${hora}</span>
                    <div style="text-align:right;">${nomes}</div>
                </div>`;
        }
    });
    if (!temAluno) { if (lista) lista.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-secondary);">Nenhum aluno agendado para hoje.</p>'; }
};

// ==========================================================================
// 10. PRONTUÁRIO ELETRÔNICO
// ==========================================================================

window.filtrarSelectProntuario = () => {
    const termo = document.getElementById('buscaProntuario').value.toLowerCase();
    const sel = document.getElementById('selectProntuarioAluno');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- SELECIONE --</option>';
    const filtrados = listaClientes.filter(c => c.nome.toLowerCase().includes(termo)).sort((a, b) => a.nome.localeCompare(b.nome));
    filtrados.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`);
    if (filtrados.length === 1 && termo.length > 1) { sel.value = filtrados[0].id; carregarProntuarioSelecionado(); }
}

function calcularIdade(dataNasc) {
    if (!dataNasc) return "N/A";
    const hoje = new Date(); const nasc = new Date(dataNasc);
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
    const aluno = listaClientes.find(c => c.id === id);
    if (aluno) {
        header.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; padding:15px;">
                <div><strong>NOME:</strong> ${aluno.nome.toUpperCase()}</div>
                <div><strong>IDADE:</strong> ${calcularIdade(aluno.nascimento)}</div>
                <div><strong>PROFISSÃO:</strong> ${aluno.profissao || '-'}</div>
                <div><strong>QUEIXA:</strong> ${aluno.queixa || '-'}</div>
                <div style="grid-column: span 2; border-top: 1px dashed #666; padding-top: 5px; margin-top:5px;"><strong>DIAGNÓSTICO:</strong> ${aluno.diagnostico || 'Não informado'}</div>
            </div>`;
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
    } else lista.innerHTML = '<p style="padding:15px; text-align:center;">Nenhum registro.</p>';
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
    const docPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const azulReal = [27, 59, 111]; const cinzaTexto = [60, 60, 60];
    docPdf.setDrawColor(...azulReal); docPdf.setLineWidth(1); docPdf.rect(5, 5, 200, 287);
    docPdf.setTextColor(...azulReal); docPdf.setFont("times", "bold"); docPdf.setFontSize(24);
    docPdf.text("EDANIOS BELCHIOR", 105, 25, null, null, "center");
    docPdf.setFontSize(12); docPdf.setFont("helvetica", "normal");
    docPdf.text("FISIOTERAPEUTA", 105, 32, null, null, "center");
    docPdf.setDrawColor(200, 200, 200); docPdf.line(20, 38, 190, 38);
    docPdf.setTextColor(0, 0, 0); docPdf.setFontSize(18); docPdf.setFont("helvetica", "bold");
    docPdf.text("PRONTUÁRIO CLÍNICO", 105, 50, null, null, "center");
    docPdf.setFontSize(11); docPdf.setTextColor(...cinzaTexto); docPdf.setFont("times", "normal");
    let y = 65;
    docPdf.setFont("times", "bold"); docPdf.text("PACIENTE:", 20, y);
    docPdf.setFont("times", "normal"); docPdf.text(aluno.nome.toUpperCase(), 45, y);
    docPdf.setFont("times", "bold"); docPdf.text("IDADE:", 130, y);
    docPdf.setFont("times", "normal"); docPdf.text(calcularIdade(aluno.nascimento), 145, y);
    y += 8;
    docPdf.setFont("times", "bold"); docPdf.text("PROFISSÃO:", 20, y);
    docPdf.setFont("times", "normal"); docPdf.text(aluno.profissao || '-', 48, y);
    y += 8;
    docPdf.setFont("times", "bold"); docPdf.text("QUEIXA:", 20, y);
    docPdf.setFont("times", "normal"); docPdf.text(aluno.queixa || '-', 40, y);
    y += 8;
    docPdf.setFont("times", "bold"); docPdf.text("DIAGNÓSTICO:", 20, y);
    docPdf.setFont("times", "normal"); docPdf.text(aluno.diagnostico || '-', 52, y);
    y += 15;
    docPdf.setDrawColor(200, 200, 200); docPdf.line(20, y, 190, y); y += 10;
    docPdf.setFontSize(12);
    if (snap.exists() && snap.data().historico) {
        snap.data().historico.forEach(h => {
            if (y > 250) { docPdf.addPage(); docPdf.setDrawColor(...azulReal); docPdf.rect(5, 5, 200, 287); y = 20; }
            docPdf.setTextColor(...azulReal); docPdf.setFont("times", "bold");
            docPdf.text(`DATA: ${h.data}`, 20, y); y += 6;
            docPdf.setTextColor(0, 0, 0); docPdf.setFont("times", "normal");
            const split = docPdf.splitTextToSize(h.texto, 170);
            docPdf.text(split, 20, y); y += (split.length * 5) + 10;
        });
    }
    if (y > 250) { docPdf.addPage(); docPdf.setDrawColor(...azulReal); docPdf.rect(5, 5, 200, 287); }
    const footerY = 270;
    docPdf.setDrawColor(...azulReal); docPdf.setLineWidth(1); docPdf.line(60, footerY - 5, 150, footerY - 5);
    docPdf.setFontSize(10); docPdf.setTextColor(...cinzaTexto);
    docPdf.text("Edanios Belchior", 105, footerY, null, null, "center");
    docPdf.text("Fisioterapeuta - CREFITO", 105, footerY + 4, null, null, "center");
    docPdf.save(`Prontuario_${aluno.nome}.pdf`);
};

window.baixarPdfEAbrirWpp = (id, nomePaciente, tel, valor, mesRef) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const azulReal = [27, 59, 111]; const cinzaTexto = [60, 60, 60];
    let textoMes = "";
    if (mesRef && mesRef.includes('-')) {
        const [ano, mes] = mesRef.split('-'); textoMes = ` referente ao mês de ${mes}/${ano}`;
    } else if (mesRef) { textoMes = ` referente a ${mesRef}`; }

    doc.setDrawColor(...azulReal); doc.setLineWidth(1); doc.rect(5, 5, 138, 200);
    doc.setTextColor(...azulReal); doc.setFont("times", "bold"); doc.setFontSize(22);
    doc.text("EDANIOS BELCHIOR", 74, 25, null, null, "center");
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    doc.text("FISIOTERAPEUTA", 74, 32, null, null, "center");
    doc.setDrawColor(200, 200, 200); doc.line(20, 38, 128, 38);
    doc.setTextColor(0, 0, 0); doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("RECIBO", 50, 60, null, null, "center");
    doc.setFontSize(14); doc.setTextColor(...azulReal);
    doc.text(`R$ ${parseFloat(valor).toFixed(2)}`, 120, 60, null, null, "right");
    doc.setTextColor(...cinzaTexto); doc.setFontSize(11); doc.setFont("times", "normal");
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const texto = `Recebi de ${nomePaciente.toUpperCase()} a importância supramencionada, referente aos serviços de Fisioterapia/Pilates prestados${textoMes}.`;
    const linhas = doc.splitTextToSize(texto, 110);
    doc.text(linhas, 20, 85);
    doc.setFontSize(10);
    doc.text(`Chaval - CE, ${dataHoje}`, 74, 130, null, null, "center");
    doc.setDrawColor(...azulReal); doc.setLineWidth(1); doc.line(30, 150, 118, 150);
    doc.setFontSize(9);
    doc.text("Edanios Belchior", 74, 155, null, null, "center");
    doc.text("Fisioterapeuta - CREFITO", 74, 159, null, null, "center");
    doc.save(`Recibo_${nomePaciente}.pdf`);
    mostrarNotificacao("PDF GERADO!");
    const zap = tel.replace(/\D/g, '');
    if (zap.length > 8) setTimeout(() => window.open(`https://wa.me/55${zap}?text=Olá! Segue seu recibo digital.`, '_blank'), 1000);
    registrarLog(`Gerou recibo PDF para ${nomePaciente}`);
};

// ==========================================================================
// 11. FINANCEIRO E FLUXO DE CAIXA (ATUALIZADO V2.0)
// ==========================================================================

window.adicionarGasto = async () => {
    const desc = document.getElementById('descGasto').value;
    const val = document.getElementById('valorGasto').value;
    const cat = document.getElementById('catGasto').value;

    // Novo na v2.0: Checkbox "Agendar"
    const isAgendado = document.getElementById('checkGastoFuturo').checked;
    const status = isAgendado ? 'agendado' : 'pago';

    await addDoc(collection(db, "gastos"), {
        desc,
        valor: val,
        categoria: cat,
        mesReferencia: inputMes.value,
        status: status // Novo campo
    });

    // Reset
    document.getElementById('descGasto').value = '';
    document.getElementById('valorGasto').value = '';
    document.getElementById('checkGastoFuturo').checked = false;

    mostrarNotificacao(isAgendado ? "CONTA AGENDADA!" : "DESPESA PAGA!");
};

window.virarMes = () => mostrarNotificacao("MUDE A DATA NO SELETOR.");

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

    // Tabelas
    const tbodyPagos = document.getElementById('tabelaGastos').querySelector('tbody');
    const tbodyFuturos = document.getElementById('tabelaGastosFuturos').querySelector('tbody');

    tbodyPagos.innerHTML = '';
    tbodyFuturos.innerHTML = '';

    let despesas = 0, receita = 0;

    // Detalhamento do Fluxo (Novo V2.0)
    let totalPix = 0, totalDinheiro = 0, totalCartao = 0;

    Object.values(dbPagamentos).forEach(p => {
        if (listaClientes.some(c => c.id === p.clienteId) && p.status === 'pago') {
            const v = Number(p.valor || 0);
            receita += v;

            // Separação V2.0
            if (p.forma === 'pix') totalPix += v;
            else if (p.forma === 'dinheiro') totalDinheiro += v;
            else totalCartao += v;
        }
    });

    // Renderiza Gastos
    dbGastos.forEach(g => {
        const valorGasto = Number(g.valor);

        if (g.status === 'agendado') {
            // Conta a Pagar (Futuro)
            tbodyFuturos.innerHTML += `
                <tr>
                    <td>${g.desc.toUpperCase()}</td>
                    <td style="color:var(--warning)">R$ ${g.valor}</td>
                    <td>
                        <button onclick="confirmarPagamentoGasto('${g.id}')" title="Marcar como Pago">✅</button> 
                        <button onclick="rmGasto('${g.id}')" title="Excluir">🗑️</button>
                    </td>
                </tr>`;
        } else {
            // Despesa Realizada
            despesas += valorGasto;
            tbodyPagos.innerHTML += `
                <tr>
                    <td>${g.desc.toUpperCase()}</td>
                    <td>${g.categoria}</td>
                    <td style="color:var(--danger)">R$ ${g.valor}</td>
                    <td><button onclick="rmGasto('${g.id}')">🗑️</button></td>
                </tr>`;
        }
    });

    // Atualiza Dash
    document.getElementById('dashReceita').innerText = `R$ ${receita.toFixed(2)}`;
    document.getElementById('dashDespesas').innerText = `R$ ${despesas.toFixed(2)}`;
    document.getElementById('dashLucro').innerText = `R$ ${(receita - despesas).toFixed(2)}`;

    // Atualiza Cards de Fluxo Detalhado
    if (document.getElementById('valPix')) {
        document.getElementById('valPix').innerText = `R$ ${totalPix.toFixed(2)}`;
        document.getElementById('valDin').innerText = `R$ ${totalDinheiro.toFixed(2)}`;
        document.getElementById('valCar').innerText = `R$ ${totalCartao.toFixed(2)}`;
    }
};

window.confirmarPagamentoGasto = async (id) => {
    if (!confirm("Confirmar pagamento desta conta? Ela sairá do seu caixa agora.")) return;
    await updateDoc(doc(db, "gastos", id), { status: 'pago' });
    mostrarNotificacao("CONTA PAGA!");
}

window.rmGasto = async (id) => await deleteDoc(doc(db, "gastos", id));

// ==========================================================================
// 12. UTILITÁRIOS E NOTIFICAÇÕES DE SISTEMA
// ==========================================================================

window.mudarCorTema = (corPrincipal) => {
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

// ==========================================================================
// 13. UI/UX: FAB & CHANGELOG (NOVO V2.1 - INTELIGENTE)
// ==========================================================================

// Lógica do Botão Flutuante (FAB)
window.toggleFab = () => {
    const menu = document.getElementById('fabMenu');
    if (menu.style.display === 'flex') {
        menu.style.display = 'none';
        menu.style.opacity = '0';
    } else {
        menu.style.display = 'flex';
        setTimeout(() => menu.style.opacity = '1', 10);
    }
};

// Dados do Changelog com propriedade 'target'
// 'admin' = apenas administrador
// 'all' = todos (admin e assistente)
const changelogData = [
    {
        title: "FINANCEIRO PRO",
        desc: "Agora você pode agendar 'Contas a Pagar' sem descontar do caixa imediato. Além disso, veja quanto entrou separadamente em Pix, Dinheiro e Cartão.",
        target: 'admin'
    },
    {
        title: "RELATÓRIO DRE",
        desc: "Gere um PDF Anual completo com todo o lucro e despesas de Janeiro a Dezembro para sua contabilidade.",
        target: 'admin'
    },
    {
        title: "EXPERIÊNCIA RÁPIDA",
        desc: "Use o novo botão flutuante (+) no canto da tela para acesso rápido a Alunos, Agenda e Despesas.",
        target: 'all'
    },
    {
        title: "VISUAL RENOVADO",
        desc: "Uma nova interface mais limpa e organizada para facilitar seus atendimentos no dia a dia.",
        target: 'all'
    }
];

window.checkChangelog = (isAdmin) => {
    // 1. Verifica se já viu a versão atual
    const seen = localStorage.getItem('changelog_seen_version');
    if (seen === VERSAO_ATUAL) return;

    // 2. Filtra as novidades baseado no perfil
    activeChangelogList = changelogData.filter(slide => {
        if (slide.target === 'all') return true;
        if (isAdmin && slide.target === 'admin') return true;
        return false;
    });

    if (activeChangelogList.length === 0) return;

    // 3. Detecta dispositivo para Badge
    const ua = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const deviceText = isMobile ? "MOBILE DETECTADO" : "DESKTOP DETECTADO";
    document.getElementById('deviceBadge').innerText = deviceText;

    // 4. Abre modal
    currentSlide = 0;
    renderChangelogSlide();
    document.getElementById('modalChangelog').style.display = 'flex';
};

function renderChangelogSlide() {
    if (activeChangelogList.length === 0) return;

    const content = document.getElementById('changelogContent');
    const slide = activeChangelogList[currentSlide];

    content.innerHTML = `
        <h2 style="color:var(--primary); margin-bottom:10px;">${slide.title}</h2>
        <p>${slide.desc}</p>
    `;
    document.getElementById('slideIndicator').innerText = `${currentSlide + 1}/${activeChangelogList.length}`;
}

window.nextChangelog = () => {
    if (currentSlide < activeChangelogList.length - 1) {
        currentSlide++;
        renderChangelogSlide();
    }
};

window.prevChangelog = () => {
    if (currentSlide > 0) {
        currentSlide--;
        renderChangelogSlide();
    }
};

window.fecharChangelog = () => {
    document.getElementById('modalChangelog').style.display = 'none';
    localStorage.setItem('changelog_seen_version', VERSAO_ATUAL);
};



