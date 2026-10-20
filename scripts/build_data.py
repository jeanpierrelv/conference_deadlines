"""Gera data/conferences.json a partir do ccfddl + Qualis CAPES.

Uso:
    uv run scripts/build_data.py                  # baixa do ccfddl e gera o JSON
    uv run scripts/build_data.py --relatorio      # também lista casamentos Qualis suspeitos
    uv run scripts/build_data.py --entrada allconf.yml   # usa um arquivo local
"""
import argparse
import csv
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CCFDDL_URL = "https://ccfddl.com/conference/allconf.yml"
SAIDA = DATA / "conferences.json"
SAIDA_JS = DATA / "conferences.js"

# Arquivos Qualis, do mais recente para o mais antigo: o primeiro que tiver o evento vence.
QUALIS_FILES = [
    ("2017-2020", DATA / "qualis" / "eventos_2017_2020.csv"),
]

AREAS = {
    "AI": "Inteligência Artificial",
    "CG": "Computação Gráfica e Multimídia",
    "CT": "Teoria da Computação",
    "DB": "Banco de Dados e Mineração de Dados",
    "DS": "Arquitetura, Sistemas Paralelos e Distribuídos",
    "HI": "Interação Humano-Computador",
    "MX": "Interdisciplinar",
    "NW": "Redes de Computadores",
    "SC": "Segurança",
    "SE": "Engenharia de Software e Linguagens",
}

FORMATO_DATA = "%Y-%m-%d %H:%M:%S"
FUSOS_NOMEADOS = {"PT": "America/Los_Angeles", "ET": "America/New_York", "CET": "Europe/Paris"}


def normalizar(sigla: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(sigla).upper())


def chave(conf: dict) -> str:
    return f"{conf['sub']}/{conf['title']}"


def fuso(nome: str | None) -> timezone | ZoneInfo:
    """Converte os fusos usados no ccfddl (AoE, UTC-12, UTC+8, PT...) em tzinfo."""
    nome = (nome or "AoE").strip()
    if nome.upper() == "AOE":
        return timezone(timedelta(hours=-12))
    m = re.fullmatch(r"(?:UTC|GMT)\s*(?:([+-])(\d{1,2})(?::?(\d{2}))?)?", nome, re.IGNORECASE)
    if m:
        if not m.group(1):
            return timezone.utc
        delta = timedelta(hours=int(m.group(2)), minutes=int(m.group(3) or 0))
        return timezone(delta if m.group(1) == "+" else -delta)
    try:
        return ZoneInfo(FUSOS_NOMEADOS.get(nome.upper(), nome))
    except Exception:
        print(f"Aviso: fuso desconhecido '{nome}', usando AoE", file=sys.stderr)
        return timezone(timedelta(hours=-12))


def para_utc(valor, tz) -> datetime | None:
    try:
        return datetime.strptime(str(valor).strip(), FORMATO_DATA).replace(tzinfo=tz).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def iso(dt: datetime | None) -> str | None:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def prazos_da_edicao(edicao: dict) -> list[dict]:
    tz = fuso(edicao.get("timezone"))
    prazos = []
    for item in edicao.get("timeline") or []:
        for campo, tipo in (("abstract_deadline", "abstract"), ("deadline", "paper")):
            if campo not in item:
                continue
            quando = para_utc(item[campo], tz)
            prazos.append({
                "tipo": tipo,
                "em": iso(quando),
                "tbd": quando is None,
                "comentario": item.get("comment"),
                "_dt": quando,
            })
    return prazos


def estimar_proximo(edicoes: list[dict], ano_alvo: int) -> datetime | None:
    """Estima o próximo prazo deslocando o último prazo conhecido para o ano alvo."""
    for edicao in reversed(edicoes):
        papers = [p["_dt"] for p in prazos_da_edicao(edicao) if p["tipo"] == "paper" and p["_dt"]]
        if papers:
            ultimo = min(papers)
            try:
                return ultimo.replace(year=ultimo.year + (ano_alvo - int(edicao["year"])))
            except ValueError:  # 29 de fevereiro
                return ultimo.replace(year=ultimo.year + (ano_alvo - int(edicao["year"])), day=28)
    return None


def processar(conf: dict, agora: datetime) -> dict | None:
    edicoes = sorted(conf.get("confs") or [], key=lambda e: int(e.get("year", 0)))
    if not edicoes:
        return None

    escolhida, proximo = None, None
    for edicao in edicoes:
        futuros = [p["_dt"] for p in prazos_da_edicao(edicao) if p["_dt"] and p["_dt"] > agora]
        if futuros and (proximo is None or min(futuros) < proximo):
            escolhida, proximo = edicao, min(futuros)

    estimado = None
    if escolhida:
        status = "aberto"
    else:
        escolhida = edicoes[-1]
        prazos = prazos_da_edicao(escolhida)
        if not prazos or any(p["tbd"] for p in prazos):
            status = "tbd"
            estimado = estimar_proximo(edicoes[:-1], int(escolhida["year"]))
        else:
            status = "encerrado"
            anos = [int(e["year"]) for e in edicoes]
            intervalo = anos[-1] - anos[-2] if len(anos) > 1 and anos[-1] - anos[-2] in (1, 2) else 1
            estimado = estimar_proximo(edicoes, anos[-1] + intervalo)

    prazos = [{k: v for k, v in p.items() if k != "_dt" and v is not None and v is not False}
              for p in prazos_da_edicao(escolhida)]
    return {
        "titulo": str(conf["title"]),
        "descricao": conf.get("description") or str(conf["title"]),
        "area": conf.get("sub"),
        "rank": {k: (v if v not in (None, "N") else None) for k, v in (conf.get("rank") or {}).items()},
        "dblp": conf.get("dblp") if conf.get("dblp") not in (None, "N", "NO DBLP") else None,
        "ano": escolhida.get("year"),
        "link": escolhida.get("link"),
        "data": escolhida.get("date"),
        "local": escolhida.get("place"),
        "fuso": escolhida.get("timezone"),
        "prazos": prazos,
        "proximo": iso(proximo),
        "estimado": iso(estimado),
        "status": status,
    }


