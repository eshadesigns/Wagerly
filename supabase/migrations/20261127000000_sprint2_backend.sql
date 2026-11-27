ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'missed'));
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'pending_verification', 'verified'));
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;

REVOKE INSERT ON public.goals FROM authenticated;
GRANT INSERT (user_id, title, description, deadline) ON public.goals TO authenticated;
GRANT UPDATE (title, description) ON public.tasks TO authenticated;

CREATE TABLE IF NOT EXISTS public.partner_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  goal_title text NOT NULL,
  owner_email text NOT NULL,
  partner_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (goal_id, owner_id) REFERENCES public.goals (id, user_id) ON DELETE CASCADE,
  CHECK (partner_id <> owner_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_partner_per_goal
  ON public.partner_invitations (goal_id) WHERE status IN ('pending', 'accepted');

CREATE TABLE IF NOT EXISTS public.pacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  stake_type text NOT NULL CHECK (stake_type IN ('virtual_amount', 'custom_consequence')),
  virtual_amount numeric(10,2) CHECK (virtual_amount > 0 AND virtual_amount <= 1000000),
  consequence text CHECK (char_length(btrim(consequence)) BETWEEN 1 AND 500),
  deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'honored', 'forfeited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (goal_id, user_id) REFERENCES public.goals (id, user_id) ON DELETE CASCADE,
  CHECK (
    (stake_type = 'virtual_amount' AND virtual_amount IS NOT NULL AND consequence IS NULL)
    OR (stake_type = 'custom_consequence' AND consequence IS NOT NULL AND virtual_amount IS NULL)
  )
);

ALTER TABLE public.partner_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitations_select ON public.partner_invitations;
CREATE POLICY invitations_select ON public.partner_invitations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (owner_id, partner_id));

DROP POLICY IF EXISTS invitations_respond ON public.partner_invitations;
CREATE POLICY invitations_respond ON public.partner_invitations
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = partner_id AND status = 'pending')
  WITH CHECK ((SELECT auth.uid()) = partner_id AND status IN ('accepted', 'declined'));

DROP POLICY IF EXISTS goals_select_partner ON public.goals;
CREATE POLICY goals_select_partner ON public.goals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.partner_invitations
    WHERE goal_id = goals.id AND partner_id = (SELECT auth.uid()) AND status = 'accepted'
  ));

DROP POLICY IF EXISTS tasks_select_partner ON public.tasks;
CREATE POLICY tasks_select_partner ON public.tasks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.partner_invitations
    WHERE goal_id = tasks.goal_id AND partner_id = (SELECT auth.uid()) AND status = 'accepted'
  ));

DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
CREATE POLICY tasks_update_own ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND status = 'incomplete'
    AND EXISTS (SELECT 1 FROM public.goals WHERE goals.id = tasks.goal_id AND goals.status = 'active')
  )
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS pacts_select ON public.pacts;
CREATE POLICY pacts_select ON public.pacts
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (user_id, partner_id));

DROP POLICY IF EXISTS pacts_insert ON public.pacts;
CREATE POLICY pacts_insert ON public.pacts
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.partner_invitations
      WHERE goal_id = pacts.goal_id AND partner_id = pacts.partner_id AND status = 'accepted'
    )
  );

REVOKE ALL ON public.partner_invitations, public.pacts FROM anon, authenticated;
GRANT SELECT ON public.partner_invitations, public.pacts TO authenticated;
GRANT UPDATE (status) ON public.partner_invitations TO authenticated;
GRANT INSERT (goal_id, user_id, partner_id, stake_type, virtual_amount, consequence, deadline) ON public.pacts TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_goal_outcomes()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g record;
  total integer;
  verified integer;
  pending integer;
  outcome text;
