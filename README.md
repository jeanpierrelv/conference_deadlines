# 📅 Deadlines de Conferências

Site estático com os prazos de submissão de conferências de Computação, com rankings
**Qualis CAPES**, **CORE**, **CCF** e **TH-CPL**. Mantido pelo IA Research Group, PRISMA — Unesp.

## Como funciona

```
ccfddl (allconf.yml) ─┐
data/extra_conferences.yml ─┤
data/qualis/*.csv ──────────┼─► scripts/build_data.py ─► data/conferences.json ─► index.html + script.js
data/qualis/aliases.yml ────┤        (GitHub Action diário)
data/grupo.yml ─────────────┘
```

- **Prazos**: [ccfddl/ccf-deadlines](https://github.com/ccfddl/ccf-deadlines) — ~380 conferências em 10 áreas.
  Os fusos (AoE, UTC±N, PT…) são convertidos para UTC e exibidos no fuso de quem acessa.
- **Qualis**: [classificação oficial de eventos da CAPES — Computação](https://www.gov.br/capes/pt-br/acesso-a-informacao/acoes-e-programas/avaliacao/sobre-a-avaliacao/areas-avaliacao/sobre-as-areas-de-avaliacao/colegio-de-ciencias-exatas-tecnologicas-e-multidisciplinar/ciencias-exatas-e-da-terra/ciencia-da-computacao)
  (2017-2020, 1405 eventos). A lista 2021-2024 de eventos não foi publicada como planilha pela CAPES;
  cada conferência tem um link para conferir em [qualis.pages.dev](https://qualis.pages.dev/eventos).
- O GitHub Action `.github/workflows/atualizar-dados.yml` regenera o JSON todo dia e faz commit.

## Rodando localmente

Requer [uv](https://docs.astral.sh/uv/).

```bash
uv run scripts/build_data.py              # gera data/conferences.json
uv run scripts/build_data.py --relatorio  # + confere casamentos Qualis suspeitos
python3 -m http.server 8000               # abra http://localhost:8000
```

## Tarefas comuns

| Quero…                                   | Edite                                                      |
|------------------------------------------|------------------------------------------------------------|
| Mudar as conferências do grupo (⭐)      | `data/grupo.yml`                                           |
| Adicionar conferência fora do ccfddl     | `data/extra_conferences.yml` (ex.: eventos da SBC)         |
| Corrigir um Qualis casado errado         | `data/qualis/aliases.yml`, depois rode com `--relatorio`   |
| Adicionar nova lista Qualis (ex.: 2021-2024) | `uv run --group qualis scripts/import_qualis.py planilha.xlsx 2021-2024` e inclua o CSV em `QUALIS_FILES` no `build_data.py` |

Os filtros ficam na URL, então dá para compartilhar visões prontas, por exemplo
`?visao=grupo` ou `?areas=AI&qualis=A2`.

Prazos corrigidos ou faltando? O ideal é contribuir direto no
[ccfddl](https://github.com/ccfddl/ccf-deadlines) — beneficia todo mundo e chega aqui no dia seguinte.
