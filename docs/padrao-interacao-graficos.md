# Padrão de interação dos gráficos — dashboard_tools

## Regra de design (obrigatória para novos gráficos)

O componente `components/chart-tooltip.tsx` e seus estilos em `components/chart-tooltip.module.css` definem o tooltip padrão do sistema. Todo gráfico interativo novo deve utilizá-lo em vez de criar um tooltip isolado em SVG, CSS ou biblioteca externa.

- Abrir ao passar o mouse e ao receber foco pelo teclado; atualizar os dados sem piscar ao mudar de barra/ponto.
- Separar legenda e valor em colunas independentes; permitir quebra de linha quando textos ou números forem longos. Nunca sobrepor rótulos aos valores.
- Usar animação suave de opacidade, deslocamento e posição (180 ms, 90 ms para acompanhar o cursor). Desativar transições quando `prefers-reduced-motion: reduce`.
- Manter o tooltip dentro da área visível da janela, sem depender do overflow/scroll interno do gráfico.
- Os elementos relevantes devem ser operáveis por teclado (`Tab`, `Enter`/`Espaço` quando selecionáveis), com `aria-label` descrevendo o mesmo valor.
- Preservar título, legenda, texto explicativo, unidade, período, filtros, fontes, seleção e mensagens de ausência de dados. Tooltip acrescenta contexto, não substitui essas informações.
- Nunca converter ausência de dados em zero. Diferenciar valores reais, dados parciais e indisponibilidade conforme contrato de cada gráfico.
- Tooltip é apenas apresentação; não altera as APIs, consultas, regras de negócio nem autorização.
- A cor de cada série deve corresponder à legenda; usar `value.toLocaleString('pt-BR')`, respeitando a unidade de cada gráfico (chamadas, mm:ss, percentual etc.).

### Uso

```tsx
import ChartTooltip, { pointFromMouse, pointFromFocus } from './chart-tooltip';

// Guardar o índice ativo e a posição do mouse/foco no estado do componente.
// Eventos do elemento de dado: onMouseEnter / onMouseMove / onMouseLeave /
// onFocus / onBlur, além de onClick e onKeyDown se selecionável.
<ChartTooltip
  open={Boolean(activeRow)}
  point={tooltipPoint}
  title={activeRow?.label ?? ''}
  values={activeRow ? [{ label: 'Recebidas', value: String(activeRow.total), color: '#2d74ca' }] : []}
/>
```

## Gráficos da área Call Center

| Gráfico | Aplicação |
| --- | --- |
| Chamadas por mês | Colunas verticais agrupadas, médias em linha horizontal e tooltip por mês |
| Chamadas por hora | Linhas e pontos, tooltip por faixa horária |
| Visão geral | Colunas empilhadas, tooltip por período |
| Comparativo anual | Colunas verticais e tooltip por ano/série; linha de média somente quando ambos os anos têm registros |
| TMA e TME diário | Colunas agrupadas e tooltip por dia, preservando a distinção TEF/TET |
| Chamadas por ramal | Barras de volume e tooltip por identificador |

## Critérios de aceite

1. Não deve haver regressão nos cálculos, cores das séries, filtros nem notas explicativas.
2. No desktop, hover move o tooltip sem travamentos; no teclado, foco revela o conteúdo sem exigir mouse.
3. Em telas estreitas, o tooltip permanece legível e a rolagem horizontal pertence ao gráfico, não à página.
4. Os estados de carregamento, sem registros, período parcial e erro continuam corretos.
5. Executar `npm run typecheck`, `npm run lint` e `npm run build`; revisar manualmente os seis gráficos no `dash-hub` após publicar.

**Observação:** a rota pública de implantação e o Supabase não participam desta alteração de interface.
