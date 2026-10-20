// Dados gerados diariamente por scripts/build_data.py (GitHub Action)
const DATA_URL = "data/conferences.json";

const QUALIS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
const CORE = ["A*", "A", "B", "C"];
const CCF = ["A", "B", "C"];
const DIA = 24 * 60 * 60 * 1000;

const estado = {
  dados: null,
  favoritas: new Set(lerFavoritas()),
  filtros: { busca: "", visao: "todas", areas: new Set(), qualis: "", core: "", ccf: "", ordem: "prazo", todas: false },
};

// ---------- utilitários ----------

/** Cria um elemento; filhos podem ser strings (inseridas como texto, sem risco de XSS). */
function el(tag, attrs = {}, ...filhos) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) {
    if (f == null || f === false) continue;
    node.append(f instanceof Node ? f : String(f));
  }
  return node;
}

function lerFavoritas() {
  try { return JSON.parse(localStorage.getItem("favoritas") || "[]"); } catch { return []; }
}

function salvarFavoritas() {
  try { localStorage.setItem("favoritas", JSON.stringify([...estado.favoritas])); } catch { /* modo privado */ }
}

/** Posição numa escala (menor = melhor); fora da escala vai para o fim. */
function posicao(escala, valor) {
  const i = escala.indexOf(valor);
  return i === -1 ? escala.length : i;
}

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" });

function contagem(ms) {
  if (ms <= 0) return "prazo encerrado";
  const d = Math.floor(ms / DIA);
  const h = Math.floor((ms / 3600000) % 24);
  const m = Math.floor((ms / 60000) % 60);
  const s = Math.floor((ms / 1000) % 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
}

function classeUrgencia(ms) {
  if (ms <= 0) return "encerrado";
  if (ms < 7 * DIA) return "urgente";
  if (ms < 30 * DIA) return "breve";
  return "tranquilo";
}

const id = (c) => `${c.area}/${c.titulo}`;
const tipoPrazo = (p) => (p.tipo === "abstract" ? "Abstract" : "Paper") + (p.comentario ? ` · ${p.comentario}` : "");

/** Data usada para ordenar: próximo prazo real, senão o estimado (se ainda no futuro). */
function dataReferencia(c, agora) {
  if (c.status === "aberto") {
    return Math.min(...c.prazos.filter((p) => p.em && Date.parse(p.em) > agora).map((p) => Date.parse(p.em)));
  }
  const est = c.estimado ? Date.parse(c.estimado) : NaN;
  return est > agora ? est : Infinity;
}

// ---------- filtros e URL ----------

function filtrar(confs) {
  const f = estado.filtros;
  const termo = f.busca.trim().toLowerCase();
  return confs.filter((c) => {
    if (!f.todas && c.status !== "aberto") return false;
    if (f.visao === "grupo" && !c.grupo) return false;
    if (f.visao === "favoritas" && !estado.favoritas.has(id(c))) return false;
    if (f.areas.size && !f.areas.has(c.area)) return false;
    if (f.qualis && posicao(QUALIS, c.qualis?.estrato) > posicao(QUALIS, f.qualis)) return false;
    if (f.core && posicao(CORE, c.rank.core) > posicao(CORE, f.core)) return false;
    if (f.ccf && posicao(CCF, c.rank.ccf) > posicao(CCF, f.ccf)) return false;
    if (termo) {
      const texto = [c.titulo, c.descricao, c.local, c.qualis?.sigla].join(" ").toLowerCase();
      if (!texto.includes(termo)) return false;
    }
    return true;
  });
}

function ordenar(confs) {
  const agora = Date.now();
  const porPrazo = (a, b) => dataReferencia(a, agora) - dataReferencia(b, agora) || a.titulo.localeCompare(b.titulo);
  const criterios = {
    prazo: porPrazo,
    qualis: (a, b) => posicao(QUALIS, a.qualis?.estrato) - posicao(QUALIS, b.qualis?.estrato) || porPrazo(a, b),
    nome: (a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity: "base" }),
  };
  return [...confs].sort(criterios[estado.filtros.ordem] || porPrazo);
}

function lerURL() {
  const p = new URLSearchParams(location.search);
  const f = estado.filtros;
  f.busca = p.get("q") || "";
  f.visao = ["grupo", "favoritas"].includes(p.get("visao")) ? p.get("visao") : "todas";
  f.areas = new Set((p.get("areas") || "").split(",").filter(Boolean));
  f.qualis = p.get("qualis") || "";
  f.core = p.get("core") || "";
  f.ccf = p.get("ccf") || "";
  f.ordem = p.get("ordem") || "prazo";
  f.todas = p.get("todas") === "1";
}

