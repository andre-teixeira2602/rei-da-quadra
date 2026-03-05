-- Criar RPC para usuário entrar em uma quadra
-- Insere registro em court_members e cria registros em category_members para todas as categorias

CREATE OR REPLACE FUNCTION public.join_court(p_court_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_court_exists BOOLEAN;
  v_already_member BOOLEAN;
  v_categories_count INT;
  v_joined_count INT;
BEGIN
  -- Obter ID do usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'not_authenticated');
  END IF;

  -- Verificar se a quadra existe e está ativa
  SELECT EXISTS(SELECT 1 FROM courts WHERE id = p_court_id AND is_active = TRUE)
  INTO v_court_exists;
  
  IF NOT v_court_exists THEN
    RETURN json_build_object('success', FALSE, 'error', 'court_not_found');
  END IF;

  -- Verificar se o usuário já é membro da quadra
  SELECT EXISTS(SELECT 1 FROM court_members WHERE court_id = p_court_id AND user_id = v_user_id)
  INTO v_already_member;
  
  IF v_already_member THEN
    RETURN json_build_object('success', FALSE, 'error', 'already_member');
  END IF;

  -- Inserir usuário em court_members
  INSERT INTO court_members (court_id, user_id, joined_at)
  VALUES (p_court_id, v_user_id, NOW())
  ON CONFLICT DO NOTHING;

  -- Contar categorias da quadra
  SELECT COUNT(*) INTO v_categories_count
  FROM categories
  WHERE is_active = TRUE;

  -- Inserir usuário em todas as categorias da quadra
  INSERT INTO category_members (category_id, user_id, court_id, rank_position, joined_at)
  SELECT c.id, v_user_id, p_court_id, NULL, NOW()
  FROM categories c
  WHERE c.is_active = TRUE
  ON CONFLICT (category_id, user_id, court_id) DO NOTHING;

  GET DIAGNOSTICS v_joined_count = ROW_COUNT;

  RETURN json_build_object(
    'success', TRUE,
    'message', 'Bem-vindo à quadra!',
    'categories_joined', v_joined_count
  );
END;
$$;

-- Conceder permissão para usuários autenticados
GRANT EXECUTE ON FUNCTION public.join_court(UUID) TO authenticated;

-- Comentário da função
COMMENT ON FUNCTION public.join_court(UUID) IS 'Permite que um usuário autenticado entre em uma quadra, criando registros em court_members e category_members para todas as categorias ativas.';
