# REESTRUTURAÇÃO, ATUALIZAÇÃO E PADRONIZAÇÃO COMPLETA DO SISTEMA ESCOLAR (2027)

Revisão e modernização integral do sistema da EMEB Prof. Joaquim Candelário de Freitas, atendendo a todos os requisitos arquiteturais, visuais, tipográficos e funcionais solicitados para o ano letivo de 2027.

---

## 1. Atualização Completa das Informações para 2027 (Quadro Oficial de 40 Turmas)

- **Fonte Oficial Única de Dados (`officialMatrix2027.ts`)**:
  - Exatamente **40 turmas oficiais cadastradas**: **20 no período da manhã** e **20 no período da tarde**.
  - **Manhã (20 turmas)**:
    - 4A (Adília), 3A (Ana Lúcia), 5B (Ana Maria), G4B (Bianca), 4C (Cleonice), G4A (Denise), 2C (Elaine Cristiane), G5A (Gésica), 4B (Helena), 3C (Iara), G4C (Luana), G5B (Lucimeire), 5C (Marcos), 3B (Marina), 1B (Rosângela), 5A (Sandra), 1C (Sílvia Aparecida), 2A (Sílvia Helena), 1A (Simone), 2B (Viviane).
  - **Tarde (20 turmas)**:
    - 5E (Amanda), G4D (Ana Laura), 3F (Ana Paula), G4E (Bárbara), 3E (Camilo), 1D (Carol), 4F (Fábio), G5D (Fernanda), 1F (Giulia), 5D (Karina), 3D (Maria Aparecida), 4D (Maria Júlia), 4E (Maria Paula), G5C (Mariana Cristina), 4G (Rafaela), 2D (Rita), 2E (Vanessa), **2F (TURMA VAGA)**, **G5E (TURMA VAGA)**, **1E (TURMA VAGA)**.
- **Tratamento das Turmas Vagas**:
  - As 3 turmas vagas (`2F`, `G5E` e `1E`) são mantidas estritamente com identificação `TURMA VAGA` (sem professores fictícios).
  - Diferenciação clara entre turma vaga e turma inativa: turmas vagas possuem badge de destaque âmbar (`TURMA VAGA (Aguardando Atribuição)`) e ação direta de atribuição para administradores.
  - Adicionado filtro rápido exclusivo `⚠️ Turmas Vagas (3)` no Quadro Geral.
- **Persistência Garantida**:
  - Chaves de armazenamento atualizadas para `emeb_candelario_sed_classes_2027_v7` e `emeb_candelario_authorized_users_2027_v4`, garantindo consistência sem corromper presenças, faltas, fotos ou pareceres pedagógicos dos estudantes.

---

## 2. Padronização da Tipografia Institucional (Padrão SED SP)

- **Famílias Tipográficas Oficiais**:
  - `Open Sans` e `Public Sans` carregadas do Google Fonts, com alinhamento visual idêntico ao portal SED da Secretaria da Educação do Estado de São Paulo.
  - `JetBrains Mono` reservada para números tabulares (RA, NIS, códigos SED, percentuais de frequência e contadores).
- **Centralização de Tokens**:
  - Variáveis globais `--font-sans` e `--font-display` definidas no CSS principal e aplicadas transversalmente a todos os módulos, menus, formulários, botões, modais e relatórios.

---

## 3. Reformulação da Página Inicial (Home)

- **Painel de Boas-Vindas e Indicadores Temporais**:
  - Relógio digital em tempo real com horas, minutos e segundos (`HH:mm:ss`), data completa por extenso, dia da semana e ano letivo de 2027.
  - Cartão informativo do **Mês de Referência Padrão** (`Setembro/2026`), com explicação de que o fechamento refere-se ao mês imediatamente anterior ao corrente.
- **Métricas Oficiais de Turmas**:
  - Total de **40 turmas ativas**, discriminando a divisão exata de **20 no período da manhã** e **20 no período da tarde**.
  - Quadro de regência: **37 docentes atribuídos** e **3 turmas vagas aguardando atribuição**.
  - Indicadores de fechamento de frequência (concluídas vs. pendentes), taxa média de presença escolar e atalhos rápidos com alto contraste e zero sobreposição de botões.

---

## 4. Regra de Mês de Referência Padrão (Mês Imediatamente Anterior)

- Criada a função utilitária `getDefaultReferencePeriod()` em `attendanceRules.ts`.
- Aplicação automática da regra: o sistema sempre seleciona como referência padrão o mês anterior ao mês do sistema (ex.: em Outubro, a referência é Setembro; em Janeiro, a referência é Dezembro do ano anterior).
- Navegação entre períodos preservada em todas as telas (`RegistroFrequenciaMensalScreen`, `ResumoMensalScreen`, etc.).

---

## 5. Tela de Controle de Acesso e Usuários (`UsuariosAcessoScreen.tsx`)

- Totalmente atualizada para 40 turmas oficiais.
- Sub-aba do Quadro Geral com filtro rápido por período (`Todas (40)`, `☀️ Manhã (20)`, `⛅ Tarde (20)` e `⚠️ Turmas Vagas (3)`).
- Tabela com colunas oficiais completas, pesquisa instantânea, sincronização com matriz oficial e modal de edição para atribuir docentes a turmas vagas.
- Perfil administrativo atualizado para conceder acesso às 40 turmas.

---

## 6. Exportação de Documentos (PDF / Impressão A4 e Planilha XLSX)

- **Impressão A4 / PDF (`RelatorioImpressaoModal.tsx`)**:
  - Cabeçalho oficial com brasão municipal, identificação da escola e do ano letivo de 2027.
  - Dinamização do mês de referência padrão.
  - Linhas de assinatura para Docente Regente (com nome do professor atribuído) e Direção/Coordenação.
  - Estilização de quebra de página (`break-inside-avoid`) para evitar cortes indesejados de tabelas na impressão A4.
- **Exportação Excel (.XLS / .XLSX)**:
  - Todas as abas consolidadas com suporte às 40 turmas e 200 dias letivos anuais.

---

## 7. Verificação e Qualidade do Código

- `tsc --noEmit` executado via `lint_applet` com **zero erros**.
- `compile_applet` executado com **sucesso**.
- Servidor reiniciado e validado.
