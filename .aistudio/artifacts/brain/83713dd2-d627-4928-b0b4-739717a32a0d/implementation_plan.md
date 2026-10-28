# PADRONIZAÇÃO TIPOGRÁFICA E REFINAMENTO VISUAL COMPLETO (2027)

Padronização e refinamento visual absoluto do aplicativo web da **EMEB Prof. Joaquim Candelário de Freitas** (Ano Letivo 2027).

---

## 1. Família Tipográfica Única e Centralizada

- **Família Principal do Sistema**:
  - `Inter` carregada via Google Fonts (`index.html`) com suporte óptico completo (`ital,opsz,wght@0,14..32,400..700;1,14..32,400..700`).
  - Fallbacks nativos modernos de alto desempenho: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
  - Configurada no `:root` via `--font-sans` e aplicada universalmente a todo o DOM (`html`, `body`, títulos, parágrafos, inputs, botões, modais, tabelas e relatórios).
  - Suporte a ligaduras e clareza tipográfica refinada: `font-feature-settings: "cv02", "cv03", "cv04", "cv11"`.
- **Família Numérica e Tabular**:
  - `JetBrains Mono` reservada para dados numéricos tabulares (RAs, números de chamada, percentuais de presença/falta MEC, datas e métricas dos 200 dias letivos).
  - Classes `.tabular-nums` e `.font-mono` padronizadas para alinhamento sem trepidação ou desalinhamento de dígitos.

---

## 2. Escala Tipográfica Padronizada

Substituição de todos os valores fracionários e arbitrários de `rem` (`text-[0.61rem]` até `text-[1.75rem]`) pela escala proporcional oficial do design system:

| Token / Classe | Tamanho | Uso Principal no Sistema |
| :--- | :--- | :--- |
| `text-2xl font-semibold` | 24px (1.5rem) | Títulos principais de tela e indicadores numéricos estratégicos (KPIs) |
| `text-xl font-semibold` | 20px (1.25rem) | Títulos de página secundários e modais principais |
| `text-lg font-semibold` | 18px (1.125rem) | Cabeçalhos de seção e títulos de cards |
| `text-base font-semibold/normal` | 16px (1.0rem) | Títulos de blocos, valores de inputs amplos |
| `text-sm font-normal` | 14px (0.875rem) | Corpo de texto padrão, labels principais, botões de ação |
| `text-xs font-normal/medium` | 12px (0.75rem) | Tabelas com alta densidade de dados, menus, chips de status, datas |
| `text-[11px] font-medium` | 11px (0.6875rem) | Metadados, subtítulos de indicadores, legendas de gráficos |

---

## 3. Disciplina de Pesos Tipográficos (Eliminação de Negritos Excessivos)

- **Regra dos 3 Pesos Estratégicos**:
  - `font-normal` (400): Textos corridos, descrições institucionais, corpo de células de tabelas, observações.
  - `font-medium` (500): Elementos de destaque discreto, rótulos de campos, botões secundários, filtros segmentados, badges informativos.
  - `font-semibold` (600): Títulos de seções, ações primárias, identificadores de turmas e números em destaque.
- **Eliminação Completa de Negritos Pesados**:
  - `font-black` (900) e `font-extrabold` (800) foram 100% extirpados de todas as 26 telas, componentes e modais do sistema.

---

## 4. Coerência Visual em Todos os Componentes

- **Telas Padronizadas**:
  - `LoginScreen.tsx` (Login Simplificado com Verificação em Duas Etapas - 2FA)
  - `HomeScreen.tsx` (Painel Executivo de Gestão)
  - `MinhasTurmasScreen.tsx` e `DetalhesTurmaScreen.tsx` (Ficha da Turma e dos Estudantes)
  - `RegistroFrequenciaMensalScreen.tsx` (Informar Faltas do Mês)
  - `FaltasConsecutivasScreen.tsx` (Busca Ativa e Ocorrências ECA)
  - `MapaEstudantesScreen.tsx` (Rotas e Geolocalização de Estudantes)
  - `ResumoMensalScreen.tsx` (Resumo Mensal e Indicadores MEC)
  - `PlanilhaGoogleScreen.tsx` (Conexão Drive e Planilha)
  - `DiasLetivosScreen.tsx` e `ConfigurarDiasLetivosTurmasModal.tsx` (Calendário dos 200 Dias Letivos)
  - `UsuariosAcessoScreen.tsx` (Atribuição e Acessos)
  - `ListasNominaisScreen.tsx`, `AlunosModal.tsx`, `GradeDadosCriancaModal.tsx`, `UploadFotoModal.tsx`, `VisualizarPdfNominalModal.tsx`, `RelatorioImpressaoModal.tsx`, `SpotlightCommandModal.tsx`.

---

## 5. Login Simplificado com Verificação em Duas Etapas (2FA)

- **Etapa 1 (Identificação)**:
  - Input direto para e-mail institucional (`@jundiai.sp.gov.br`) com suporte a preenchimento automático.
  - Reconhecimento automático de perfil lembrado com opção de troca rápida.
  - Integração com Google Workspace para autenticação em 1 clique.
  - Detecção de dispositivo confiável previamente autorizado.
- **Etapa 2 (Verificação em Duas Etapas - 2FA)**:
  - Mascaramento de e-mail institucional para privacidade.
  - Campo numérico de 6 dígitos formatado em tipografia monospace (`font-mono tracking-[0.5em]`).
  - Banner institucional com código de verificação instantâneo e botão de preenchimento automático em 1 clique (para evitar bloqueios ou atrasos).
  - Opção "Confiar neste dispositivo por 30 dias" para reduzir atritos em acessos recorrentes.
  - Ações para reenvio de código com contagem regressiva e troca de e-mail.

## 6. Expansão Única e Fluida de Dados ao Clicar

- **Comportamento Accordion Único**: Ao clicar em qualquer estudante (na visualização em Cartões/Grid, Lista Compacta ou Tabela Nominal), o sistema expande inline de forma suave e exclusiva os dados completos daquele aluno, recolhendo automaticamente o anterior.
- **Transição Fluida**: O cartão se expande com animação sutil (`animate-gentle-fade` e `duration-200`), ocupando a largura total das colunas no grid para leitura clara e espaçada.
- **Painéis Integrados**: Exibição imediata da frequência mensal com aferição da LDB, filiação com link direto para WhatsApp e ligação, endereço com estimativa de percurso a pé/carro e atalho para o mapa interativo, situação cadastral e botões para a Ficha Completa e PDF escaneado.
- **Indicador Visual**: Ícone de chevron rotativo suave (`expand_more` que rotaciona 180 graus ao expandir).

---

## 7. Verificação e Conformidade Técnica

- `tsc --noEmit` executado via `lint_applet` com **zero erros**.
- `compile_applet` executado com **sucesso**.
- Dev server ativo e sincronizado.