function escreverURL() {
  const f = estado.filtros;
  const p = new URLSearchParams();
  if (f.busca) p.set("q", f.busca);
  if (f.visao !== "todas") p.set("visao", f.visao);
  if (f.areas.size) p.set("areas", [...f.areas].join(","));
  if (f.qualis) p.set("qualis", f.qualis);
  if (f.core) p.set("core", f.core);
  if (f.ccf) p.set("ccf", f.ccf);
  if (f.ordem !== "prazo") p.set("ordem", f.ordem);
  if (f.todas) p.set("todas", "1");
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

// ---------- renderização ----------

function celulaPrazo(c) {
  const td = el("td", { class: "td-prazo" });
  const agora = Date.now();
  const futuros = c.prazos.filter((p) => p.em && Date.parse(p.em) > agora);

  if (futuros.length) {
    const prox = futuros.reduce((a, b) => (Date.parse(a.em) <= Date.parse(b.em) ? a : b));
    const quando = new Date(prox.em);
    td.append(
      el("div", { class: "prazo-data", title: `UTC: ${prox.em} · fuso original: ${c.fuso || "AoE"}` }, fmtData.format(quando)),
      el("div", { class: "prazo-tipo" }, tipoPrazo(prox)),
      el("div", { class: "countdown", "data-deadline": prox.em }),
    );
  } else {
    const rotulo = c.status === "tbd" ? "Prazo a definir (TBD)" : `Submissões ${c.ano} encerradas`;
    td.append(el("div", { class: "prazo-data encerrado" }, rotulo));
    if (c.estimado && Date.parse(c.estimado) > agora) {
      td.append(el("div", { class: "prazo-tipo", title: "Mesma data da edição anterior — apenas referência" },
        `estimado: ~${fmtMes.format(new Date(c.estimado))}`));
    }
  }

  const outros = c.prazos.filter((p) => p.em);
  if (outros.length > 1) {
    td.append(el("details", { class: "outros" },
      el("summary", {}, `todos os prazos (${outros.length})`),
      el("ul", {}, outros.map((p) => el("li", {}, `${tipoPrazo(p)}: ${fmtData.format(new Date(p.em))}`))),
    ));
  }
  return td;
}

function celulaRankings(c) {
  const badges = [];
  if (c.qualis) {
    badges.push(el("span", {
      class: `badge qualis-${c.qualis.estrato[0]}`,
      title: `Qualis CAPES ${c.qualis.periodo} — ${c.qualis.sigla}: ${c.qualis.nome}`,
    }, `Qualis ${c.qualis.estrato}`));
  }
  if (c.rank.core) badges.push(el("span", { class: "badge", title: "CORE (Austrália)" }, `CORE ${c.rank.core}`));
  if (c.rank.ccf) badges.push(el("span", { class: "badge", title: "CCF (China)" }, `CCF ${c.rank.ccf}`));
  if (c.rank.thcpl) badges.push(el("span", { class: "badge", title: "TH-CPL (Tsinghua)" }, `TH ${c.rank.thcpl}`));
  return el("td", {}, el("div", { class: "ranks" }, badges.length ? badges : el("span", { class: "badge" }, "—")));
}

function linha(c) {
  const fav = estado.favoritas.has(id(c));
  const areaNome = estado.dados.areas[c.area] || c.area;
  const buscaQualis = c.qualis?.sigla || c.titulo;

  return el("tr", { class: c.status === "aberto" ? null : "encerrada" },
    el("td", { class: "td-fav" },
      el("button", {
        class: "fav", "aria-pressed": String(fav), "aria-label": `Favoritar ${c.titulo}`, title: "Favoritar",
        onclick: () => alternarFavorita(c),
      }, fav ? "♥" : "♡"),
    ),
    el("td", {},
      el("div", {},
        el("span", { class: "sigla" }, c.titulo),
        el("span", { class: "tag", title: areaNome }, c.area),
        c.grupo && el("span", { class: "tag grupo", title: "Interesse do grupo" }, "⭐ grupo"),
      ),
      el("div", { class: "desc" }, c.descricao),
    ),
    celulaPrazo(c),
    el("td", { class: "evento" },
      el("div", {}, c.data || "—"),
      el("div", { class: "local" }, c.local || ""),
    ),
    celulaRankings(c),
    el("td", {},
      el("div", { class: "links" },
        c.link && el("a", { href: c.link, target: "_blank", rel: "noopener noreferrer" }, "🔗 site"),
        c.dblp && el("a", { href: `https://dblp.org/db/conf/${c.dblp}/`, target: "_blank", rel: "noopener noreferrer" }, "📚 dblp"),
        el("a", { href: `https://qualis.pages.dev/eventos?q=${encodeURIComponent(buscaQualis)}`, target: "_blank", rel: "noopener noreferrer", title: "Conferir Qualis mais recente" }, "🏷️ qualis"),
        c.status === "aberto" && el("button", { type: "button", onclick: () => baixarICS([c], `${c.titulo}-${c.ano}.ics`) }, "📆 .ics"),
      ),
    ),
  );
}

function renderizar() {
  const tbody = document.querySelector("#tabela tbody");
  const visiveis = ordenar(filtrar(estado.dados.conferencias));
  tbody.replaceChildren(...(visiveis.length
    ? visiveis.map(linha)
    : [el("tr", {}, el("td", { colspan: "6", class: "vazio" }, "Nenhuma conferência com esses filtros."))]));

  const abertas = visiveis.filter((c) => c.status === "aberto").length;
  document.getElementById("contagem").textContent =
    `${visiveis.length} conferência${visiveis.length === 1 ? "" : "s"}` + (estado.filtros.todas ? ` · ${abertas} com prazo aberto` : "");
  document.getElementById("exportar").disabled = abertas === 0;
  atualizarContagens();
}

function atualizarContagens() {
  const agora = Date.now();
  document.querySelectorAll(".countdown[data-deadline]").forEach((cell) => {
    const ms = Date.parse(cell.dataset.deadline) - agora;
    cell.textContent = contagem(ms);
    cell.className = `countdown ${classeUrgencia(ms)}`;
  });
}

function alternarFavorita(c) {
  const k = id(c);
  estado.favoritas.has(k) ? estado.favoritas.delete(k) : estado.favoritas.add(k);
  salvarFavoritas();
  renderizar();
}

// ---------- calendário (.ics) ----------

function baixarICS(confs, nomeArquivo) {
  const agora = Date.now();
  const stamp = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d+/, "");
  const escapar = (s) => String(s).replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const eventos = confs.flatMap((c) => c.prazos
    .filter((p) => p.em && Date.parse(p.em) > agora)
    .map((p, i) => [
      "BEGIN:VEVENT",
      `UID:${escapar(`${c.area}-${c.titulo}-${c.ano}-${p.tipo}-${i}`).replace(/\s/g, "")}@deadlines`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(p.em)}`,
      `DTEND:${stamp(p.em)}`,
      `SUMMARY:${escapar(`[${c.titulo} ${c.ano}] ${tipoPrazo(p)} deadline`)}`,
      `DESCRIPTION:${escapar(`${c.descricao}\n${c.link || ""}`)}`,
      c.link ? `URL:${c.link}` : null,
      "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", "DESCRIPTION:Deadline em 7 dias", "END:VALARM",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n")));

  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PRISMA Unesp//Deadlines//PT", ...eventos, "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  el("a", { href: url, download: nomeArquivo }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- controles ----------

function montarControles() {
  const f = estado.filtros;

  const busca = document.getElementById("busca");
  busca.value = f.busca;
  busca.addEventListener("input", () => { f.busca = busca.value; escreverURL(); renderizar(); });

  document.querySelectorAll("[data-visao]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.visao === f.visao));
    btn.addEventListener("click", () => {
      f.visao = btn.dataset.visao;
      document.querySelectorAll("[data-visao]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      escreverURL(); renderizar();
    });
  });

  const areas = document.getElementById("areas");
  for (const [sigla, nome] of Object.entries(estado.dados.areas)) {
    const btn = el("button", { type: "button", title: nome, "aria-pressed": String(f.areas.has(sigla)) },
      sigla, el("span", { class: "chip-nome" }, ` · ${nome}`));
    btn.addEventListener("click", () => {
      f.areas.has(sigla) ? f.areas.delete(sigla) : f.areas.add(sigla);
      btn.setAttribute("aria-pressed", String(f.areas.has(sigla)));
      escreverURL(); renderizar();
    });
    areas.append(btn);
  }

  for (const [campo, elId] of [["qualis", "f-qualis"], ["core", "f-core"], ["ccf", "f-ccf"], ["ordem", "f-ordem"]]) {
    const select = document.getElementById(elId);
    select.value = f[campo];
    select.addEventListener("change", () => { f[campo] = select.value; escreverURL(); renderizar(); });
  }

  const todas = document.getElementById("f-todas");
  todas.checked = f.todas;
  todas.addEventListener("change", () => { f.todas = todas.checked; escreverURL(); renderizar(); });

  document.getElementById("exportar").addEventListener("click", () => {
    const abertas = ordenar(filtrar(estado.dados.conferencias)).filter((c) => c.status === "aberto");
    baixarICS(abertas, "deadlines.ics");
  });
}

// ---------- início ----------

async function iniciar() {
  try {
    // data/conferences.js (carregado no index.html) funciona até em file://; o JSON é o plano B
    if (window.DADOS_CONFERENCIAS) {
      estado.dados = window.DADOS_CONFERENCIAS;
    } else {
      const resp = await fetch(DATA_URL, { cache: "no-cache" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      estado.dados = await resp.json();
    }
  } catch (e) {
    console.error("Erro ao carregar os dados:", e);
    document.querySelector("#tabela tbody").replaceChildren(
      el("tr", {}, el("td", { colspan: "6", class: "vazio" }, `Não foi possível carregar ${DATA_URL} (${e.message}).`)));
    document.getElementById("meta").textContent = "";
    return;
  }

  const d = estado.dados;
  // O JSON é gerado 1x por dia: um prazo "aberto" pode ter vencido desde então
  const agora = Date.now();
  for (const c of d.conferencias) {
    if (c.status === "aberto" && !c.prazos.some((p) => p.em && Date.parse(p.em) > agora)) c.status = "encerrado";
  }
  const atualizado = fmtData.format(new Date(d.gerado_em));
  document.getElementById("meta").textContent =
    `${d.conferencias.length} conferências · Qualis ${d.qualis_periodos.join(", ")} · atualizado em ${atualizado}`;

  lerURL();
  montarControles();
  renderizar();
  setInterval(atualizarContagens, 1000);
}

iniciar();