BEGIN
  FOR g IN
    SELECT id, deadline FROM public.goals
    WHERE status = 'active'
    AND (user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.partner_invitations
      WHERE goal_id = goals.id AND partner_id = auth.uid() AND status = 'accepted'
    ))
  LOOP
    SELECT count(*),
           count(*) FILTER (WHERE status = 'verified'),
           count(*) FILTER (WHERE status = 'pending_verification')
    INTO total, verified, pending
    FROM public.tasks WHERE goal_id = g.id;

    outcome := NULL;
    IF total > 0 AND verified = total THEN
      outcome := 'completed';
    ELSIF now() > g.deadline AND (total = 0 OR total - verified - pending > 0) THEN
      outcome := 'missed';
    END IF;

    IF outcome IS NOT NULL THEN
      UPDATE public.goals SET status = outcome, resolved_at = now() WHERE id = g.id;
      UPDATE public.pacts
      SET status = CASE WHEN outcome = 'completed' THEN 'honored' ELSE 'forfeited' END
      WHERE goal_id = g.id AND status = 'active';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_partner(p_goal_id uuid, p_email text)
RETURNS public.partner_invitations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  goal public.goals%ROWTYPE;
  partner auth.users%ROWTYPE;
  owner_email text;
  invitation public.partner_invitations%ROWTYPE;
BEGIN
  PERFORM public.refresh_goal_outcomes();

  SELECT * INTO goal FROM public.goals WHERE id = p_goal_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GOAL_NOT_FOUND';
  END IF;
  IF goal.status <> 'active' THEN
    RAISE EXCEPTION 'GOAL_CLOSED';
  END IF;

  SELECT * INTO partner FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARTNER_NOT_FOUND';
  END IF;
  IF partner.id = auth.uid() THEN
    RAISE EXCEPTION 'CANNOT_INVITE_SELF';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.partner_invitations
    WHERE goal_id = p_goal_id AND status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'INVITATION_EXISTS';
  END IF;

  SELECT email INTO owner_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.partner_invitations (goal_id, owner_id, partner_id, goal_title, owner_email, partner_email)
  VALUES (p_goal_id, auth.uid(), partner.id, goal.title, owner_email, partner.email)
  RETURNING * INTO invitation;

  RETURN invitation;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_task(p_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task public.tasks%ROWTYPE;
  has_partner boolean;
BEGIN
  SELECT * INTO task FROM public.tasks WHERE id = p_task_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  PERFORM public.refresh_goal_outcomes();
  IF (SELECT status FROM public.goals WHERE id = task.goal_id) <> 'active' THEN
    RAISE EXCEPTION 'GOAL_CLOSED';
  END IF;

  IF task.status <> 'incomplete' THEN
    RETURN task;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.partner_invitations
    WHERE goal_id = task.goal_id AND status = 'accepted'
  ) INTO has_partner;

  UPDATE public.tasks
  SET status = CASE WHEN has_partner THEN 'pending_verification' ELSE 'verified' END,
      completed_at = now()
  WHERE id = p_task_id AND status = 'incomplete'
  RETURNING * INTO task;

  PERFORM public.refresh_goal_outcomes();
  RETURN task;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_task(p_task_id uuid, p_approve boolean)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.partner_invitations
    WHERE goal_id = task.goal_id AND partner_id = auth.uid() AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'NOT_ASSIGNED_PARTNER';
  END IF;

  PERFORM public.refresh_goal_outcomes();
  IF (SELECT status FROM public.goals WHERE id = task.goal_id) <> 'active' THEN
    RAISE EXCEPTION 'GOAL_CLOSED';
  END IF;
  IF task.status <> 'pending_verification' THEN
    RAISE EXCEPTION 'TASK_NOT_PENDING';
  END IF;

  IF p_approve THEN
    UPDATE public.tasks SET status = 'verified' WHERE id = p_task_id RETURNING * INTO task;
  ELSE
    UPDATE public.tasks SET status = 'incomplete', completed_at = NULL WHERE id = p_task_id RETURNING * INTO task;
  END IF;

  PERFORM public.refresh_goal_outcomes();
  RETURN task;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_goal_outcomes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invite_partner(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_task(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_task(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_goal_outcomes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_partner(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_task(uuid, boolean) TO authenticated;