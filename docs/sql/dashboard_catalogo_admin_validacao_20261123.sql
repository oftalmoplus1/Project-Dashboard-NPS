-- CONSULTA SOMENTE LEITURA - executar ANTES e DEPOIS da instalacao.
-- Nao exibe nomes de usuarios, ligacoes, chaves nem registros operacionais.
-- ATENCAO: selecione o banco self-hosted da aplicacao antes de executar.

SELECT
 pg_catalog.to_regclass('dashboard_catalog.topicos') IS NOT NULL AS topicos_existem,
 pg_catalog.to_regclass('dashboard_catalog.dashboards') IS NOT NULL AS dashboards_existem,
 pg_catalog.to_regclass('dashboard_catalog.auditoria') IS NOT NULL AS auditoria_existe,
 pg_catalog.to_regprocedure('dashboard_catalog.vincular_dashboard_existente(text,text)') IS NOT NULL AS vinculacao_existente,
 pg_catalog.to_regprocedure('public.dashboard_catalogo_atualizar_topico(text,text)') IS NOT NULL AS api_edicao_instalada,
 pg_catalog.to_regprocedure('public.dashboard_catalogo_excluir_topico(text,text)') IS NOT NULL AS api_exclusao_instalada;

-- Executar somente se o schema ja existe.
SELECT
 t.slug, t.nome, t.posicao,
 (SELECT count(*) FROM dashboard_catalog.topico_dashboards td WHERE td.topico_id=t.id) AS vinculos,
 (SELECT count(*) FROM dashboard_catalog.acesso_topicos at WHERE at.topico_id=t.id) AS grants_topico,
 (SELECT count(*) FROM dashboard_catalog.acesso_dashboards ad WHERE ad.topico_id=t.id) AS grants_dashboard
FROM dashboard_catalog.topicos t ORDER BY t.posicao,t.slug;

-- Verificar quais dashboards estao catalogados (inclusive sem topico).
SELECT d.codigo,d.nome,d.estado,count(td.topico_id) AS topicos_associados
FROM dashboard_catalog.dashboards d
LEFT JOIN dashboard_catalog.topico_dashboards td ON td.dashboard_id=d.id
GROUP BY d.id,d.codigo,d.nome,d.estado
ORDER BY d.nome,d.codigo;

-- Executar somente DEPOIS de instalar as duas novas RPCs.
SELECT
 has_function_privilege('anon','public.dashboard_catalogo_atualizar_topico(text,text)','EXECUTE') AS anon_edita,
 has_function_privilege('authenticated','public.dashboard_catalogo_atualizar_topico(text,text)','EXECUTE') AS auth_edita,
 has_function_privilege('anon','public.dashboard_catalogo_excluir_topico(text,text)','EXECUTE') AS anon_exclui,
 has_function_privilege('authenticated','public.dashboard_catalogo_excluir_topico(text,text)','EXECUTE') AS auth_exclui;
-- Esperado: false, true, false, true.
-- Tambem testar em sessao real manager: ambas devem negar (SQLSTATE 42501).
-- A funcao de edicao, quando chamada com admin, gera auditoria e preserva slug.
-- A exclusao deve ser testada em topico descartavel em homologacao.
