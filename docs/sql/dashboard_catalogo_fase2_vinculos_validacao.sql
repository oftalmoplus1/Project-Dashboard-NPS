-- VALIDACAO FASE 2 / ETAPA 3 — SOMENTE LEITURA
-- Executar DEPOIS de instalar o SQL de vinculos (e, na segunda consulta,
-- depois de usar Administracao > Gerenciar topicos para fazer as associacoes).
-- Nao modifica dados. Nao retornar informacoes pessoais.

SELECT
    to_regprocedure(
        'public.dashboard_catalogo_listar_dashboards_topico(text)'
    ) IS NOT NULL AS rpc_listar_existe,
    to_regprocedure(
        'public.dashboard_catalogo_vincular_existente(text,text)'
    ) IS NOT NULL AS rpc_vincular_existe,
    has_function_privilege(
        'anon','public.dashboard_catalogo_vincular_existente(text,text)','EXECUTE'
    ) AS anon_pode_vincular,
    has_function_privilege(
        'authenticated','public.dashboard_catalogo_vincular_existente(text,text)','EXECUTE'
    ) AS autenticado_pode_chamar_rpc;

SELECT
    t.nome AS topico,
    d.codigo AS dashboard,
    d.estado,
    td.posicao,
    (
      SELECT count(*)
      FROM dashboard_catalog.acesso_dashboards a
      WHERE a.topico_id=t.id AND a.dashboard_id=d.id
    ) AS usuarios_autorizados
FROM dashboard_catalog.topicos t
JOIN dashboard_catalog.topico_dashboards td ON td.topico_id=t.id
JOIN dashboard_catalog.dashboards d ON d.id=td.dashboard_id
WHERE t.slug='relatorios'
ORDER BY td.posicao,d.codigo;

SELECT
    a.acao,
    a.tipo_objeto,
    a.contexto->>'codigo' AS codigo,
    count(*) AS registros
FROM dashboard_catalog.auditoria a
WHERE a.acao='vincular' AND a.tipo_objeto='dashboard'
GROUP BY a.acao,a.tipo_objeto,a.contexto->>'codigo'
ORDER BY codigo;

-- Resultado esperado apos vincular os dois dashboards pela interface:
-- duas linhas no segundo SELECT (visao-geral-chamadas, tma-tme-diario);
-- usuarios_autorizados = 0 em ambos;
-- pelo menos uma entrada 'vincular' para cada codigo.
-- O registro nao prova isoladamente que o gerente esta bloqueado:
-- testar a RPC autenticada como gerente e impedir acesso direto por URL.
