# Simulador de Investimentos

**Acesse em:** https://simuladorinvestimentos.ananias.dev/

Calculadora de juros compostos com aportes mensais e extras programados, cenários salvos comparáveis e visualização em gráfico interativo.

## Funcionalidades

### Cenários

O topo da página traz as ações de cenário:

- **Ver Todos** — abre a lista de cenários salvos (nome, capital inicial, aporte, rendimento anual e meta) com um botão **Selecionar** por linha. Selecionar fecha a modal e carrega o cenário.
- **Adicionar** — abre a modal de cadastro de cenário.
- **Exportar** / **Importar** — salvam ou carregam todos os cenários salvos em um arquivo JSON.
- Botão **i** — explica as fórmulas usadas nos cálculos.

### Cenário selecionado

Abaixo da barra de ações, um painel mostra os dados do cenário atualmente selecionado: nome, cor, Parâmetros (capital inicial, aporte mensal, rendimento anual, meta) e a tabela de aportes extras. Com nada selecionado, o painel fica vazio e os resultados da página inteira ficam zerados.

Nesse painel:

- **Editar** — reabre a modal de cadastro já preenchida com os dados do cenário.
- **Excluir** — pede confirmação antes de remover o cenário e limpar a tela.

### Modal de cadastro/edição de cenário

Reúne tudo que define um cenário:

- **Parâmetros** — capital inicial, aporte mensal, rendimento anual, meta
- **Aportes extras** — valores pontuais em meses específicos, recorrentes todo ano ou em um ano específico da simulação
- **Nome** — se deixado em branco, é gerado automaticamente como `{aporte}/mês - {meta}` (ex.: `2,3 mil/mês - 100 mil`) e continua se atualizando enquanto você ajusta aporte/meta, até que você digite um nome manualmente
- **Cor** — usada no gráfico
- **Salvar cenário** — cria um novo cenário ou atualiza um existente (por nome) e o seleciona automaticamente
- **Cancelar** — fecha sem salvar

### Resultados

Os resultados abaixo só refletem dados reais quando **um cenário está selecionado**:

- **Acumulação** — tempo estimado até a meta, patrimônio final, total aportado, valor gerado pelos juros
- Duas abas:
  - **Rendimento e evolução** — rendimento projetado por mês/ano/dia ao atingir a meta, e o gráfico de evolução do patrimônio (com tooltip e cenários comparáveis como linhas tracejadas)
  - **Patrimônio pós meta** — ver abaixo

### Patrimônio pós meta

Calculadora de fase de retirada, **independente do cenário selecionado** (não é salva nem exportada com o cenário):

- **Meta de duração**, **Retirada mensal**, **Rendimento anual após a meta** — este último copia automaticamente o "Rendimento anual" do cenário sempre que ele muda; "Retirada mensal" é pré-preenchida com a sugestão de retirada ao selecionar um cenário
- Cards: duração estimada, sugestão de retirada mensal, total retirado, saldo projetado
- Gráfico secundário de patrimônio restante x total retirado

### Persistência

O `localStorage` guarda apenas os **cenários salvos**, qual está **selecionado** e a última modificação. Os campos de parâmetros e da calculadora pós-meta não ficam salvos como rascunho — eles refletem o cenário selecionado (ou ficam zerados/no padrão sem seleção).

### Tema

Alternância entre tema claro e escuro pelo botão flutuante de configurações, no canto da tela.

## Tecnologias

| Recurso | Detalhe |
|---|---|
| HTML/CSS/JS | Vanilla, sem frameworks |
| Gráficos | [Chart.js 4.4.1](https://www.chartjs.org/) via CDN |
| Fontes | DM Serif Display, DM Mono, DM Sans (Google Fonts) |
| Persistência | `localStorage` |

## Como usar

Basta abrir o arquivo `index.html` diretamente no navegador — não requer servidor ou instalação de dependências.

```
simulador-investimentos/
├── index.html          # estrutura da página e modais
├── styles.css           # estilos
├── js/
│   ├── app-core.js      # estado global, config e helpers de formatação
│   ├── controls.js       # sincronização slider ↔ campo editável, persistência
│   ├── extras.js         # CRUD dos aportes extras
│   ├── scenarios.js      # CRUD de cenários, import/export, modais
│   ├── simulation.js     # motor de cálculo, gráficos e renderização de resultados
│   └── main.js           # inicialização e orquestração
└── README.md
```
