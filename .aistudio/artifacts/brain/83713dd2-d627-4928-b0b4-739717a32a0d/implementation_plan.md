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

## 7. Painel Tátil para Educadores & Contraste Aprimorado de Tons

- **Eliminação de Contornos Desnecessários ("Sem Contornos Bobos")**:
  - Remoção de bordas duplas, contornos aramados (`border-2 border-slate-300`, `border-2 border-slate-400`) e linhas divisórias frágeis.
  - A separação visual e a tridimensionalidade agora ocorrem pelo contraste puro de superfícies sólidas (`bg-white` e `bg-slate-50` sobre canvas neutro `bg-slate-200/70`) e elevação suave (`shadow-sm`).
- **Contraste Aprimorado de Tons (Preto no Branco)**:
  - Eliminação de tons de cinza claro ou apagados; todos os textos principais e números utilizam `text-slate-950`, `text-slate-900` e `text-slate-800`.
  - Botões táteis com fundos sólidos de alto contraste (`bg-slate-950 text-white`, `bg-emerald-800 text-white` e `bg-rose-700 text-white`).
- **Remoção de Atalhos Obscuros**:
  - Eliminação de teclas técnicas e abreviações confusas (`⌘K`, `Ctrl+K`, `<kbd>`) para idosos; a busca agora é um botão direto e visível: `[ 🔍 Buscar ]`.
- **Seletor de Turmas em 1 Toque**:
  - Filtro amplo de turnos (`[ Todas (40) ]`, `[ ☀️ Manhã (20) ]`, `[ 🌤️ Tarde (20) ]`) e cartões de turma amplos com botões táteis para visualização de alunos ou lançamento direto de faltas.

---

## 8. Verificação e Conformidade Técnica

- **Alto Contraste Tonal Concluído em TODAS as Telas e Níveis**:
  - `HomeScreen.tsx`: Painel de seleção tátil com botões e superfícies sólidas, sem contornos finos nem wireframes.
  - `Header.tsx` & `BottomNav.tsx`: Sem atalhos de teclado confusos (`⌘K`, `<kbd>`), contraste nítido (`text-slate-950 font-bold`).
  - `MinhasTurmasScreen.tsx`: Cards de turmas elevados e botões de ação sólidos (`bg-emerald-800` e `bg-slate-100`).
  - `RegistroFrequenciaMensalScreen.tsx`: Tanto na visualização compacta quanto em cartões, contadores de faltas e atestados foram atualizados com superfícies de tom sólido (`bg-rose-100 text-rose-950`, `bg-sky-100 text-sky-950`), sem contornos finos duplos (`border-2 border-slate-300` / `border-rose-300`).
  - `DetalhesTurmaScreen.tsx`: Painéis de ficha, contatos familiares, percurso georreferenciado e cards de estudantes convertidos para superfícies com profundidade tonal e texto preto/ardósia escuro de alto contraste, sem bordas desnecessárias.
- `tsc --noEmit` executado via `lint_applet` com **zero erros**.
- `compile_applet` executado com **sucesso total**.
- Dev server ativo e sincronizado.

---

## 9. Correção da Sobreposição Pop (Google Sync)

- **Eliminação do Auto-Disparo no Login**:
  - O modal não abre mais automaticamente de surpresa após o login Google; o usuário permanece no controle de suas ações.
- **Simplificação e Humanização da Confirmação**:
  - Removido o blackout agressivo e a sobreposição longa com nomes técnicos de arquivos e códigos (`BD_Oficial_SED...`, `Fotos_Estudantes_...`).
  - Substituído por um cartão de confirmação compacto, elegante e direto em português claro com botões grandes de alto contraste (`Confirmar` em verde esmeralda e `Cancelar` em tom sólido).

---

## 10. Eliminação Sistemática de "Contornos Bobos" em Todas as Telas

- **Rotas (`MapaEstudantesScreen.tsx`)**:
  - Removidos contornos pesados (`border-4 border-white`, `border-2 border-white`, `border-3`) de marcadores de mapa (Escola Candelário, Início de Rota, Chegada e Distância/Minutos).
  - Marcadores agora usam badges arredondados sólidos (`bg-slate-900`, `bg-emerald-600`, `bg-rose-600`, `bg-[#003440]`) com sombras profundas e anéis de seleção tonais.
- **Busca Ativa (`FaltasConsecutivasScreen.tsx`)**:
  - 100% livre de bordas aramadas. Substituição por superfícies de tom sólido (`bg-slate-100`, `bg-white`, `bg-rose-100/90`, `bg-amber-100/90`) com cantos arredondados (`rounded-2xl`, `rounded-3xl`) e texto de alto contraste (`text-slate-950 font-bold`).
- **Faltas do Mês / Resumo Mensal (`ResumoMensalScreen.tsx`)**:
  - Removidos contornos pontilhados e wireframes dos gráficos e seções; linhas de referência substituídas por indicadores sutis de tom sólido e cartões de KPI em `bg-slate-100` com tipografia preta sólida.
