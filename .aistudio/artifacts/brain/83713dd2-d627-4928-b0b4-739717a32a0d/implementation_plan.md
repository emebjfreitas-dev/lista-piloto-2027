# Implementation Plan - Resumo Mensal Power BI Executivo & Sóbrio

Transformar a tela **Resumo Mensal** em um dashboard executivo minimalista no padrão Power BI institucional, eliminando poluição visual, elementos supérfluos e gráficos pesados, priorizando cartões de KPIs diretos, aderência às metas legais do MEC (60% Infantil / 75% Fundamental), gestão de atestados e alertas acionáveis de busca ativa.

## User Review Required

> [!IMPORTANT]
> O layout passará de tabelas densas e blocos dispersos para uma **grade sóbria estilo Power BI Executivo**:
> 1. **Cabeçalho com Slicers Executivos**: Seletor de Mês, Segmento (Infantil / Fundamental / Todos), Turno (Manhã / Tarde / Todos) e Turma (Visão Geral ou Turma específica).
> 2. **Faixa Superior de KPIs (Cards Power BI)**:
>    - Taxa de Frequência Geral vs. Meta MEC com indicador visual de status (Atingida / Atenção / Crítica).
>    - Alunos em Risco MEC (<60% no Infantil ou <75% no Fundamental).
>    - Alertas Críticos de Busca Ativa (3+ faltas consecutivas ou 5+ faltas alternadas sem justificativa).
>    - Volume de Faltas com Atestado Médico vs. Não Justificadas.
> 3. **Painel de Aderência às Metas MEC por Turma**: Micro-barras sóbrias com linha de meta legal MEC e sinalizadores discretos.
> 4. **Tabela de Alertas e Busca Ativa Prioritária**: Lista limpa e acionável com alunos em situação crítica para intervenção imediata da coordenação/direção.
> 5. **Exportação e Ata**: Botões discretos de impressão/PDF da ata e relatório executivo.

## Proposed Changes

### Interface do Painel (`src/components/ResumoMensalScreen.tsx`)

- **Remoção de Poluição Visual**:
  - Eliminar cartões redundantes, gráficos circulares desnecessários e elementos visuais com gradientes chamativos.
  - Adotar paleta institucional sóbria: Azul Corporativo Slate/Navy (`#0f2942`, `#1e3a5f`), Cinzas Neutros de alta legibilidade, e acentos semânticos contidos (Esmeralda para meta atingida, Âmbar para atenção, Rubi/Vinho para busca ativa).
- **Cartões de Metas Executivas (KPI Metric Cards)**:
  - Card 1: **Índice Global de Frequência** com delta em relação à Meta Legal MEC ponderada.
  - Card 2: **Conformidade Legal MEC** (% de alunos acima da meta mínima de frequência).
  - Card 3: **Atestados Médicos & Justificativas** (total de dias abonados vs. absenteísmo injustificado).
  - Card 4: **Gatilhos de Busca Ativa** (alunos com alerta de 3 faltas consecutivas ou risco de evasão).
- **Slicers e Filtros Dinâmicos**:
  - Barra de controle unificada no topo estilo slicers do Power BI: Mês Letivo, Segmento, Turno e Turma.
  - Filtro rápido para exibir apenas casos com alerta de Busca Ativa.
- **Quadro de Conformidade por Turma**:
  - Tabela sintética de desempenho por turma com indicador de meta MEC atingida e contagem de estudantes em busca ativa.
  - Ação rápida de 1-clique para abrir o lançamento mensal ou detalhar a turma.
- **Módulo de Busca Ativa e Intervenção**:
  - Listagem dos estudantes que exigem contato com a família (busca ativa imediata), indicando telefone/contato e motivo do alerta.

### Tipagem e Cálculo de Indicadores (`src/types.ts` & `src/components/ResumoMensalScreen.tsx`)

- Validar e refinar o cálculo de conformidade com as regras do MEC:
  - Educação Infantil: Frequência mínima legal de 60% (LDB art. 31, IV).
  - Ensino Fundamental: Frequência mínima legal de 75% (LDB art. 24, VI).
- Manter sincronia total com o estado das turmas no Firebase e dados locais do IndexedDB/localStorage.

## Verification Plan

### Automated Tests
- `npm run lint`: Checagem rigorosa de tipos TypeScript sem erros (`tsc --noEmit`).
- `npm run build`: Validação de compilação do Vite para produção sem quebras.

### Manual Verification
1. Abrir a aba **Resumo Mensal** na barra de navegação.
2. Conferir o novo visual sóbrio estilo Power BI com cartões executivos de metas e alertas.
3. Filtrar por mês e alternar entre Educação Infantil e Ensino Fundamental para verificar a aplicação das metas MEC (60% e 75%).
4. Verificar o cartão e a listagem de Busca Ativa com os alunos que acumulam faltas consecutivas.
5. Testar a navegação de 1-clique para o lançamento da turma e a exportação/impressão do relatório.
