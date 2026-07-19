/* ==========================================================================
   SISTEMA DE GESTÃO INTEGRADA - EDANIOS BELCHIOR
   VERSÃO: 3.7 (SINCRO HISTÓRICA AUTOMÁTICA & ISOLAMENTO DE CARTEIRA)
   ========================================================================== */

// ==========================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÃO FIREBASE
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, query, where, setDoc, getDoc, getDocs
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ==========================================================================
// 2. VARIÁVEIS GLOBAIS E CACHE DE DADOS
// ==========================================================================

const EMAIL_ADMIN = "edanios@studio.com";
const MAX_ALUNOS = 12;
const VERSAO_ATUAL = "3.7";

let listaClientes = [];
let listaServicos = [];
let dbPagamentos = {};
let dbGastos = [];
let dbAgenda = {};

let activeChangelogList = [];
let currentSlide = 0;

let filtroAtualClientes = 'todos';
let filtroAtualAmanda = 'todos';
let filtroAtualVenc = 'todos';
let diaAtualAgenda = 'segunda';

let unsubClientes = null;
let unsubServicos = null;
let unsubPagamentos = null;
let unsubGastos = null;
let unsubAgenda = null;

let taxaAmandaGlob = localStorage.getItem('taxaAmandaGlob') ? Number(localStorage.getItem('taxaAmandaGlob')) : 50;

const inputMes = document.getElementById('mesReferencia');
const hoje = new Date();
const mesStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

if (inputMes) {
    inputMes.value = mesStr;
    inputMes.addEventListener('change', () => { carregarDadosDoMes(); });
}

// ==========================================================================
// 3. SISTEMA DE AUTENTICAÇÃO E PERMISSÕES (SOMENTE ADMIN)
// ==========================================================================

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

window.fazerLogout = () => {
    signOut(auth);
    location.reload();
};

// FUNÇÃO ADICIONADA NA V3.7 PARA FORÇAR O PUXAMENTO E CONSISTÊNCIA HISTÓRICA DO CAIXA DA EQUIPE
async function sincronizarHistoricoPagamentosEquipe(clientesAtuais) {
    try {
        const alunosEquipeIds = clientesAtuais.filter(c => c.professor === 'amanda').map(c => c.id);
        if (alunosEquipeIds.length === 0) return;

        const snapPagamentos = await getDocs(collection(db, "pagamentos"));

        snapPagamentos.forEach(async (documento) => {
            const dadosPag = documento.data();
            // Se o pagamento for de um aluno da equipe e estiver marcado como pago, garante a persistência no Firestore
            if (alunosEquipeIds.includes(dadosPag.clienteId) && dadosPag.status === 'pago') {
                const IDCorreto = `${dadosPag.mesReferencia}_${dadosPag.clienteId}`;
                if (documento.id !== IDCorreto) {
                    await setDoc(doc(db, "pagamentos", IDCorreto), dadosPag, { merge: true });
                }
            }
        });
    } catch (err) {
        console.error("Erro ao rodar alinhamento histórico:", err);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.body.classList.add('logged-in');
        document.getElementById('telaLogin').style.display = 'none';
        document.getElementById('appConteudo').style.display = 'block';

        const isAdmin = user.email === EMAIL_ADMIN;

        const btnFin = document.getElementById('btnFinAdmin');
        const btnLanc = document.getElementById('btnLancAdmin');
        const btnVencimentos = document.getElementById('btnVencimentosAdmin');
        const btnAmanda = document.getElementById('btnAmandaAdmin');
        const statsCards = document.querySelector('.stats-alunos');
        const fab = document.querySelector('.fab-container');

        const fabFin = document.getElementById('btnFabFinanceiro');
        const cardFin = document.getElementById('cardFinInicio');
        const cardLanc = document.getElementById('cardLancInicio');
        const cardVenc = document.getElementById('cardVencInicio');
        const cardAmanda = document.getElementById('cardAmandaInicio');

        if (fabFin) fabFin.style.display = isAdmin ? 'flex' : 'none';
        if (cardFin) cardFin.style.display = isAdmin ? 'flex' : 'none';
        if (cardLanc) cardLanc.style.display = isAdmin ? 'flex' : 'none';
        if (cardVenc) cardVenc.style.display = isAdmin ? 'flex' : 'none';
        if (cardAmanda) cardAmanda.style.display = isAdmin ? 'flex' : 'none';

        if (btnFin) btnFin.style.display = isAdmin ? 'inline-block' : 'none';
        if (btnLanc) btnLanc.style.display = isAdmin ? 'inline-block' : 'none';
        if (btnVencimentos) btnVencimentos.style.display = isAdmin ? 'inline-block' : 'none';
        if (btnAmanda) btnAmanda.style.display = isAdmin ? 'inline-block' : 'none';
        if (fab) fab.style.display = 'flex';

        if (statsCards) statsCards.style.display = isAdmin ? 'grid' : 'none';

        if (!isAdmin) {
            mostrarTela('clientes');
        } else {
            mostrarTela('inicio');
        }

        // Executa uma varredura para resgatar todos os pagamentos antigos gerados antes do isolamento do módulo
        const snapClientesFix = await getDocs(collection(db, "clientes"));
        let temporarioClientes = [];
        snapClientesFix.forEach(d => temporarioClientes.push({ id: d.id, ...d.data() }));
        await sincronizarHistoricoPagamentosEquipe(temporarioClientes);

        iniciarListeners(user);
        checkChangelog(isAdmin);

    } else {
        document.getElementById('telaLogin').style.display = 'flex';
        document.getElementById('appConteudo').style.display = 'none';
    }
});

// ======================================================
// 4. MÓDULO ADMINISTRATIVO - LISTENERS & SEGURANÇA
// ======================================================