- **Bolsa Família & Fretado (`ListasNominaisScreen.tsx`)**:
  - Removidas bordas finas dos botões de bimesters, cards de condicionalidade social e cabeçalhos de tabela; substituídos por cartões tonais suaves (`bg-rose-100`, `bg-sky-100`, `bg-amber-100`, `bg-slate-100`).
- **Minhas Turmas & Painel Inicial (`MinhasTurmasScreen.tsx`, `HomeScreen.tsx`)**:
  - Removidas todas as bordas aramadas de cartões de turmas, filtros de turno e cabeçalhos.
- **Componentes Base (`ui/card.tsx`, `ui/badge.tsx`, `ui/button.tsx`, `Header.tsx`, `BottomNav.tsx`)**:
  - Padrão tátil Apple Human Interface: superfícies tonais puras, elevações suaves (`shadow-sm`, `shadow-2xs`), cantos amplos e zero contornos desnecessários.

---

## 11. Padronização Global de Proporções de Layout & Harmonia Espacial

- **Grid Unificado & Alinhamento Pixel-Perfect do Frame**:
  - Alinhamento milimétrico entre o `<header>` e o `<main>` em `src/App.tsx` e `src/components/Header.tsx`, ambos fixados em `max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8`.
  - As bordas laterais do brasão municipal e da identidade da escola agora se alinham perfeitamente aos cartões e tabelas em todas as telas.
- **Eliminação de Saltos e Assimetrias de Largura**:
  - `FaltasConsecutivasScreen.tsx`: Largura restrita artificialmente em `max-w-[1250px]` removida em favor do grid proporcional padrão de `1600px`.
  - `DiasLetivosScreen.tsx`: Largura restrita em `max-w-[1100px]` eliminada, permitindo que a matriz de 200 dias letivos respire sem compressão visual.
  - `MapaEstudantesScreen.tsx`: Duplo padding conflitante (`px-2 sm:px-4 lg:px-6 max-w-[1550px]`) eliminado; proporção de altura do mapa e inspetor de trajeto calibrados harmonicamente.
  - `HomeScreen.tsx`, `DetalhesTurmaScreen.tsx`, `RegistroFrequenciaMensalScreen.tsx`, `PlanilhaGoogleScreen.tsx` e `ResumoMensalScreen.tsx`: Ritmo vertical padronizado com espaçamento consistente (`space-y-5 pb-16`).
- **Matemática Proporcional de Raios de Curvatura ($r_{\text{inner}} \le r_{\text{outer}}$)**:
  - Containers mestres externos: `rounded-3xl` com sombra suave (`shadow-sm`).
  - Cards internos de indicadores e tabelas: `rounded-2xl` com preenchimento em tom sólido (`bg-slate-100`).
  - Inputs e botões de ação: `rounded-2xl` com altura mínima de toque $\ge 44\text{px}$ (`h-11` a `h-12`).
  - Tags e chips de status: `rounded-lg` ou `rounded-full` para identificadores sem conflito de raio.
- **LoginScreen Refinado em Proporções e Contraste**:
  - Cartão central em `max-w-[440px] rounded-3xl shadow-xl px-7 sm:px-9 py-9`.
  - Controles de identificação e código de verificação 2FA aumentados para `h-11`/`h-12` com contraste preto no branco, superfícies sólidas e zero bordas finas.

---

## 12. Arquitetura de Segurança Adaptativa por Perfil (Usuário vs. Administrador)

- **Segurança Estrita para Administrador (`admin` / Direção e Secretaria)**:
  - **Acesso Crítico Protegido**: O administrador manipula dados confidenciais (RAs, Bolsa Família, ocorrências do Conselho Tutelar/ECA e banco de dados).
  - **Validade Reduzida de Dispositivo Confiável**: Limitada a no máximo 7 dias (contra 30 dias de usuários comuns), exigindo revalidação periódica com 2FA.
  - **Selo Institucional de Auditoria**: Emblema visual em âmbar com tag `LGPD Estrita`.
- **Experiência Sem Atrito com Alta Segurança para Usuário Comum (`usuario` / PEB I)**:
  - **Entrada em 1 Toque Seguro**: Quando o professor utiliza um computador escolar reconhecido (`isDeviceTrusted`), o botão principal se transforma em `[ Entrar como {Nome} (1 Toque Seguro) ]` com badge verde institucional, dispensando códigos repetitivos diários.
  - **Dispositivo Confiável de 30 Dias**: Reduz o desgaste de professores com pouca familiaridade digital sem comprometer o perímetro de segurança.
