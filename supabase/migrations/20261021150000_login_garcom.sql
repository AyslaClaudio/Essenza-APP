ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS login text;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_login_unique ON public.usuarios (lower(login)) WHERE login IS NOT NULL;
