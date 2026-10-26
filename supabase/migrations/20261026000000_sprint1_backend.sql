CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goals_id_user_id_unique UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 1000),
  display_order integer NOT NULL CHECK (display_order BETWEEN 1 AND 7),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_goal_user_fk
    FOREIGN KEY (goal_id, user_id)
    REFERENCES public.goals (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT tasks_goal_display_order_unique UNIQUE (goal_id, display_order)
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goals_select_own ON public.goals;
CREATE POLICY goals_select_own ON public.goals
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS goals_insert_own ON public.goals;
CREATE POLICY goals_insert_own ON public.goals
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
CREATE POLICY tasks_select_own ON public.tasks
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.goals FROM anon, authenticated;
REVOKE ALL ON public.tasks FROM anon, authenticated;
GRANT SELECT, INSERT ON public.goals TO authenticated;
GRANT SELECT ON public.tasks TO authenticated;

CREATE OR REPLACE FUNCTION public.create_goal_tasks(p_goal_id uuid, p_tasks jsonb)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_task jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_tasks IS NULL OR jsonb_typeof(p_tasks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TASK_BATCH';
  END IF;

  IF jsonb_array_length(p_tasks) NOT BETWEEN 3 AND 7 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TASK_BATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.goals AS g
    WHERE g.id = p_goal_id
      AND g.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'GOAL_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('wagerly:goal-tasks:' || p_goal_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.tasks AS t
    WHERE t.goal_id = p_goal_id
      AND t.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TASKS_ALREADY_GENERATED';
  END IF;

  FOR v_task IN SELECT value FROM jsonb_array_elements(p_tasks)
  LOOP
    IF jsonb_typeof(v_task) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_task -> 'title') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_task -> 'description') IS DISTINCT FROM 'string'
       OR char_length(btrim(v_task ->> 'title')) NOT BETWEEN 1 AND 120
       OR char_length(btrim(v_task ->> 'description')) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TASK';
    END IF;
  END LOOP;

  RETURN QUERY
    INSERT INTO public.tasks (goal_id, user_id, title, description, display_order)
    SELECT
      p_goal_id,
      v_user_id,
      btrim(item.value ->> 'title'),
      btrim(item.value ->> 'description'),
      item.ordinality::integer
    FROM jsonb_array_elements(p_tasks) WITH ORDINALITY AS item(value, ordinality)
    RETURNING *;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_goal_tasks(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_goal_tasks(uuid, jsonb) TO authenticated;