def carregar_qualis() -> dict[str, dict]:
    tabela: dict[str, dict] = {}
    for periodo, caminho in reversed(QUALIS_FILES):  # o mais recente sobrescreve
        with open(caminho, encoding="utf-8") as f:
            for linha in csv.DictReader(f):
                tabela[normalizar(linha["sigla"])] = {**linha, "periodo": periodo}
    return tabela


def casar_qualis(conf: dict, tabela: dict, aliases: dict) -> dict | None:
    k = chave(conf)
    if k in aliases:
        return tabela.get(normalizar(aliases[k])) if aliases[k] else None
    return tabela.get(normalizar(conf["title"]))


def relatorio(confs: list[dict], tabela: dict, aliases: dict) -> None:
    """Lista casamentos com nomes pouco parecidos e conferências relevantes sem Qualis."""
    ignorar = {"international", "conference", "symposium", "workshop", "annual", "ieee", "acm", "and", "the", "on", "of"}
    palavras = lambda s: {w for w in re.findall(r"[a-z]+", s.lower()) if len(w) > 2 and w not in ignorar}
    print("\n== Casamentos com nomes pouco parecidos (confira e ajuste aliases.yml) ==")
    for c in confs:
        q = casar_qualis(c, tabela, aliases)
        if q and chave(c) not in aliases:
            a, b = palavras(c.get("description", "")), palavras(q["nome"])
            if len(a & b) / max(1, len(a | b)) < 0.34:
                print(f"  {chave(c):28} {c.get('description', '')[:55]:55} ≠ {q['sigla']}: {q['nome'][:55]} ({q['estrato']})")
    print("\n== Sem Qualis, mas CCF A/B ou CORE A*/A ==")
    for c in confs:
        r = c.get("rank") or {}
        if not casar_qualis(c, tabela, aliases) and (r.get("ccf") in ("A", "B") or r.get("core") in ("A*", "A")):
            print(f"  {chave(c):28} {c.get('description', '')[:70]}  [CCF {r.get('ccf')}, CORE {r.get('core')}]")


def carregar_yaml(caminho: Path, padrao):
    if not caminho.exists():
        return padrao
    with open(caminho, encoding="utf-8") as f:
        return yaml.safe_load(f) or padrao


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--entrada", help="arquivo allconf.yml local (padrão: baixa do ccfddl)")
    parser.add_argument("--relatorio", action="store_true", help="mostra casamentos Qualis suspeitos")
    args = parser.parse_args()

    if args.entrada:
        texto = Path(args.entrada).read_text(encoding="utf-8")
    else:
        req = urllib.request.Request(CCFDDL_URL, headers={"User-Agent": "projeto-deadlines"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            texto = resp.read().decode("utf-8")

    confs = yaml.safe_load(texto) + carregar_yaml(DATA / "extra_conferences.yml", [])
    tabela = carregar_qualis()
    aliases = carregar_yaml(DATA / "qualis" / "aliases.yml", {})
    grupo = carregar_yaml(DATA / "grupo.yml", {})
    do_grupo = {str(t).upper() for t in grupo.get("conferencias", [])}

    agora = datetime.now(timezone.utc)
    saida = []
    for conf in confs:
        item = processar(conf, agora)
        if not item:
            continue
        q = casar_qualis(conf, tabela, aliases)
        item["qualis"] = {"estrato": q["estrato"], "sigla": q["sigla"], "nome": q["nome"], "periodo": q["periodo"]} if q else None
        item["grupo"] = item["titulo"].upper() in do_grupo or chave(conf).upper() in do_grupo
        saida.append(item)

    saida.sort(key=lambda c: (c["proximo"] or c["estimado"] or "9999", c["titulo"].lower()))
    conteudo = json.dumps({
        "gerado_em": iso(agora),
        "fonte": CCFDDL_URL,
        "grupo": grupo.get("nome"),
        "areas": AREAS,
        "qualis_periodos": [p for p, _ in QUALIS_FILES],
        "conferencias": saida,
    }, ensure_ascii=False, separators=(",", ":"))
    SAIDA.write_text(conteudo, encoding="utf-8")
    # Mesmo conteúdo como <script>, para o index.html funcionar aberto direto do disco (file://)
    SAIDA_JS.write_text(f"window.DADOS_CONFERENCIAS = {conteudo};\n", encoding="utf-8")

    abertas = sum(c["status"] == "aberto" for c in saida)
    com_qualis = sum(bool(c["qualis"]) for c in saida)
    print(f"{len(saida)} conferências ({abertas} com prazo aberto, {com_qualis} com Qualis) -> {SAIDA.relative_to(ROOT)}")

    if args.relatorio:
        relatorio(confs, tabela, aliases)


if __name__ == "__main__":
    main()