function iniciarListeners(user) {
    unsubServicos = onSnapshot(collection(db, "servicos"), (snap) => {
        listaServicos = [];
        snap.forEach(d => listaServicos.push({ id: d.id, ...d.data() }));
        renderizarServicos();
    });

    unsubClientes = onSnapshot(collection(db, "clientes"), (snap) => {
        listaClientes = [];
        snap.forEach(d => listaClientes.push({ id: d.id, ...d.data() }));
        renderizarClientes();
        if (user.email === EMAIL_ADMIN) renderizarFinanceiro();
        if (document.getElementById('vencimentos')) renderizarVencimentos();
        if (document.getElementById('amanda')) renderizarAreaAmanda();
    });

    unsubAgenda = onSnapshot(collection(db, "agenda"), (snap) => {
        dbAgenda = { segunda: {}, terca: {}, quarta: {}, quinta: {}, sexta: {} };
        snap.forEach(d => dbAgenda[d.id] = d.data());
        renderizarAgenda();
        const viewHoje = document.getElementById('view-hoje');
        if (viewHoje && viewHoje.classList.contains('active')) renderizarAgendaDoDia();
        if (document.getElementById('amanda')) renderizarAreaAmanda();
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
        unsubPagamentos = onSnapshot(query(collection(db, "pagamentos"), where("mesReferencia", "==", mes)), (snap) => {
            dbPagamentos = {};
            snap.forEach(d => dbPagamentos[d.data().clienteId] = d.data());
            renderizarClientes();
            renderizarFinanceiro();
            if (document.getElementById('vencimentos')) renderizarVencimentos();
            if (document.getElementById('amanda')) renderizarAreaAmanda();
        });
        unsubGastos = onSnapshot(query(collection(db, "gastos"), where("mesReferencia", "==", mes)), (snap) => {
            dbGastos = [];
            snap.forEach(d => dbGastos.push({ id: d.id, ...d.data() }));
            renderizarFinanceiro();
        });
    } else {
        unsubPagamentos = onSnapshot(query(collection(db, "pagamentos"), where("mesReferencia", "==", mes)), (snap) => {
            dbPagamentos = {};
            snap.forEach(d => dbPagamentos[d.data().clienteId] = d.data());
            renderizarClientes();
            if (document.getElementById('vencimentos')) renderizarVencimentos();
            if (document.getElementById('amanda')) renderizarAreaAmanda();
        });
        dbGastos = [];
        const dash = document.querySelector('.dashboard-financeiro');
        if (dash) dash.style.display = 'none';
        const fluxo = document.querySelector('.fluxo-detalhado-wrapper');
        if (fluxo) fluxo.style.display = 'none';
    }
}

// ==========================================================================
// 5. GESTÃO DE SERVIÇOS
// ==========================================================================

window.adicionarServico = async () => {
    try {
        const nomeInput = document.getElementById('nomeNovoServico');
        const valorInput = document.getElementById('valorNovoServico');

        const nome = nomeInput.value.trim();
        const valor = valorInput.value;

        if (!nome || !valor) return mostrarNotificacao("Preencha todos os campos do serviço!", "erro");

        await addDoc(collection(db, "servicos"), {
            nome: nome.toUpperCase(),
            valor: parseFloat(valor)
        });

        nomeInput.value = '';
        valorInput.value = '';
        mostrarNotificacao("Serviço salvo com sucesso!");
    } catch (e) {
        mostrarNotificacao("Erro ao salvar serviço.", "erro");
    }
};

window.removerServico = async (id) => {
    if (auth.currentUser.email !== EMAIL_ADMIN) return alert("Apenas o Administrador pode remover serviços.");

    if (confirm("Deseja realmente remover este serviço do catálogo?")) {
        try {
            await deleteDoc(doc(db, "servicos", id));
            mostrarNotificacao("Serviço removido.");
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
        if (listaServicos.length === 0) lista.innerHTML = '<span style="color:#777; font-size:0.8rem;">Nenhum serviço cadastrado.</span>';
        else {
            listaServicos.forEach(s => {
                const btnDelete = isAdmin ? `<button onclick="removerServico('${s.id}')" style="background:none; color:var(--danger); border:none; cursor:pointer; font-size: 1.2rem;">&times;</button>` : '';
                lista.innerHTML += `
                    <div style="background:var(--bg-input); padding:8px 12px; border-radius:var(--radius-sm); display:flex; gap:15px; border:1px solid var(--border-strong); align-items:center;">
                        <span style="font-weight:600; color: var(--text-primary); font-family: var(--font-body);">${s.nome}</span>
                        <span style="color:var(--success); font-weight: bold; font-family: var(--font-mono);">R$ ${parseFloat(s.valor).toFixed(2)}</span>
                        ${btnDelete}
                    </div>`;
            });
        }
    }

    const select = document.getElementById('selectServicoCadastro');
    if (select) {
        const valAtual = select.value;
        select.innerHTML = '<option value="">-- SELECIONE O SERVIÇO --</option>';
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
// 6. GESTÃO DE ALUNOS GERAL (CADASTRO E EXIBIÇÃO)
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

    if (!nome) return mostrarNotificacao("O nome é obrigatório!", "erro");
    if (!selectServ.value && !id) return mostrarNotificacao("Selecione um Serviço vinculado!", "erro");

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
            mostrarNotificacao("Ficha atualizada com sucesso!");
        } else {
            const docRef = await addDoc(collection(db, "clientes"), dados);
            await setDoc(doc(db, "pagamentos", `${inputMes.value}_${docRef.id}`), {
                clienteId: docRef.id,
                mesReferencia: inputMes.value,
                valor: dados.valorContrato,
                status: 'pendente',
                forma: ''
            });
            mostrarNotificacao("Novo aluno registrado!");
        }
        window.cancelarEdicao();
    } catch (e) {
        mostrarNotificacao("Erro ao salvar cadastro.", "erro");
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
    document.querySelectorAll('#clientes .btn-filtro').forEach(b => b.classList.remove('active'));
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

    listaClientes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    listaClientes.forEach(c => {
        if (c.professor === 'amanda') return;

        const pg = dbPagamentos[c.id] || { status: 'pendente', forma: '', valor: c.valorContrato || 0 };

        total++;
        if (pg.status === 'pendente') pendentes++;
        if (pg.status === 'pago') receita += Number(pg.valor || 0);

        if (termo && c.nome && !c.nome.toLowerCase().includes(termo)) return;
        if (filtroAtualClientes !== 'todos' && pg.status !== filtroAtualClientes) return;

        const tr = document.createElement('tr');
        let displayServico = c.nomeServico || "-";

        tr.innerHTML = `
            <td><strong>${(c.nome || 'Sem Nome').toUpperCase()}</strong><br><small style="color:var(--text-muted);">${c.telefone || ''}</small></td>
            <td>
                <select onchange="atualizarPg('${c.id}', 'status', this.value)" style="width:100%; font-weight:bold; ${pg.status === 'pago' ? 'color:var(--success); border-color:var(--success);' : 'color:var(--warning); border-color:var(--warning);'}">
                    <option value="pendente" ${pg.status === 'pendente' ? 'selected' : ''}>PENDENTE</option>
                    <option value="pago" ${pg.status === 'pago' ? 'selected' : ''}>PAGO</option>
                </select>
            </td>
            <td>
                <select onchange="atualizarPg('${c.id}', 'forma', this.value)">
                    <option value="" disabled ${!pg.forma ? 'selected' : ''}>---</option>
                    <option value="pix" ${pg.forma === 'pix' ? 'selected' : ''}>PIX</option>
                    <option value="dinheiro" ${pg.forma === 'dinheiro' ? 'selected' : ''}>DINHEIRO</option>
                    <option value="cartao" ${pg.forma === 'cartao' ? 'selected' : ''}>CARTÃO</option>
                </select>
            </td>
            <td>
                <span style="font-weight:600; color:var(--accent); font-size:0.9rem;">${displayServico}</span>
            </td>
            <td>
                <button onclick="editarCliente('${c.id}')" class="btn-tool" title="Editar Ficha">✏️</button>
                <button onclick="confirmarAcao('EXCLUIR REGISTRO?', 'Tem certeza que deseja apagar o aluno e seu histórico financeiro?', ()=>removerCliente('${c.id}', '${c.nome}'))" class="btn-tool danger" title="Excluir Aluno">🗑️</button>
                ${(pg.status === 'pago') ? `<button onclick="baixarPdfEAbrirWpp('${c.id}', '${c.nome || ''}', '${c.telefone || ''}', '${pg.valor}', '${inputMes.value}')" class="btn-tool" style="color:var(--success); border-color:var(--success); font-weight:bold; font-family:var(--font-headline); font-size: 0.8rem;" title="Baixar Recibo">PDF</button>` : ''}
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
        document.getElementById('nomeCliente').value = c.nome || '';
        document.getElementById('telefoneCliente').value = c.telefone || '';
        if (c.servicoId) document.getElementById('selectServicoCadastro').value = c.servicoId;
        document.getElementById('nascCliente').value = c.nascimento || '';
        document.getElementById('profissaoCliente').value = c.profissao || '';
        document.getElementById('queixaCliente').value = c.queixa || '';
        document.getElementById('diagnosticoCliente').value = c.diagnostico || '';
        document.getElementById('btnSalvarCliente').innerText = "💾 SALVAR ALTERAÇÕES";
        document.getElementById('btnCancelarEdicao').style.display = "inline-block";
        window.scrollTo(0, document.getElementById('clientes').offsetTop);
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
    if (auth.currentUser.email !== EMAIL_ADMIN) return alert("Apenas o Administrador pode excluir alunos.");

    try {
        await deleteDoc(doc(db, "clientes", id));
        const q = query(collection(db, "pagamentos"), where("clienteId", "==", id));
        const snap = await getDocs(q);
        snap.forEach(d => deleteDoc(d.ref));
        mostrarNotificacao("Registro apagado definitivamente.");
    } catch (e) { mostrarNotificacao("ERRO AO APAGAR REGISTRO!", "erro"); }
};

// ==========================================================================
// 7. MÓDULO DE VENCIMENTOS E WHATSAPP 
// ==========================================================================

window.filtrarVencimentos = (tipo) => {
    filtroAtualVenc = tipo;
    document.querySelectorAll('#vencimentos .btn-filtro').forEach(b => b.classList.remove('active'));
    let idBtn = tipo === 'todos' ? 'btnFiltroVencTodos' : (tipo === 'pendente' ? 'btnFiltroVencPendente' : 'btnFiltroVencPago');
    document.getElementById(idBtn).classList.add('active');
    renderizarVencimentos();
};

window.renderizarVencimentos = () => {
    const tbody = document.getElementById('tabelaVencimentos').querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const termo = document.getElementById('inputBuscaVenc').value.toLowerCase();
    const anoMesAtual = document.getElementById('mesReferencia').value;
    const [ano, mes] = anoMesAtual.split('-');

    let hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    listaClientes.forEach(c => {
        if (c.professor === 'amanda') return;
        if (termo && c.nome && !c.nome.toLowerCase().includes(termo)) return;

        const pg = dbPagamentos[c.id] || { status: 'pendente', valor: c.valorContrato || 0 };

        if (filtroAtualVenc !== 'todos' && pg.status !== filtroAtualVenc) return;

        let diaVenc = c.diaVencimento || '';
        let badgeSituacao = '-';

        if (pg.status === 'pago') {
            badgeSituacao = '<span class="status-badge sucesso">PAGO</span>';
        } else {
            if (!diaVenc) {
                badgeSituacao = '<span class="status-badge neutro">NÃO DEFINIDO</span>';
            } else {
                let dataVenc = new Date(ano, mes - 1, diaVenc);
                let diffTime = dataVenc - hoje;
                let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays < 0) {
                    badgeSituacao = `<span class="status-badge erro">VENCIDO (${Math.abs(diffDays)} dias)</span>`;
                } else if (diffDays <= 3) {
                    badgeSituacao = `<span class="status-badge pendente">PRÓXIMO (${diffDays} dias)</span>`;
                } else {
                    badgeSituacao = `<span class="status-badge sucesso">NO PRAZO (${diffDays} dias)</span>`;
                }
            }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${(c.nome || 'Sem Nome').toUpperCase()}</strong><br><small>${c.telefone || ''}</small></td>
            <td style="font-family: var(--font-mono); font-weight: bold;">R$ ${Number(pg.valor || 0).toFixed(2)}</td>
            <td><span style="color: ${pg.status === 'pago' ? 'var(--success)' : 'var(--warning)'}; font-weight: bold;">${pg.status.toUpperCase()}</span></td>
            <td>
                <div style="display:flex; gap:5px; align-items:center;">
                    <input type="number" id="vencDia_${c.id}" value="${diaVenc}" min="1" max="31" style="width:70px; padding:8px;">
                    <button onclick="salvarDiaVencimento('${c.id}')" class="btn-tool" style="background:var(--accent); color:white; border-color:var(--accent);" title="Salvar Dia">💾</button>
                </div>
            </td>
            <td>${badgeSituacao}</td>
            <td>
                ${pg.status !== 'pago' && c.telefone ? `<button onclick="lembrarWpp('${c.nome}', '${c.telefone}', '${diaVenc}', '${pg.valor}')" class="btn-tool" style="background:#4A5E4D; color:white; border-color:#4A5E4D;" title="Lembrar via WhatsApp"><span class="material-symbols-outlined" style="font-size:18px;">chat</span></button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.salvarDiaVencimento = async (id) => {
    const dia = document.getElementById(`vencDia_${id}`).value;
    if (dia && (dia < 1 || dia > 31)) {
        return mostrarNotificacao("Dia inválido!", "erro");
    }
    try {
        await updateDoc(doc(db, "clientes", id), { diaVencimento: dia });
        mostrarNotificacao("Vencimento programado!");
    } catch (e) {
        mostrarNotificacao("Erro ao salvar.", "erro");
        console.error(e);
    }
};

window.lembrarWpp = (nome, tel, diaVenc, valor) => {
    const zap = (tel || '').replace(/\D/g, '');
    if (zap.length < 10) return mostrarNotificacao("Número de telefone inválido!", "erro");

    let dataTexto = diaVenc ? `no dia ${diaVenc}` : "este mês";
    let valorFormato = Number(valor || 0).toFixed(2).replace('.', ',');

    const msg = `Olá, ${nome}! Tudo bem? Passando para lembrar sobre o vencimento do seu pacote (R$ ${valorFormato}) programado para ${dataTexto}. Qualquer dúvida, estamos à disposição no consultório!`;
    const url = `https://wa.me/55${zap}?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
};


// ==========================================================================
// 8. RELATÓRIOS PDF E IMPRESSÃO
// ==========================================================================

window.gerarRelatorioFinanceiroPDF = () => {
    if (!auth.currentUser || auth.currentUser.email !== EMAIL_ADMIN) return alert("Acesso Negado: Apenas Admin.");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const mes = inputMes.value;
    const marginX = 14;

    const corTexto = [44, 42, 41];
    const corDestaque = [94, 83, 72];

    doc.setFontSize(18);
    doc.setTextColor(...corTexto);
    doc.text("EDANIOS BELCHIOR - BALANÇO FINANCEIRO", 105, 15, null, null, "center");

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Período Base: ${mes}`, 105, 22, null, null, "center");

    const dadosReceita = [];
    let totalReceita = 0;

    let sumPix = 0, sumDin = 0, sumCard = 0;

    Object.values(dbPagamentos).forEach(pg => {
        if (pg.status === 'pago') {
            const cliente = listaClientes.find(c => c.id === pg.clienteId);
            if (cliente) {
                const nome = cliente.nome || 'Sem Nome';
                const servico = cliente.nomeServico || "-";
                const origem = cliente.professor === 'amanda' ? "Equipe" : "Geral";
                const val = parseFloat(pg.valor || 0);
                totalReceita += val;

                if (pg.forma === 'pix') sumPix += val;
                else if (pg.forma === 'dinheiro') sumDin += val;
                else if (pg.forma === 'cartao') sumCard += val;

                let formaPagamento = (pg.forma || "N/A").toUpperCase();

                dadosReceita.push([pg.mesReferencia, nome, origem, formaPagamento, `R$ ${val.toFixed(2)}`]);
            }
        }
    });

    doc.autoTable({
        startY: 30,
        head: [['Mês', 'Aluno', 'Carteira', 'Forma Pag.', 'Valor Recebido']],
        body: dadosReceita,
        theme: 'striped',
        headStyles: { fillColor: corTexto, textColor: [245, 243, 239] },
        alternateRowStyles: { fillColor: [245, 243, 239] },
        styles: { fontSize: 10, textColor: corTexto },
        margin: { top: 30, bottom: 20 }
    });

    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(...corDestaque);
    doc.text(`Composição (Geral+Equipe): PIX (R$ ${sumPix.toFixed(2)}) | Dinheiro (R$ ${sumDin.toFixed(2)}) | Cartão (R$ ${sumCard.toFixed(2)})`, marginX, finalY);

    finalY += 10;

    const dadosDespesa = [];
    let totalDespesa = 0;
    dbGastos.forEach(g => {
        if (g.status !== 'agendado') {
            const val = parseFloat(g.valor || 0);
            totalDespesa += val;
            dadosDespesa.push([g.categoria.toUpperCase(), g.desc, `R$ ${val.toFixed(2)}`]);
        }
    });

    if (finalY > 240) { doc.addPage(); finalY = 20; }

    doc.setFontSize(12);
    doc.setTextColor(...corTexto);
    doc.text("SAÍDAS E DESPESAS OPERACIONAIS", marginX, finalY - 5);

    doc.autoTable({
        startY: finalY,
        head: [['Categoria Base', 'Descrição da Despesa', 'Custo Gerado']],
        body: dadosDespesa,
        theme: 'striped',
        headStyles: { fillColor: [115, 46, 46], textColor: [245, 243, 239] },
        alternateRowStyles: { fillColor: [245, 243, 239] },
        styles: { fontSize: 10, textColor: corTexto },
        margin: { bottom: 20 }
    });

    finalY = doc.lastAutoTable.finalY + 15;

    const espacoNecessario = 50;
    if (finalY + espacoNecessario > 285) { doc.addPage(); finalY = 20; }

    const lucro = totalReceita - totalDespesa;

    doc.setFontSize(12);
    doc.setTextColor(...corTexto);
    doc.text(`RECEITA BRUTA TOTAL (GERAL + EQUIPE): R$ ${totalReceita.toFixed(2)}`, marginX, finalY);
    doc.text(`CUSTOS E DESPESAS (INCLUI SALÁRIOS): - R$ ${totalDespesa.toFixed(2)}`, marginX, finalY + 6);

    if (lucro >= 0) doc.setTextColor(46, 71, 51);
    else doc.setTextColor(115, 46, 46);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`CAIXA LÍQUIDO FINAL: R$ ${lucro.toFixed(2)}`, marginX, finalY + 16);

    doc.save(`Balanço_${mes}_Edanios.pdf`);
};

window.gerarRelatorioAnualPDF = async () => {
    if (!confirm("Gerar DRE Anual? Este processo compila todos os dados do ano e pode levar alguns segundos.")) return;
    mostrarNotificacao("Compilando DRE...", "sucesso");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const anoAtual = new Date().getFullYear();

    const snapPags = await getDocs(collection(db, "pagamentos"));
    const snapGastos = await getDocs(collection(db, "gastos"));

    let dre = {};
    for (let i = 1; i <= 12; i++) {
        let m = String(i).padStart(2, '0');
        dre[m] = { receita: 0, despesa: 0 };
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

    bodyTable.push(['BALANÇO TOTAL', `R$ ${totalRec.toFixed(2)}`, `R$ ${totalDesp.toFixed(2)}`, `R$ ${(totalRec - totalDesp).toFixed(2)}`]);

    doc.setFontSize(18);
    doc.setTextColor(44, 42, 41);
    doc.text(`DRE CONSOLIDADO ANUAL - ${anoAtual}`, 105, 15, null, null, "center");

    doc.autoTable({
        startY: 25,
        head: [['Mês Ref.', 'Receita Bruta (Global)', 'Despesas (Global)', 'Lucro Líquido']],
        body: bodyTable,
        theme: 'grid',
        headStyles: { fillColor: [44, 42, 41], textColor: [245, 243, 239] },
        footStyles: { fillColor: [212, 208, 200], textColor: [44, 42, 41], fontStyle: 'bold' },
        styles: { textColor: [44, 42, 41] }
    });

    doc.save(`DRE_Consolidado_${anoAtual}.pdf`);
    mostrarNotificacao("DRE Anual gerado e exportado!");
};

window.baixarPdfEAbrirWpp = (id, nomePaciente, tel, valor, mesRef) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const corTema = [44, 42, 41];
    const corPapel = [245, 243, 239];
    const cinzaTexto = [92, 87, 82];

    let textoMes = "";
    if (mesRef && mesRef.includes('-')) {
        const [ano, mes] = mesRef.split('-'); textoMes = ` referente ao mês de referência ${mes}/${ano}`;
    } else if (mesRef) { textoMes = ` referente a ${mesRef}`; }

    doc.setFillColor(...corPapel);
    doc.rect(0, 0, 148, 210, 'F');

    doc.setDrawColor(...corTema); doc.setLineWidth(0.5); doc.rect(5, 5, 138, 200);
    doc.setTextColor(...corTema); doc.setFont("times", "bold"); doc.setFontSize(22);
    doc.text("EDANIOS BELCHIOR", 74, 25, null, null, "center");
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    doc.text("FISIOTERAPEUTA | GESTOR CLÍNICO", 74, 32, null, null, "center");
    doc.setDrawColor(...cinzaTexto); doc.line(20, 38, 128, 38);
    doc.setTextColor(0, 0, 0); doc.setFontSize(16); doc.setFont("times", "bold");
    doc.text("RECIBO DE PAGAMENTO", 50, 60, null, null, "center");
    doc.setFontSize(14); doc.setTextColor(...corTema);
    doc.text(`R$ ${parseFloat(valor).toFixed(2)}`, 120, 60, null, null, "right");
    doc.setTextColor(...cinzaTexto); doc.setFontSize(11); doc.setFont("times", "normal");
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const texto = `Certifico que recebi do Sr(a). ${(nomePaciente || '').toUpperCase()} a importância supramencionada, em quitação aos serviços prestados em Fisioterapia e/ou Pilates${textoMes}.`;
    const linhas = doc.splitTextToSize(texto, 110);
    doc.text(linhas, 20, 85);
    doc.setFontSize(10);
    doc.text(`Chaval - CE, ${dataHoje}`, 74, 130, null, null, "center");
    doc.setDrawColor(...corTema); doc.setLineWidth(0.5); doc.line(30, 150, 118, 150);
    doc.setFontSize(9);
    doc.text("Edanios Belchior", 74, 155, null, null, "center");
    doc.save(`Recibo_Clinica_${nomePaciente}.pdf`);
    mostrarNotificacao("Recibo exportado para PDF.");
    const zap = (tel || '').replace(/\D/g, '');
    if (zap.length > 8) setTimeout(() => window.open(`https://wa.me/55${zap}?text=Olá! Segue seu recibo digital referente aos serviços da clínica.`, '_blank'), 1000);
};

// ==========================================================================
// 9. AGENDA CENTRALIZADA
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
        if (busca && !alunos.some(a => (a.nome || '').toLowerCase().includes(busca))) return;
        if (filtro === 'ocupados' && alunos.length === 0) return;
        if (filtro === 'livres' && alunos.length >= MAX_ALUNOS) return;

        let htmlAlunos = '';
        alunos.forEach((a, idx) => {
            let statusClass = '';
            if (a.presenca === 'presente') statusClass = 'presente';
            else if (a.presenca === 'falta') statusClass = 'falta';

            htmlAlunos += `
                <div class="aluno-item ${statusClass}">
                    <span style="font-family: var(--font-headline); font-weight: 600; font-size: 1.1rem;">${a.nome}</span>
                    <div>
                        <button onclick="confirmarAcao('REMOVER DA AGENDA?', 'Retirar aluno deste horário?', ()=>rmAgenda('${hora}', ${idx}))" style="color:var(--danger); background:transparent; font-size:1.2rem; border:none; padding:0; width:auto;">🗑️</button>
                    </div>
                </div>`;
        });

        let opts = `<option value="">+ INSERIR ALUNO NO HORÁRIO</option>`;
        listaClientes.forEach(c => {
            if (!agendadosHojeIds.includes(c.id)) {
                opts += `<option value="${c.id}|${c.nome}">${c.nome}</option>`;
            }
        });

        container.appendChild(document.createRange().createContextualFragment(`
            <div class="horario-card">
                <div class="horario-titulo"><span style="font-family: var(--font-mono);">${hora}</span><span style="color:var(--text-secondary); font-size: 0.9rem;">${alunos.length}/${MAX_ALUNOS} vagas</span></div>
                <div style="padding:15px 20px;">
                    ${htmlAlunos}
                    ${alunos.length < MAX_ALUNOS ? `
                        <div style="display:flex; gap:10px; margin-top:20px; align-items: center;">
                            <select id="sel-${hora}" style="flex:2">${opts}</select>
                            <button onclick="addAgenda('${hora}')" style="width:auto; padding: 10px 20px; font-size: 0.85rem;">SALVAR</button>
                        </div>` : `<div style="color:var(--danger); text-align:center; font-weight:bold; margin-top:15px; font-size:0.85rem; letter-spacing:1px;">TURMA LOTADA</div>`}
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

    if (jaAgendado) return alert("Atenção: Este aluno já possui um horário agendado para o mesmo dia.");

    const ref = doc(db, "agenda", diaAtualAgenda);
    const snap = await getDoc(ref);
    let dados = snap.exists() ? snap.data() : {};
    if (!dados[hora]) dados[hora] = [];
    dados[hora].push({ id, nome, presenca: null });
    await setDoc(ref, dados);
};

window.rmAgenda = async (hora, idx) => {
    const ref = doc(db, "agenda", diaAtualAgenda);
    const snap = await getDoc(ref);
    let dados = snap.data();
    dados[hora].splice(idx, 1);
    await updateDoc(ref, dados);
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
    if (titulo) titulo.innerText = `ROTEIRO DIÁRIO: ${diaHojeStr.toUpperCase()} - ${dataHojeFormatada}`;
    if (lista) lista.innerHTML = '';
    if (diaHojeStr === 'sabado' || diaHojeStr === 'domingo') {
        if (lista) lista.innerHTML = '<p style="text-align:center; padding:30px; font-style:italic; color:var(--text-muted); font-family:var(--font-headline); font-size: 1.2rem;">Final de semana reservado para descanso da equipe clínica.</p>';
        return;
    }
    const dadosDia = dbAgenda[diaHojeStr];
    if (!dadosDia) { if (lista) lista.innerHTML = '<p style="padding:20px;">Sincronizando livro de registros...</p>'; return; }
    const horariosOrdenados = Object.keys(dadosDia).sort();
    let temAluno = false;
    horariosOrdenados.forEach(hora => {
        const alunos = dadosDia[hora];
        if (Array.isArray(alunos) && alunos.length > 0) {
            temAluno = true;
            let nomes = alunos.map(a => {
                let estilo = ''; let icone = '';
                if (a.presenca === 'presente') { estilo = 'color:var(--success); font-weight:bold;'; icone = '✔️ '; }
                else if (a.presenca === 'falta') { estilo = 'color:var(--danger); text-decoration:line-through;'; icone = '✖️ '; }
                return `<span style="${estilo}">${icone}${a.nome}</span>`;
            }).join(' <span style="color:var(--border-strong); margin: 0 5px;">|</span> ');
            if (lista) lista.innerHTML += `
                <div class="card-agenda-hoje" style="background:var(--bg-input); padding:20px; border-left:4px solid var(--accent); margin-bottom:12px; display:flex; flex-direction:column; gap:5px; border-radius:var(--radius-sm); border: 1px solid var(--border-strong);">
                    <span style="font-size:1.2rem; font-weight:bold; color:var(--text-primary); font-family:var(--font-mono); letter-spacing:1px;">${hora}</span>
                    <div style="font-family:var(--font-headline); font-size: 1.1rem;">${nomes}</div>
                </div>`;
        }
    });
    if (!temAluno) { if (lista) lista.innerHTML = '<p style="text-align:center; padding:30px; color:var(--text-secondary); font-style:italic; font-family:var(--font-headline); font-size:1.1rem;">Agenda vazia para a data de hoje.</p>'; }
};

// ==========================================================================
// 10. FINANCEIRO GERAL E FLUXO DE CAIXA COMPLETO
// ==========================================================================

window.adicionarGasto = async () => {
    const desc = document.getElementById('descGasto').value;
    const val = document.getElementById('valorGasto').value;
    const cat = document.getElementById('catGasto').value;

    const isAgendado = document.getElementById('checkGastoFuturo').checked;
    const status = isAgendado ? 'agendado' : 'pago';

    await addDoc(collection(db, "gastos"), {
        desc,
        valor: val,
        categoria: cat,
        mesReferencia: inputMes.value,
        status: status
    });

    document.getElementById('descGasto').value = '';
    document.getElementById('valorGasto').value = '';
    document.getElementById('checkGastoFuturo').checked = false;

    mostrarNotificacao(isAgendado ? "Conta pendente registrada no cofre!" : "Saída de caixa computada!", "sucesso");
};

window.virarMes = () => mostrarNotificacao("Para visualizar ou trabalhar no novo mês, altere a Data Base no seletor no topo da tela.");

window.renderizarFinanceiro = () => {
    if (auth.currentUser && auth.currentUser.email !== EMAIL_ADMIN) return;

    const tbodyPagos = document.getElementById('tabelaGastos').querySelector('tbody');
    const tbodyFuturos = document.getElementById('tabelaGastosFuturos').querySelector('tbody');

    tbodyPagos.innerHTML = '';
    tbodyFuturos.innerHTML = '';

    let despesas = 0;
    let receitaGeral = 0;
    let receitaEquipe = 0;
    let totalPix = 0, totalDinheiro = 0, totalCartao = 0;

    Object.values(dbPagamentos).forEach(p => {
        const c = listaClientes.find(cli => cli.id === p.clienteId);
        if (c && p.status === 'pago') {
            const v = Number(p.valor || 0);

            if (c.professor === 'amanda') {
                receitaEquipe += v;
            } else {
                receitaGeral += v;
            }

            if (p.forma === 'pix') totalPix += v;
            else if (p.forma === 'dinheiro') totalDinheiro += v;
            else totalCartao += v;
        }
    });

    dbGastos.forEach(g => {
        const valorGasto = Number(g.valor);

        if (g.status === 'agendado') {
            tbodyFuturos.innerHTML += `
                <tr>
                    <td style="font-family:var(--font-headline); font-size:1.05rem;">${g.desc.toUpperCase()}</td>
                    <td style="color:var(--warning); font-family:var(--font-mono); font-weight:bold;">R$ ${g.valor}</td>
                    <td>
                        <button onclick="confirmarPagamentoGasto('${g.id}')" title="Liquidar Pagamento" style="background:var(--success); padding:8px; width:auto; border-radius:4px; font-size:0.8rem;">LIQUIDAR</button> 
                        <button onclick="rmGasto('${g.id}')" title="Cancelar Agendamento" style="background:var(--danger); padding:8px; width:auto; border-radius:4px; font-size:0.8rem;">CANCELAR</button>
                    </td>
                </tr>`;
        } else {
            despesas += valorGasto;
            tbodyPagos.innerHTML += `
                <tr>
                    <td style="font-family:var(--font-headline); font-size:1.05rem;">${g.desc.toUpperCase()}</td>
                    <td style="color:var(--text-secondary);">${g.categoria.toUpperCase()}</td>
                    <td style="color:var(--danger); font-family:var(--font-mono); font-weight:bold;">R$ ${g.valor}</td>
                    <td><button onclick="rmGasto('${g.id}')" class="btn-tool danger">🗑️</button></td>
                </tr>`;
        }
    });

    let receitaBrutaTotal = receitaGeral + receitaEquipe;
    let lucroReal = receitaBrutaTotal - despesas;

    if (document.getElementById('dashReceitaGeral')) document.getElementById('dashReceitaGeral').innerText = `R$ ${receitaGeral.toFixed(2)}`;
    if (document.getElementById('dashReceitaEquipe')) document.getElementById('dashReceitaEquipe').innerText = `R$ ${receitaEquipe.toFixed(2)}`;
    if (document.getElementById('dashDespesas')) document.getElementById('dashDespesas').innerText = `R$ ${despesas.toFixed(2)}`;
    if (document.getElementById('dashLucro')) document.getElementById('dashLucro').innerText = `R$ ${lucroReal.toFixed(2)}`;

    if (document.getElementById('valPix')) {
        document.getElementById('valPix').innerText = `R$ ${totalPix.toFixed(2)}`;
        document.getElementById('valDin').innerText = `R$ ${totalDinheiro.toFixed(2)}`;
        document.getElementById('valCar').innerText = `R$ ${totalCartao.toFixed(2)}`;
    }
};

window.confirmarPagamentoGasto = async (id) => {
    if (!confirm("Confirma que essa obrigação financeira foi liquidada? Ela será deduzida do caixa real.")) return;
    await updateDoc(doc(db, "gastos", id), { status: 'pago' });
    mostrarNotificacao("Obrigação liquidada com sucesso!");
}

window.rmGasto = async (id) => await deleteDoc(doc(db, "gastos", id));

// ==========================================================================
// 11. UTILITÁRIOS E NOTIFICAÇÕES DE SISTEMA
// ==========================================================================

window.mostrarNotificacao = (msg, tipo = 'sucesso') => {
    const antigo = document.querySelector('.snake-toast');
    if (antigo) antigo.remove();
    const toast = document.createElement('div');
    toast.className = `snake-toast ${tipo === 'erro' ? 'error' : ''}`;
    toast.innerHTML = `<span class="material-symbols-outlined">${tipo === 'erro' ? 'priority_high' : 'verified_user'}</span> <span style="font-family:var(--font-headline); font-size:1.1rem; padding-bottom:2px;">${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
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
    if (telaId === 'inicio') {
        document.body.classList.add('is-inicio-view');
    } else {
        document.body.classList.remove('is-inicio-view');
    }

    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));

    const target = document.getElementById(telaId);
    if (target) target.classList.add('ativa');

    document.querySelectorAll('.main-nav button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${telaId}'`)) {
            btn.classList.add('active');
        }
    });

    window.scrollTo(0, 0);
};

// ==========================================================================
// 12. UI/UX: FAB & CHANGELOG 
// ==========================================================================

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

const changelogData = [
    {
        title: "SINCRONIZAÇÃO HISTÓRICA ATIVA 🔄",
        desc: "Implementamos um motor de varredura automatizado que puxa os pagamentos antigos gerados antes da consolidação do painel de equipe. Quaisquer faturas pagas anteriormente são alinhadas ao mês histórico de forma retroativa.",
        target: 'admin'
    }
];

window.checkChangelog = (isAdmin) => {
    const seen = localStorage.getItem('changelog_seen_version');
    if (seen === VERSAO_ATUAL) return;

    activeChangelogList = changelogData.filter(slide => {
        if (slide.target === 'all') return true;
        if (isAdmin && slide.target === 'admin') return true;
        return false;
    });

    if (activeChangelogList.length === 0) return;

    const ua = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const deviceText = isMobile ? "MOBILE ACESSANDO" : "DESKTOP ACESSANDO";
    document.getElementById('deviceBadge').innerText = deviceText;

    currentSlide = 0;
    renderChangelogSlide();
    document.getElementById('modalChangelog').style.display = 'flex';
};

function renderChangelogSlide() {
    if (activeChangelogList.length === 0) return;

    const content = document.getElementById('changelogContent');
    const slide = activeChangelogList[currentSlide];

    content.innerHTML = `
        <h2 style="color:var(--primary); font-family:var(--font-headline); margin-bottom:15px; font-size: 1.6rem;">${slide.title}</h2>
        <p style="color:var(--text-secondary); font-family:var(--font-body); line-height:1.7; font-size:1.05rem;">${slide.desc}</p>
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

// ==========================================================================
// 13. GESTÃO DA AMANDA E FINANÇAS DA EQUIPE
// ==========================================================================

window.salvarTaxaAmanda = () => {
    const input = document.getElementById('amandaTaxa');
    if (input && input.value) {
        taxaAmandaGlob = Number(input.value);
        localStorage.setItem('taxaAmandaGlob', taxaAmandaGlob);
        renderizarAreaAmanda();
        mostrarNotificacao(`Taxa de repasse da equipe salva: ${taxaAmandaGlob}%`);
    }
}

window.filtrarSelectAmanda = () => {
    const inputBusca = document.getElementById('buscaAmandaAdd');
    const termo = inputBusca ? inputBusca.value.toLowerCase() : '';
    const sel = document.getElementById('selectAlunoAmanda');
    if (!sel) return;

    sel.innerHTML = '<option value="">-- SELECIONE O ALUNO NA LISTA GERAL --</option>';

    const filtrados = listaClientes.filter(c => {
        const isNotAmanda = c.professor !== 'amanda';
        const nomeStr = c.nome ? c.nome.toLowerCase() : '';
        return isNotAmanda && nomeStr.includes(termo);
    }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    filtrados.forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.nome || 'Sem Nome'}</option>`;
    });
};

window.filtrarAmanda = (tipo) => {
    filtroAtualAmanda = tipo;
    document.querySelectorAll('#amanda .btn-filtro').forEach(b => b.classList.remove('active'));
    let idBtn = tipo === 'todos' ? 'btnFiltroAmandaTodos' : (tipo === 'pendente' ? 'btnFiltroAmandaPendente' : 'btnFiltroAmandaPago');
    if (document.getElementById(idBtn)) document.getElementById(idBtn).classList.add('active');
    renderizarAreaAmanda();
};

window.renderizarAreaAmanda = () => {
    window.filtrarSelectAmanda();

    const taxaInput = document.getElementById('amandaTaxa');
    if (taxaInput) taxaInput.value = taxaAmandaGlob;

    const tbody = document.getElementById('tabelaAmanda').querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const termoBusca = document.getElementById('inputBuscaAmanda') ? document.getElementById('inputBuscaAmanda').value.toLowerCase() : '';
    let totalAlunos = 0;
    let receitaBrutaAmanda = 0;

    listaClientes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    listaClientes.forEach(c => {
        if (c.professor === 'amanda') {
            const pg = dbPagamentos[c.id] || { status: 'pendente', forma: '', valor: c.valorContrato || 0 };

            totalAlunos++;
            if (pg.status === 'pago') {
                receitaBrutaAmanda += Number(pg.valor || 0);
            }

            if (termoBusca && c.nome && !c.nome.toLowerCase().includes(termoBusca)) return;
            if (filtroAtualAmanda !== 'todos' && pg.status !== filtroAtualAmanda) return;

            let horariosDoAluno = [];
            Object.keys(dbAgenda).forEach(dia => {
                const horas = dbAgenda[dia];
                Object.keys(horas).forEach(hora => {
                    if (Array.isArray(horas[hora])) {
                        if (horas[hora].some(a => a.id === c.id)) {
                            horariosDoAluno.push(`<b>${dia.toUpperCase()}</b> | ${hora}`);
                        }
                    }
                });
            });

            const displayHorarios = horariosDoAluno.length > 0 ? horariosDoAluno.join('<br>') : '<i style="color:var(--text-muted); font-family:var(--font-body);">Sem agenda.</i>';
            const displayServico = c.nomeServico || "-";

            tbody.innerHTML += `
                <tr>
                    <td style="font-family:var(--font-headline); font-size:1.1rem;"><strong>${(c.nome || 'Sem Nome').toUpperCase()}</strong></td>
                    <td>
                        <select onchange="atualizarPg('${c.id}', 'status', this.value)" style="width:100%; font-weight:bold; ${pg.status === 'pago' ? 'color:var(--success); border-color:var(--success);' : 'color:var(--warning); border-color:var(--warning);'}">
                            <option value="pendente" ${pg.status === 'pendente' ? 'selected' : ''}>PENDENTE</option>
                            <option value="pago" ${pg.status === 'pago' ? 'selected' : ''}>PAGO</option>
                        </select>
                    </td>
                    <td>
                        <select onchange="atualizarPg('${c.id}', 'forma', this.value)">
                            <option value="" disabled ${!pg.forma ? 'selected' : ''}>---</option>
                            <option value="pix" ${pg.forma === 'pix' ? 'selected' : ''}>PIX</option>
                            <option value="dinheiro" ${pg.forma === 'dinheiro' ? 'selected' : ''}>DINHEIRO</option>
                            <option value="cartao" ${pg.forma === 'cartao' ? 'selected' : ''}>CARTÃO</option>
                        </select>
                    </td>
                    <td>
                        <span style="font-weight:600; color:var(--accent); font-size:0.9rem;">${displayServico}</span><br>
                        <span style="font-family: var(--font-mono); font-size: 0.8rem;">${displayHorarios}</span>
                    </td>
                    <td>
                        <button class="btn-tool danger" title="Desvincular Aluno da Equipe" onclick="removerAlunoAmanda('${c.id}')" style="width: auto; padding: 0 15px; font-size: 0.8rem; font-family: var(--font-body);">REMOVER DA EQUIPE</button>
                    </td>
                </tr>
            `;
        }
    });

    let salarioReal = receitaBrutaAmanda * (taxaAmandaGlob / 100);

    if (document.getElementById('statAmandaAlunos')) document.getElementById('statAmandaAlunos').innerText = totalAlunos;
    if (document.getElementById('statAmandaReceita')) document.getElementById('statAmandaReceita').innerText = `R$ ${receitaBrutaAmanda.toFixed(2)}`;
    if (document.getElementById('statAmandaSalario')) document.getElementById('statAmandaSalario').innerText = `R$ ${salarioReal.toFixed(2)}`;
};

window.vincularAlunoAmanda = async () => {
    const id = document.getElementById('selectAlunoAmanda').value;
    if (!id) return mostrarNotificacao("Selecione um aluno primeiro!", "erro");

    await updateDoc(doc(db, "clientes", id), { professor: 'amanda' });

    const inputBusca = document.getElementById('buscaAmandaAdd');
    if (inputBusca) inputBusca.value = '';

    mostrarNotificacao("Aluno delegado à carteira da equipe com sucesso!");
};

window.removerAlunoAmanda = async (id) => {
    if (!confirm("Retirar este aluno da equipe? Ele voltará para a carteira geral da clínica.")) return;

    await updateDoc(doc(db, "clientes", id), { professor: null });
    mostrarNotificacao("Aluno devolvido à carteira geral.");
};

window.lancarSalarioEquipe = async () => {
    let receitaBrutaAmanda = 0;
    Object.values(dbPagamentos).forEach(pg => {
        const c = listaClientes.find(cli => cli.id === pg.clienteId);
        if (c && c.professor === 'amanda' && pg.status === 'pago') {
            receitaBrutaAmanda += Number(pg.valor || 0);
        }
    });

    let salarioCalculado = receitaBrutaAmanda * (taxaAmandaGlob / 100);

    if (salarioCalculado <= 0) return mostrarNotificacao("Não há comissão para ser lançada com base nos pagamentos recebidos.", "erro");

    const jaLancado = dbGastos.some(g =>
        g.desc.toUpperCase() === "SALÁRIO AMANDA (COMISSÃO DA EQUIPE)" &&
        g.mesReferencia === inputMes.value
    );

    let mensagem = `Deseja registrar o valor de R$ ${salarioCalculado.toFixed(2)} nas despesas pagas do mês?`;
    if (jaLancado) {
        mensagem = `Atenção: Já existe um lançamento de "Salário Amanda" neste mês. Tem certeza que deseja lançar novamente o valor de R$ ${salarioCalculado.toFixed(2)}?`;
    }

    if (confirm(mensagem)) {
        await addDoc(collection(db, "gastos"), {
            desc: "SALÁRIO AMANDA (COMISSÃO DA EQUIPE)",
            categoria: "pessoal",
            valor: salarioCalculado.toFixed(2),
            mesReferencia: inputMes.value,
            status: 'pago'
        });
        mostrarNotificacao("Comissão da equipe abatida no Caixa Líquido com sucesso!");
    }
};
