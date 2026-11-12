-- TAXA DE ABANDONO EM FILA — DIAGNOSTICO SOMENTE LEITURA
-- Nao cria/altera nenhum objeto, nao modifica n8n, nao expõe telefones/IDs.
-- Escopo: verificar se o Supabase possui eventos que permitam comprovar
-- entrada na fila e distinguir abandonos em fila de abandonos anteriores.
-- Execute esta consulta no SQL Editor do Supabase self-hosted e exporte o CSV.
-- Não use os valores contados abaixo para publicar a taxa sem validar o
-- identificador da fila, evento, cobertura temporal e regras de deduplicacao.
--
-- Fonte conhecida de chamadas: public.relatorio_chamadas.
-- Fonte conhecida de fila-exame: public.relatorio_fila_exame.
-- Este diagnostico NAO presume que relatorio_fila_exame represente todas
-- as filas nem que a coluna queuename de uma chamada ABANDON seja preenchida.

WITH objetos AS (
    SELECT
        '01_OBJETO_FILA'::text AS secao,
        (t.table_schema || '.' || t.table_name)::text AS origem,
        'tipo'::text AS atributo,
        t.table_type::text AS valor
    FROM information_schema.tables AS t
    WHERE t.table_schema IN ('public','dashboard_private','dashboard_catalog')
      AND t.table_name ~* '(fila|queue|chamad|cdr|call|evento)'
),
colunas AS (
    SELECT
        '02_COLUNA_RELEVANTE'::text AS secao,
        (c.table_schema || '.' || c.table_name)::text AS origem,
        c.column_name::text AS atributo,
        (c.data_type || '; nullable=' || c.is_nullable)::text AS valor
    FROM information_schema.columns AS c
    WHERE c.table_schema IN ('public','dashboard_private','dashboard_catalog')
      AND c.table_name ~* '(fila|queue|chamad|cdr|call|evento)'
      AND c.column_name ~* '(fila|queue|event|status|dispos|waiting|tempo|tef|time|src|id|position|abandon)'
),
volume AS (
    SELECT
        to_char(
            (r.init_time AT TIME ZONE 'America/Sao_Paulo'),
            'YYYY-MM'
        ) AS mes_local,
        r.disposition::text AS situacao,
        COUNT(*) AS total,
        COUNT(*) FILTER (
            WHERE NULLIF(btrim(r.queuename::text),'') IS NOT NULL
        ) AS com_nome_de_fila,
        COUNT(*) FILTER (
            WHERE r.tef > 0
        ) AS com_tef_positivo,
        COUNT(*) FILTER (
            WHERE NULLIF(btrim(r.queuename::text),'') IS NOT NULL
              AND r.tef > 0
        ) AS com_nome_e_tef_positivo
    FROM public.relatorio_chamadas AS r
    WHERE r.call_direction='Recebida'
      AND r.init_time >= (
        '2026-10-01'::timestamp AT TIME ZONE 'America/Sao_Paulo'
      )
      AND r.init_time < (
        '2026-11-12'::timestamp AT TIME ZONE 'America/Sao_Paulo'
      )
    GROUP BY 1,2
),
contagens AS (
    SELECT
        '03_COBERTURA_CHAMADAS'::text AS secao,
        ('recebidas/'||mes_local||'/'||situacao)::text AS origem,
        m.atributo,
        m.valor::text
    FROM volume AS v
    CROSS JOIN LATERAL (
        VALUES
        ('total',v.total),
        ('nome_fila_preenchido',v.com_nome_de_fila),
        ('tef_positivo',v.com_tef_positivo),
        ('nome_fila_e_tef_positivo',v.com_nome_e_tef_positivo)
    ) AS m(atributo,valor)
)
SELECT secao,origem,atributo,valor
FROM (
    SELECT * FROM objetos
    UNION ALL SELECT * FROM colunas
    UNION ALL SELECT * FROM contagens
) AS diagnostico
ORDER BY secao,origem,atributo;

-- INTERPRETACAO:
-- 1. Se nao ha eventos de abandono POR FILA, nao calcular a taxa.
-- 2. A presença de queuename ou tef>0 NAO comprova, isoladamente,
--    o evento de abandono apos entrada em fila.
-- 3. Um registro com disposition='NO ANSWER' nao e automaticamente
--    abandono. Falhas/transbordos podem ter outra semantica.
-- 4. Para uma taxa global, e necessario capturar TODAS as filas do escopo,
--    nao apenas FILA-EXAME; respeitar paginacao da API.
-- 5. Numero sem chamadas atendidas/abandonadas em fila = NULL, nao 0%.