- **Proteções Técnicas Globais contra Ataques e Falhas**:
  - **Proteção Ativa contra Força Bruta**: Após 3 tentativas incorretas do código de 6 dígitos, o sistema entra em bloqueio de segurança por 60 segundos com contador regressivo em tempo real (`lockoutRemaining`).
  - **Expiração de Código em 5 Minutos**: Códigos OTP descartáveis que se invalidam após 300 segundos com renovação assistida.
  - **Preenchimento em 1 Toque para Leigos**: Botão institucional que preenche os 6 dígitos automaticamente para evitar erros de digitação e chamados de suporte.
  - **Módulo de Ajuda Integrado na Tela**: Painel com contato oficial da secretaria para desbloqueio ou suporte imediato.

---

## 13. Layout de Sticky Footer & Cabeçalho Fixo com Rolagem Interna Contida

Implementação padronizada nas principais telas de configuração e formulários com muitos campos para eliminar rolagem infinita e garantir ações instantâneas sem esforço:

- **Contêiner com Altura Limitada à Viewport**:
  - `flex flex-col h-[calc(100dvh-5.5rem)] lg:h-[calc(100vh-6rem)] overflow-hidden`
- **Cabeçalho Fixo (`shrink-0`)**:
  - `bg-white/95 backdrop-blur-md px-4 sm:px-6 pt-3 pb-2.5 border-b border-slate-200/90 z-10`
  - Sempre visível no topo com breadcrumbs, títulos claros e botões segmentados de navegação.
- **Corpo com Rolagem Interna Contida (`flex-1`)**:
  - `flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 focus:outline-none`
  - A rolagem ocorre exclusivamente dentro da área útil de dados, sem deslocar o cabeçalho nem o rodapé.
- **Rodapé de Ação Fixo (`shrink-0 sticky footer`)**:
  - `bg-white/95 backdrop-blur-md px-4 sm:px-6 py-2.5 sm:py-3 border-t border-slate-200/90 shadow-sm z-20 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3`
  - Resumos de status à esquerda (contagem de dias/meta, turmas, usuários autorizados, conexões).
  - Botões de confirmação e salvamento primário à direita (`Salvar e Publicar 200 Dias`, `Sincronizar Quadro`, `Sincronizar Nuvem`, `Salvar Alterações`).
- **Telas e Componentes Adaptados**:
  - `DiasLetivosScreen.tsx`: Calendário oficial dos 200 dias com rodapé de homologação e contador `200/200`.
  - `UsuariosAcessoScreen.tsx`: Relação docente, atribuição SED e tempo de lançamento com rodapé de sincronização.
  - `PlanilhaGoogleScreen.tsx`: Integração Google Sheets/Drive com rodapé de exportação e sincronização em 1 clique.
  - `GradeDadosCriancaModal.tsx`: Ficha cadastral com 48 campos SED e rodapé fixo para salvar alterações.
  - `RegistroFrequenciaMensalScreen.tsx`: Botão de conclusão rápida inserido na barra superior fixa.
  - `ConfigurarDiasLetivosTurmasModal.tsx`, `NovaTurmaModal.tsx`, `UploadFotoModal.tsx`, `RelatorioImpressaoModal.tsx`, `AnotacoesModal.tsx`: Rodapé com `sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200/90`.

---

## 14. Seletor de Frequência de Sincronização Google Sheets (30, 60, 120 min) & Correção de Deploy

- **Seletor Visual na Tela '4. 200 Dias' (`DiasLetivosScreen.tsx`)**:
  - Implementação dupla com seletor **dropdown** (`<select>`) no cabeçalho e **botões de rádio semânticos** (`<input type="radio">`) incorporados aos cartões visuais.
  - Intervalos disponíveis:
    - **30 minutos**: Alta frequência para períodos de fechamento bimestral e lançamento intenso de faltas.
    - **60 minutos**: Recomendado (Padrão SME) com equilíbrio ideal entre dados recentes e estabilidade.
    - **120 minutos**: Econômico para preservar ao máximo cota de API e consumo de dados.
  - Persistência imediata no `localStorage` sob a chave `emeb_candelario_sheets_sync_interval_minutes_2027`.
  - Disparo de evento customizado `emeb_sheets_sync_interval_changed` para notificar outras partes do aplicativo.
- **Reatividade dos `useEffect` com Reinício de `setInterval`**:
  - `DiasLetivosScreen.tsx`: Possui `useEffect` com dependência explícita em `[syncFrequency]`, que limpa (`clearInterval`) o timer anterior e agenda o novo `setInterval` correspondente ao valor selecionado.
  - `App.tsx`: Possui estado `sheetsSyncFrequency` com listener de alteração e `useEffect` com `[sheetsSyncFrequency]`, garantindo que o ciclo mestre de sincronização em segundo plano seja reiniciado automaticamente.
- **Resolução do Erro de Deploy no Cloud Run**:
  - Corrigido o erro `ERR_MODULE_NOT_FOUND` em `server.ts` ao eliminar a dependência externa de extensão `.js`, embutindo os métodos de validação diretamente no servidor de produção.
  - `npm run build` e `node server.ts` validados com sucesso total.
