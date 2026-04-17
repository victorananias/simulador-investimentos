# Simulador de Investimentos

Calculadora de juros compostos com aportes mensais e extras programados, comparação de múltiplos cenários e visualização em gráfico interativo.

## Funcionalidades

### Parâmetros
- **Capital inicial** — valor já investido no início da simulação
- **Aporte mensal** — valor depositado todo mês
- **Juros ao ano** — taxa de retorno anual (convertida automaticamente para taxa mensal)
- **Meta** — patrimônio-alvo que define o fim da simulação

Os sliders avançam de R$ 100 em R$ 100. Os campos de texto aceitam qualquer valor decimal com máscara monetária em tempo real (`R$ 31.665,62`).

### Aportes extras
Adicione aportes pontuais em meses específicos com duas opções de recorrência:
- **Todo ano** — repete no mesmo mês a cada ano da simulação
- **Ano específico** — ocorre uma única vez no ano informado

### Cenários salvos
1. Configure os parâmetros e aportes extras desejados
2. Dê um nome e escolha uma cor
3. Clique em **Salvar cenário** — os parâmetros são resetados para um novo cenário
4. O cenário salvo aparece na tabela comparativa e como linha tracejada no gráfico

Na tabela é possível:
- **Selecionar** um cenário para exibi-lo como linha principal no gráfico e nos cards de resultado
- **Mostrar/ocultar** a linha do cenário no gráfico via checkbox
- **Alterar a cor** clicando no swatch colorido
- **Excluir** o cenário

### Cards de resultado
Exibem os resultados da simulação ativa (parâmetros atuais ou cenário selecionado):
- Tempo até atingir a meta
- Patrimônio acumulado
- Total aportado
- Ganho em juros
- Rendimento mensal, anual e diário projetado ao atingir a meta

### Gráfico
Linha de patrimônio projetado ao longo do tempo com tooltip interativo. Cenários salvos e visíveis aparecem como linhas tracejadas coloridas para comparação visual.

### Persistência
Todos os dados (parâmetros, aportes extras e cenários salvos) são persistidos automaticamente no `localStorage` do navegador.

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
├── index.html   # estrutura da página
├── styles.css   # estilos
├── script.js    # lógica de simulação, estado e UI
└── README.md
```
